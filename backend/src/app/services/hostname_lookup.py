"""Hostname lookup cache service — reverse-IP hostname discovery.

Cache-first reverse-IP hostname discovery for SNI-aware nuclei scans.
The service layer owns three concerns:

1. **Pluggable sources** — ``HostnameLookupSource`` is a ``Protocol``
   so Commit 5 can add RapidDNS / Shodan paid / ViewDNS backends
   without touching the cache or budget code. ``HackerTargetSource`` is
   the only shipped implementation today and exactly mirrors the URL
   already used by ``scanner/src/hostname_enrichment.py``.

2. **Cache** — ``get_cached_hostnames`` / ``upsert_cache_row`` read and
   write the ``hostname_lookup_cache`` table from migration 014. Rows
   carry a per-outcome TTL (long for success, medium for no_results,
   short for failed) so a flaky source retries relatively soon while
   stable data stays cached for weeks. ``get_cached_hostnames`` returns
   ``None`` for failed rows so callers retry instead of cache-blocking
   on a transient outage.

3. **Daily budget** — ``consume_budget`` atomically increments a per
   source/day counter backed by ``hostname_lookup_budget``. ``pin_budget_
   exhausted`` is called when the source itself reports its rate limit
   exceeded (``"API count exceeded"`` from HackerTarget) so a clock-skew
   or backend restart can't cause us to burn through the source's real
   limit. The filler job is single-instance (``APScheduler
   max_instances=1``) so naive read-modify-write is race-free; if we
   ever parallelise the filler we'll need a row lock.

The top-level ``lookup_with_cache(db, source, ip, daily_limit)`` glues
all three together. It never raises on source failure — errors are
persisted with a short TTL and an empty list is returned.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal, Protocol

import httpx
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import (
    HostnameLookup,
    HostnameLookupBudget,
    HostnameLookupQueueEntry,
)

logger = logging.getLogger(__name__)

# --- Constants --------------------------------------------------------

# Per-outcome TTL. Short retry for failed (could be transient),
# medium for no_results (shared-hosting IPs without vhosts are rare but
# do exist), long for success (vhost lists change slowly).
TTL_SUCCESS_DAYS = 30
TTL_NO_RESULTS_DAYS = 7
TTL_FAILED_DAYS = 3

# Stuck-claim sweep: a row stays in 'claimed' for at most this long
# before the next read re-queues it. Tuned to comfortably exceed the
# scanner's worst-case enrichment runtime (HackerTarget + RapidDNS +
# crt.sh) for a single IP, while still recovering quickly enough that
# a crashed scanner doesn't strand a manual refresh request.
QUEUE_STUCK_CLAIM_AFTER = timedelta(hours=1)

# Lazy GC retention for terminal queue rows. Completed / failed rows
# linger as an audit trail then get deleted on the next read. Short
# enough to keep the table tiny, long enough that operators can spot
# "the refresh I clicked yesterday came back failed".
QUEUE_TERMINAL_RETENTION = timedelta(days=7)

# Manual edits (admin UI → PUT /entries/{ip}) use a long TTL so the
# filler doesn't immediately overwrite a hand-curated list on the next
# hourly pass. 8 weeks is long enough to survive many automatic
# refresh cycles but still expires eventually so stale hand-edits
# don't pin a row forever — operator can always re-edit if they want.
MANUAL_EDIT_TTL_DAYS = 56

# Source name reserved for admin-edited rows. Kept distinct from the
# reverse-IP source names so the UI can render a "MANUAL" badge.
MANUAL_SOURCE_NAME = "manual"

# HackerTarget /reverseiplookup/ free-tier rate limits (from the
# provider's docs, 2026-04): 50 req/day for anonymous free users,
# throttled to max 2 req/s, returns HTTP 429 when either limit is
# exceeded. The caller passes the desired cap to the service; we just
# enforce the count and detect 429 as a "pin budget" signal.
HACKERTARGET_DAILY_LIMIT_ANON = 50
HACKERTARGET_DAILY_LIMIT_WITH_KEY = 100
HACKERTARGET_MIN_REQUEST_INTERVAL_S = 0.6  # stay under 2 req/s with headroom
HACKERTARGET_URL = "https://api.hackertarget.com/reverseiplookup/"
HACKERTARGET_TIMEOUT_S = 15.0

# RapidDNS /sameip/ — fallback source when HackerTarget is exhausted
# or fails. Rate limit is not publicly documented; the default 100/day
# is a conservative guess and can be overridden via settings. Interval
# throttle matches HackerTarget's conservative 2 req/s ceiling.
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

    ``hostnames`` is always a list (empty on no_results / failed) so the
    caller never has to deal with Optional semantics. ``error_message``
    is bounded to 500 chars by the source so we can persist it to the
    ``error_message`` TEXT column without worrying about bloat.
    """

    status: LookupStatus
    hostnames: list[str]
    error_message: str | None = None


