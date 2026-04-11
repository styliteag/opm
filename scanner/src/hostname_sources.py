"""Reverse-IP hostname discovery sources owned by the scanner.

Hosts the source classes that talk to external reverse-IP providers
(HackerTarget, RapidDNS). The scanner is the only egress point for
these APIs in the post-2.3.0 architecture; the backend keeps the
cache + budget counters but never makes outbound calls itself.

This module is intentionally a near-copy of the backend's
``app.services.hostname_lookup`` source classes, with two
adjustments:

1. **Sync, not async** — the scanner runs sync code throughout, so
   the ``fetch`` methods return ``HostnameLookupResult`` directly
   instead of coroutines. Backend uses ``httpx.AsyncClient``; the
   scanner uses ``httpx.Client``.
2. **No DB awareness** — these classes know nothing about budgets,
   caches, or sessions. The orchestrator (``hostname_enrichment.py``)
   is responsible for the pre-flight ``GET /hostname-budget`` call
   and the post-fact ``POST /hostname-results`` upload.

Once Commit 10 deletes the backend filler, the corresponding classes
in ``backend/src/app/services/hostname_lookup.py`` go away too. Until
then both copies coexist so the rollback path stays open.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from typing import Literal, Protocol

import httpx

logger = logging.getLogger(__name__)

# --- Constants --------------------------------------------------------

# HackerTarget /reverseiplookup/ free-tier rate limits (from the
# provider's docs): 50 req/day for anonymous free users, 100 req/day
# with a free API key, throttled to max 2 req/s, returns HTTP 429 when
# either limit is exceeded.
HACKERTARGET_DAILY_LIMIT_ANON = 50
HACKERTARGET_DAILY_LIMIT_WITH_KEY = 100
HACKERTARGET_MIN_REQUEST_INTERVAL_S = 0.6  # stay under 2 req/s with headroom
HACKERTARGET_URL = "https://api.hackertarget.com/reverseiplookup/"
HACKERTARGET_TIMEOUT_S = 15.0

# RapidDNS /sameip/ — fallback source when HackerTarget is exhausted
# or fails. Rate limit is not publicly documented; the default 100/day
# is a conservative guess. Interval throttle matches HackerTarget's
# conservative 2 req/s ceiling.
RAPIDDNS_DEFAULT_DAILY_LIMIT = 100
RAPIDDNS_MIN_REQUEST_INTERVAL_S = 0.6
RAPIDDNS_URL_TEMPLATE = "https://rapiddns.io/sameip/{ip}"
RAPIDDNS_TIMEOUT_S = 20.0
# Plain browser UA — rapiddns serves the same HTML either way in
# practice, but some CDN rules will flag missing UAs as bots.
RAPIDDNS_USER_AGENT = (
    "Mozilla/5.0 (OPM Hostname Cache) AppleWebKit/537.36 (KHTML, like Gecko)"
)
# Regex to pluck hostname strings out of the results table cells. The
# page structure is `<td>hostname</td><td>A-record</td><td>...</td>`
# repeated per row; we extract candidates then filter to valid-looking
# FQDNs. Intentionally greedy + validated downstream rather than
# pulling in BeautifulSoup for a single parser.
_RAPIDDNS_TD_RE = re.compile(r"<td>([^<]{1,253})</td>", re.IGNORECASE)
_FQDN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$",
    re.IGNORECASE,
)

LookupStatus = Literal["success", "no_results", "failed"]


# --- Source protocol + result ----------------------------------------


@dataclass(frozen=True)
class HostnameLookupResult:
    """Immutable outcome of a single source fetch.

    ``hostnames`` is always a list (empty on no_results / failed) so
    the caller never has to deal with Optional semantics.
    ``error_message`` is bounded to 500 chars by the source so it can
    be persisted to the backend ``error_message`` TEXT column without
    bloat.
    """

    status: LookupStatus
    hostnames: list[str]
    error_message: str | None = None


class HostnameLookupSource(Protocol):
    """Pluggable reverse-IP hostname discovery source.

    Implementations should catch all transport errors and return a
    ``failed`` result rather than raising — the orchestrator assumes
    ``fetch`` is exception-free so cache + budget bookkeeping stays
    simple.
    """

    name: str

    def fetch(self, ip: str) -> HostnameLookupResult: ...


# --- HackerTarget implementation -------------------------------------


class HackerTargetSource:
    """Reverse-IP lookup via HackerTarget's ``/reverseiplookup/`` endpoint.

    Free tier: 50 req/day anonymous, 100 req/day with a free API key.
    The budget counter lives in the backend (the
    ``hostname_lookup_budget`` table); this source only reports
    success / no_results / failed per call. The orchestrator handles
    the pre-flight budget check and the post-fact bookkeeping.

    Parsing rules (determined empirically against the real endpoint):
    - Empty body → ``no_results``
    - Body starts with ``error`` → ``failed`` (transient API issue)
    - Body contains ``API count exceeded`` → ``failed`` with a
      recognisable error_message so the orchestrator can pin the
      backend budget
    - Body starts with ``No DNS`` or ``No records`` → ``no_results``
    - Otherwise: newline-split list of hostnames, stripped, deduped
      (preserving order), IP-literal lines filtered out
    """

    name = "hackertarget"

    def __init__(
        self,
        api_key: str | None = None,
        timeout: float = HACKERTARGET_TIMEOUT_S,
    ) -> None:
        self._api_key = api_key
        self._timeout = timeout

    def fetch(self, ip: str) -> HostnameLookupResult:
        try:
            text = self._fetch_text(ip)
        except httpx.HTTPStatusError as exc:
            # HackerTarget returns 429 when the daily-50 or 2-req/s
            # limits are exceeded. Signal this with the same marker
            # that the 200-body "API count exceeded" path uses so the
            # orchestrator's budget-pinning logic can catch both.
            if exc.response.status_code == 429:
                return HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP 429: API count exceeded",
                )
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message=f"HTTP {exc.response.status_code}: {exc}"[:500],
            )
        except httpx.HTTPError as exc:
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message=f"HTTP error: {exc}"[:500],
            )
        return self.parse(text)

    def _fetch_text(self, ip: str) -> str:
        """Perform the HTTP call and return the raw body text.

        Split out as a separate method so tests can subclass the source
        and override just the transport without having to mock httpx.
        Raises ``httpx.HTTPStatusError`` on non-2xx responses so the
        ``fetch`` wrapper can pick out 429 as a rate-limit signal.
        """
        params: dict[str, str] = {"q": ip}
        if self._api_key:
            params["apikey"] = self._api_key
        with httpx.Client(timeout=self._timeout) as client:
            response = client.get(HACKERTARGET_URL, params=params)
            response.raise_for_status()
            return response.text

    @staticmethod
    def parse(text: str) -> HostnameLookupResult:
        """Classify a HackerTarget response body into a lookup result."""
        stripped = text.strip()
        if not stripped:
            return HostnameLookupResult(status="no_results", hostnames=[])

        lowered = stripped.lower()
        if "api count exceeded" in lowered:
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message=stripped[:500],
            )
        if lowered.startswith("error"):
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message=stripped[:500],
            )
        if lowered.startswith("no dns") or "no records" in lowered:
            return HostnameLookupResult(status="no_results", hostnames=[])

        seen: dict[str, None] = {}  # preserves insertion order, dedupe
        for line in stripped.splitlines():
            candidate = line.strip()
            if not candidate or _is_probably_ipv4(candidate):
                continue
            seen.setdefault(candidate, None)

        if not seen:
            return HostnameLookupResult(status="no_results", hostnames=[])
        return HostnameLookupResult(
            status="success",
            hostnames=list(seen.keys()),
        )


def _is_probably_ipv4(value: str) -> bool:
    """Cheap IPv4 literal check — skip lines that are the IP echoed back."""
    parts = value.split(".")
    if len(parts) != 4:
        return False
    try:
        return all(0 <= int(p) <= 255 for p in parts)
    except ValueError:
        return False


# --- RapidDNS implementation -----------------------------------------


class RapidDnsSource:
    """Reverse-IP lookup via rapiddns.io's ``/sameip/<ip>`` HTML page.

    Used as the fallback source when HackerTarget's daily budget is
    exhausted or it throws 429. Parsing is regex-based — rapiddns's
    layout is a plain ``<td>hostname</td>`` table with deterministic
    structure, so pulling in BeautifulSoup for a single call site
    would be overkill.

    Rate limit policy: rapiddns doesn't publish one. We default to
    100 req/day and a 2 req/s throttle (same shape as HackerTarget)
    and treat HTTP 429 or an obviously-blocked response (very short
    body or Cloudflare challenge markers) as a pin-budget signal.
    """

    name = "rapiddns"

    def __init__(self, timeout: float = RAPIDDNS_TIMEOUT_S) -> None:
        self._timeout = timeout

    def fetch(self, ip: str) -> HostnameLookupResult:
        try:
            text = self._fetch_text(ip)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                return HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP 429: API count exceeded",
                )
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message=f"HTTP {exc.response.status_code}: {exc}"[:500],
            )
        except httpx.HTTPError as exc:
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message=f"HTTP error: {exc}"[:500],
            )
        return self.parse(text)

    def _fetch_text(self, ip: str) -> str:
        """HTTP GET against rapiddns.io; split out for easy test stubs."""
        url = RAPIDDNS_URL_TEMPLATE.format(ip=ip)
        with httpx.Client(
            timeout=self._timeout,
            headers={"User-Agent": RAPIDDNS_USER_AGENT},
            follow_redirects=True,
        ) as client:
            response = client.get(url, params={"full": "1"})
            response.raise_for_status()
            return response.text

    @staticmethod
    def parse(text: str) -> HostnameLookupResult:
        """Classify a rapiddns HTML body into a lookup result.

        Signals we distinguish:
        - Empty / tiny body → ``no_results`` (rapiddns returned a stub)
        - Body contains a Cloudflare challenge marker → ``failed`` with
          a recognisable API-count-exceeded error message so the
          orchestrator pins the budget
        - Otherwise: extract ``<td>...</td>`` cells, filter to valid
          FQDNs, dedupe. Empty list → ``no_results``. Non-empty →
          ``success``.
        """
        if not text or len(text) < 100:
            return HostnameLookupResult(status="no_results", hostnames=[])

        lowered = text.lower()
        if "challenge-platform" in lowered or "cf-browser-verification" in lowered:
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="rapiddns: Cloudflare challenge — API count exceeded",
            )
        if "captcha" in lowered and "<td>" not in lowered:
            return HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="rapiddns: captcha page — API count exceeded",
            )

        seen: dict[str, None] = {}
        for candidate in _RAPIDDNS_TD_RE.findall(text):
            stripped = candidate.strip()
            if not stripped or _is_probably_ipv4(stripped):
                continue
            if not _FQDN_RE.match(stripped):
                continue
            seen.setdefault(stripped.lower(), None)

        if not seen:
            return HostnameLookupResult(status="no_results", hostnames=[])
        return HostnameLookupResult(
            status="success",
            hostnames=list(seen.keys()),
        )