class HostnameLookupSource(Protocol):
    """Pluggable reverse-IP hostname discovery source.

    Implementations should catch all transport errors and return a
    ``failed`` result rather than raising — the service layer assumes
    ``fetch`` is exception-free to keep cache bookkeeping simple.
    """

    name: str

    async def fetch(self, ip: str) -> HostnameLookupResult: ...


# --- HackerTarget implementation -------------------------------------


class HackerTargetSource:
    """Reverse-IP lookup via HackerTarget's ``/reverseiplookup/`` endpoint.

    Free tier: 20 req/day anonymous, 100 req/day with a free API key.
    The budget counter lives outside this class in the service layer;
    this source only reports success/no_results/failed per call.

    Parsing rules (determined empirically against the real endpoint):
    - Empty body → ``no_results``
    - Body starts with ``error`` → ``failed`` (transient API issue)
    - Body contains ``API count exceeded`` → ``failed`` with a
      recognisable error_message so the caller can pin the budget
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

    async def fetch(self, ip: str) -> HostnameLookupResult:
        try:
            text = await self._fetch_text(ip)
        except httpx.HTTPStatusError as exc:
            # HackerTarget returns 429 when the daily-50 or 2-req/s
            # limits are exceeded. Signal this with the same marker
            # that the 200-body "API count exceeded" path uses so the
            # service layer's budget-pinning logic can catch both.
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

    async def _fetch_text(self, ip: str) -> str:
        """Perform the HTTP call and return the raw body text.

        Split out as a separate method so tests can subclass the source
        and override just the transport without having to mock httpx.
        Raises ``httpx.HTTPStatusError`` on non-2xx responses so the
        ``fetch`` wrapper can pick out 429 as a rate-limit signal.
        """
        params: dict[str, str] = {"q": ip}
        if self._api_key:
            params["apikey"] = self._api_key
        async with httpx.AsyncClient(timeout=self._timeout) as client:
            response = await client.get(HACKERTARGET_URL, params=params)
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


class RapidDnsSource:
    """Reverse-IP lookup via rapiddns.io's ``/sameip/<ip>`` HTML page.

    Used as the fallback source when HackerTarget's daily budget is
    exhausted or it throws 429. Parsing is regex-based — rapiddns's
    layout is a plain ``<td>hostname</td>`` table with deterministic
    structure, so pulling in BeautifulSoup for a single call site
    would be overkill.

    Rate limit policy: rapiddns doesn't publish one. We default to 100
    req/day and a 2 req/s throttle (same shape as HackerTarget) and
    treat HTTP 429 or an obviously-blocked response (very short body
    or Cloudflare challenge markers) as a pin-budget signal.
    """

    name = "rapiddns"

    def __init__(self, timeout: float = RAPIDDNS_TIMEOUT_S) -> None:
        self._timeout = timeout

    async def fetch(self, ip: str) -> HostnameLookupResult:
        try:
            text = await self._fetch_text(ip)
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

    async def _fetch_text(self, ip: str) -> str:
        """HTTP GET against rapiddns.io; split out for easy test stubs."""
        url = RAPIDDNS_URL_TEMPLATE.format(ip=ip)
        async with httpx.AsyncClient(
            timeout=self._timeout,
            headers={"User-Agent": RAPIDDNS_USER_AGENT},
            follow_redirects=True,
        ) as client:
            response = await client.get(url, params={"full": "1"})
            response.raise_for_status()
            return response.text

    @staticmethod
    def parse(text: str) -> HostnameLookupResult:
        """Classify a rapiddns HTML body into a lookup result.

        Signals we distinguish:
        - Empty / tiny body → ``no_results`` (rapiddns returned a stub)
        - Body contains a Cloudflare challenge marker → ``failed`` with
          a recognisable API-count-exceeded error message so the caller
          pins the budget
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


# --- Cache read/write ------------------------------------------------


def _now() -> datetime:
    """Naive UTC ``datetime`` — matches MariaDB DATETIME storage.

    MariaDB's ``DATETIME`` column type is naive (no tzinfo). SQLAlchemy
    round-trips those columns as naive Python ``datetime`` objects, so
    the service layer also works in naive UTC to avoid the "can't
    compare offset-naive and offset-aware datetimes" trap.
    """
    return datetime.utcnow()


def _ttl_for_status(status: LookupStatus) -> timedelta:
    if status == "success":
        return timedelta(days=TTL_SUCCESS_DAYS)
    if status == "no_results":
        return timedelta(days=TTL_NO_RESULTS_DAYS)
    return timedelta(days=TTL_FAILED_DAYS)


async def get_cached_hostnames(db: AsyncSession, ip: str) -> list[str] | None:
    """Return cached hostnames for an IP if the row is fresh.

    Semantics:
    - Non-empty list → fresh ``success`` cache entry with hostnames
    - Empty list → fresh ``no_results`` cache entry (don't call source)
    - ``None`` → cache miss, expired row, or stored ``failed`` (retry)

    Failed rows map to ``None`` instead of ``[]`` so callers treat them
    as a miss and retry via ``lookup_with_cache``; we don't want a
    single bad day to hide every IP's real hostnames for a full TTL.
    """
    row = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.expires_at <= _now():
        return None
    if row.status == "failed":
        return None
    return list(row.hostnames_json or [])


async def get_hostnames_for_ips(
    db: AsyncSession, ips: list[str]
) -> dict[str, list[str]]:
    """Bulk cache read — return fresh cached hostnames for a set of IPs.

    Skips expired rows and ``failed`` rows (both serve as "no cached
    answer"). Empty lists are **omitted** from the result so the caller
    can distinguish "cache hit with zero vhosts" from "we haven't
    looked this IP up yet" by checking dict membership.

    Used by the scanner hostnames endpoint (``GET /api/scanner/hostnames``)
    to prime nuclei's SNI fan-out targets right before the nuclei phase.
    """
    if not ips:
        return {}

    now = _now()
    rows = (
        (
            await db.execute(
                select(HostnameLookup).where(
                    HostnameLookup.ip.in_(ips),
                    HostnameLookup.expires_at > now,
                    HostnameLookup.status != "failed",
                )
            )
        )
        .scalars()
        .all()
    )
    result: dict[str, list[str]] = {}
    for row in rows:
        names = list(row.hostnames_json or [])
        if names:
            result[row.ip] = names
    return result


async def get_cache_row_for_ip(
    db: AsyncSession, ip: str
) -> HostnameLookup | None:
    """Return the raw cache row for an IP, or ``None`` if no row exists.

    Unlike :func:`get_cached_hostnames`, this returns the full row
    (including expired or failed) so callers can display row metadata
    like source and ``queried_at`` — for the host detail page's
    "Known Hostnames" panel, stale rows should still be visible so
    the operator knows a refresh is due. Caller decides how to handle
    expiry.
    """
    return (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()


async def update_cache_entry_manual(
    db: AsyncSession,
    ip: str,
    hostnames: list[str],
) -> HostnameLookup:
    """Admin hand-edit of a cache row — upsert with ``source='manual'``.

    Writes (or replaces) the row for ``ip`` using a long 8-week TTL so
    the filler won't overwrite it on its next hourly pass. The status
    is derived from the hostname list: non-empty → ``success``, empty
    → ``no_results`` (operator explicitly asserting "this IP serves
    nothing worth scanning").

    Hostnames are trimmed + deduped case-insensitively before storage.
    """
    now = _now()
    normalized: dict[str, None] = {}
    for entry in hostnames:
        stripped = entry.strip()
        if stripped:
            normalized.setdefault(stripped.lower(), None)
    clean = list(normalized.keys())

    status: LookupStatus = "success" if clean else "no_results"
    expires = now + timedelta(days=MANUAL_EDIT_TTL_DAYS)

    existing = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()

    if existing is None:
        row = HostnameLookup(
            ip=ip,
            hostnames_json=clean,
            source=MANUAL_SOURCE_NAME,
            status=status,
            queried_at=now,
            expires_at=expires,
            error_message=None,
        )
        db.add(row)
        await db.flush()
        return row

    existing.hostnames_json = clean
    existing.source = MANUAL_SOURCE_NAME
    existing.status = status
    existing.queried_at = now
    existing.expires_at = expires
    existing.error_message = None
    await db.flush()
    return existing


async def delete_cache_entry(db: AsyncSession, ip: str) -> bool:
    """Drop the cache row for ``ip`` if it exists.

    Returns ``True`` when a row was deleted, ``False`` on miss. Used
    by the admin UI's delete action and for clearing junk cached data
    (e.g. a bad rapiddns row).
    """
    existing = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()
    if existing is None:
        return False
    await db.delete(existing)
    await db.flush()
    return True


async def upsert_cache_row(
    db: AsyncSession,
    ip: str,
    result: HostnameLookupResult,
    source: str,
) -> HostnameLookup:
    """Insert or overwrite the cache row for an IP.

    One row per IP (``ip`` is the unique key in migration 014), so the
    most recent lookup wins. ``expires_at`` is computed here from the
    result status to keep the TTL policy in one place.
    """
    now = _now()
    expires = now + _ttl_for_status(result.status)

    existing = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()

    if existing is None:
        row = HostnameLookup(
            ip=ip,
            hostnames_json=list(result.hostnames),
            source=source,
            status=result.status,
            queried_at=now,
            expires_at=expires,
            error_message=result.error_message,
        )
        db.add(row)
        await db.flush()
        return row

    existing.hostnames_json = list(result.hostnames)
    existing.source = source
    existing.status = result.status
    existing.queried_at = now
    existing.expires_at = expires
    existing.error_message = result.error_message
    await db.flush()
    return existing


# --- Budget ----------------------------------------------------------


async def _get_or_create_budget_row(
    db: AsyncSession, source: str
) -> HostnameLookupBudget:
    """Find today's budget row for a source or create a fresh zero row."""
    today = _now().date()
    row = (
        await db.execute(
            select(HostnameLookupBudget)
            .where(HostnameLookupBudget.source == source)
            .where(HostnameLookupBudget.day == today)
        )
    ).scalar_one_or_none()
    if row is None:
        row = HostnameLookupBudget(source=source, day=today, used=0)
        db.add(row)
        await db.flush()
    return row


async def get_budget_used(db: AsyncSession, source: str) -> int:
    """Return the number of API calls consumed today for a source."""
    row = await _get_or_create_budget_row(db, source)
    return int(row.used)


async def consume_budget(
    db: AsyncSession, source: str, daily_limit: int
) -> bool:
    """Atomically consume one budget unit; return False if exhausted.

    Single-statement read-modify-write inside the caller's session. Safe
    under APScheduler's ``max_instances=1`` filler-job assumption. Do not
    call this from parallel workers without adding a row-level lock.
    """
    if daily_limit <= 0:
        return False
    row = await _get_or_create_budget_row(db, source)
    if row.used >= daily_limit:
        return False
    row.used += 1
    await db.flush()
    return True


async def pin_budget_exhausted(
    db: AsyncSession, source: str, daily_limit: int
) -> None:
    """Set today's budget to the daily limit.

    Triggered when the source itself reports its rate limit exceeded
    (e.g. HackerTarget returns ``"API count exceeded"`` even though our
    counter still had capacity). Most commonly happens after a backend
    restart that wiped the in-flight budget row before midnight. Pinning
    stops the filler from hammering the source for the rest of the day;
    a fresh row materialises at UTC midnight.
    """
    row = await _get_or_create_budget_row(db, source)
    if row.used < daily_limit:
        row.used = daily_limit
        await db.flush()


# --- High-level cache-first lookup -----------------------------------


async def lookup_with_cache(
    db: AsyncSession,
    source: HostnameLookupSource,
    ip: str,
    daily_limit: int,
) -> list[str]:
    """Cache-first reverse-IP hostname lookup for a single IP.

    Flow:
    1. Read cache. Fresh ``success`` / ``no_results`` row → return stored
       list (may be empty) without touching the source.
    2. Cache miss or expired → try to consume one budget unit. Exhausted
       → return ``[]`` without calling the source (cache unchanged).
    3. Budget available → call the source. Write the result (regardless
       of status) to the cache with the appropriate TTL. If the source
       reports its own rate-limit hit, pin the budget to the daily cap
       so the remainder of the filler run skips this source.

    Returns the hostnames list on ``success``, ``[]`` otherwise. Never
    raises — source errors are absorbed and cached.
    """
    cached = await get_cached_hostnames(db, ip)
    if cached is not None:
        logger.debug(
            "hostname-lookup: cache hit for %s (%d hostnames)", ip, len(cached)
        )
        return cached

    if not await consume_budget(db, source.name, daily_limit):
        logger.info(
            "hostname-lookup: daily budget exhausted for source=%s, skipping %s",
            source.name,
            ip,
        )
        return []

    result = await source.fetch(ip)

    # Source reports its own rate limit exceeded → pin our counter so
    # the rest of this filler run skips further calls to this source.
    if (
        result.status == "failed"
        and result.error_message is not None
        and "api count exceeded" in result.error_message.lower()
    ):
        await pin_budget_exhausted(db, source.name, daily_limit)

    await upsert_cache_row(db, ip, result, source.name)

    logger.info(
        "hostname-lookup: source=%s ip=%s status=%s hostnames=%d",
        source.name,
        ip,
        result.status,
        len(result.hostnames),
    )
    return list(result.hostnames) if result.status == "success" else []


# --- On-demand queue (manual lookup handoff to scanner) --------------


async def enqueue_hostname_lookup(
    db: AsyncSession,
    ip: str,
    requested_by_user_id: int | None,
) -> HostnameLookupQueueEntry:
    """Add a pending manual lookup row for ``ip``.

    Always inserts a fresh ``pending`` row — duplicate suppression for
    the same IP happens at claim time, not enqueue time, because
    MariaDB < 10.5 cannot enforce a partial unique index on
    ``(ip, status='pending')`` and we don't want to take a row lock for
    every UI click.
    """
    entry = HostnameLookupQueueEntry(
        ip=ip,
        requested_by_user_id=requested_by_user_id,
        status="pending",
    )
    db.add(entry)
    await db.flush()
    return entry


async def _sweep_stuck_claims(db: AsyncSession) -> None:
    """Re-queue ``claimed`` rows that exceeded the stuck-claim window.

    Lazy maintenance — runs at the start of every claim cycle. A
    crashed or rebooted scanner can leave a row pinned in ``claimed``
    forever; this re-queues anything past
    ``QUEUE_STUCK_CLAIM_AFTER`` so the next poll picks it up.
    """
    cutoff = _now() - QUEUE_STUCK_CLAIM_AFTER
    await db.execute(
        update(HostnameLookupQueueEntry)
        .where(HostnameLookupQueueEntry.status == "claimed")
        .where(HostnameLookupQueueEntry.claimed_at.is_not(None))
        .where(HostnameLookupQueueEntry.claimed_at <= cutoff)
        .values(status="pending", claimed_at=None)
    )


async def _sweep_terminal_rows(db: AsyncSession) -> None:
    """Delete completed / failed rows older than the retention window."""
    cutoff = _now() - QUEUE_TERMINAL_RETENTION
    await db.execute(
        delete(HostnameLookupQueueEntry)
        .where(HostnameLookupQueueEntry.status.in_(("completed", "failed")))
        .where(HostnameLookupQueueEntry.completed_at.is_not(None))
        .where(HostnameLookupQueueEntry.completed_at <= cutoff)
    )


async def claim_pending_lookup_jobs(
    db: AsyncSession, limit: int = 10
) -> list[HostnameLookupQueueEntry]:
    """Atomically claim up to ``limit`` pending queue rows for a scanner.

    Performs the lazy stuck-claim sweep + terminal-row GC, then reads
    the oldest pending rows, marks each as ``claimed`` with a fresh
    ``claimed_at`` timestamp, and returns them to the caller. The
    ``flush`` happens before return so the caller's commit persists the
    state transition.

    De-duplicates by IP within the returned batch — if the queue has
    three pending rows for the same IP, only the oldest is claimed and
    returned; the other two stay pending and get cleaned up the next
    time their IP is enriched (the cache write covers all of them).
    """
    if limit <= 0:
        return []

    await _sweep_stuck_claims(db)
    await _sweep_terminal_rows(db)

    rows = (
        (
            await db.execute(
                select(HostnameLookupQueueEntry)
                .where(HostnameLookupQueueEntry.status == "pending")
                .order_by(HostnameLookupQueueEntry.requested_at.asc())
                .limit(limit * 4)  # over-fetch to absorb same-IP dupes
            )
        )
        .scalars()
        .all()
    )

    seen_ips: set[str] = set()
    claimed: list[HostnameLookupQueueEntry] = []
    now = _now()
    for row in rows:
        if row.ip in seen_ips:
            continue
        seen_ips.add(row.ip)
        row.status = "claimed"
        row.claimed_at = now
        claimed.append(row)
        if len(claimed) >= limit:
            break

    if claimed:
        await db.flush()
    return claimed


async def mark_queue_entry_completed(
    db: AsyncSession,
    queue_id: int,
    *,
    status: Literal["completed", "failed"] = "completed",
    error: str | None = None,
) -> HostnameLookupQueueEntry | None:
    """Mark a claimed queue row as terminal (completed or failed).

    Returns the updated row, or ``None`` if no row matches ``queue_id``.
    The error message is bounded to 500 characters before storage.
    """
    row = (
        await db.execute(
            select(HostnameLookupQueueEntry).where(
                HostnameLookupQueueEntry.id == queue_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None

    row.status = status
    row.completed_at = _now()
    row.error_message = error[:500] if error else None
    await db.flush()
    return row


async def get_pending_queue_count(db: AsyncSession) -> int:
    """Return the number of pending + claimed queue rows.

    Used by the admin status endpoint to surface "manual lookups
    waiting" on the dashboard. Includes ``claimed`` so an in-flight
    refresh still appears as outstanding work to the operator.
    """
    rows = (
        await db.execute(
            select(HostnameLookupQueueEntry.id).where(
                HostnameLookupQueueEntry.status.in_(("pending", "claimed"))
            )
        )
    ).all()
    return len(rows)
