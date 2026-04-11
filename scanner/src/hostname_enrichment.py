"""Hostname enrichment via external APIs and local probes.

Enriches discovered hosts that have no hostname from nmap reverse DNS
by querying free external services and local certificate inspection.

Lookup priority:
1. SSL Certificate — nmap ssl-cert script on common SSL ports
   (local, most authoritative)
2. Google DNS — PTR lookup via dns.google JSON API
   (fast, reliable, IPv4 only)
3. ip-api.com  — PTR / reverse DNS (batch, fast, covers IPv6)
4. HackerTarget — reverse IP lookup via DNS A-records
   (50/100 free req/day, multi-vhost vhost-list source)
5. RapidDNS    — fallback when HackerTarget is exhausted
   (100 req/day default, multi-vhost vhost-list source)
6. crt.sh      — certificate transparency logs (last resort)

Architecture (post-2.3.0):
- All five enrichment functions return ``dict[str, list[str]]`` so the
  orchestrator can merge them uniformly. ssl-cert / google_dns /
  ip-api / crt.sh produce single-element lists; HackerTarget and
  RapidDNS keep the full vhost list returned by the source.
- HackerTarget and RapidDNS go through the source classes in
  ``src.hostname_sources`` (the same code that runs in the queue
  poller for on-demand manual lookups).
- When a ``ScannerClient`` is supplied, the orchestrator pre-flights
  ``GET /api/scanner/hostname-budget`` and skips HT / RapidDNS when
  the per-source ``remaining`` is zero. After enrichment finishes,
  results from the three "vhost-list" sources (HT, RapidDNS, crt.sh)
  are POSTed to ``/api/scanner/hostname-results`` so the backend
  cache + budget counters update.
- ssl-cert / PTR / ip-api results are NOT posted to the cache —
  they are display-name sources, not vhost lists, and don't belong
  in the SNI fan-out cache.
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from dataclasses import replace
from typing import TYPE_CHECKING, Any

import httpx

from src.hostname_sources import (
    HACKERTARGET_MIN_REQUEST_INTERVAL_S,
    RAPIDDNS_MIN_REQUEST_INTERVAL_S,
    HackerTargetSource,
    HostnameLookupResult,
    RapidDnsSource,
)
from src.models import HostResult

if TYPE_CHECKING:
    from src.client import ScannerClient

# ip-api.com: free tier, HTTP only, batch up to 100 IPs, 15 batch req/min
_IP_API_BATCH_URL = "http://ip-api.com/batch"
_IP_API_BATCH_SIZE = 100
_IP_API_FIELDS = "query,reverse,status"

# Google DNS: PTR lookup via JSON API (no key needed, generous limits)
_GOOGLE_DNS_URL = "https://dns.google/resolve"

# crt.sh: certificate transparency log search
_CRT_SH_URL = "https://crt.sh/"

# Timeouts
_API_TIMEOUT = 10.0
_CRT_SH_TIMEOUT = 5.0
_CRT_SH_DELAY = 0.5  # delay between crt.sh requests to be polite
_CRT_SH_MAX_CONSECUTIVE_FAILURES = 3  # bail out after N consecutive failures
_GOOGLE_DNS_DELAY = 0.1  # delay between Google DNS requests

# SSL certificate lookup via nmap ssl-cert script
_SSL_CERT_PORTS = "443,8443,993,995,465,636,989,990,5061,8080,8843"
_SSL_CERT_TIMEOUT = 30  # nmap host timeout in seconds

# Sources whose results are POSTed back to the backend cache. Display
# name sources (ssl-cert, google_dns, ip-api) are intentionally
# excluded — they don't belong in the SNI fan-out cache.
_VHOST_LIST_SOURCES: tuple[str, ...] = ("hackertarget", "rapiddns", "crt_sh")


def enrich_hostnames_ssl_cert(
    ips: list[str],
    logger: logging.Logger,
    timeout: int = _SSL_CERT_TIMEOUT,
) -> dict[str, list[str]]:
    """Grab hostnames from SSL certificates using nmap's ssl-cert script.

    Runs nmap with --script ssl-cert on common SSL/STARTTLS ports for
    all target IPs. Extracts the certificate CN or SAN from the XML
    output. Always returns a single-element list per matched IP — the
    list shape is for uniformity with the multi-vhost sources.
    """
    if not ips:
        return {}

    with tempfile.NamedTemporaryFile(
        delete=False, suffix=".xml", mode="w"
    ) as output_file:
        output_path = output_file.name

    # Write targets to a file to avoid command-line length limits
    with tempfile.NamedTemporaryFile(
        delete=False, suffix=".txt", mode="w"
    ) as targets_file:
        targets_file.write("\n".join(ips))
        targets_path = targets_file.name

    command = [
        "nmap",
        "-Pn",  # Skip host discovery (hosts are already known to be up)
        "-n",  # No DNS resolution
        f"-p{_SSL_CERT_PORTS}",
        "--open",
        "--script",
        "ssl-cert",
        "--host-timeout",
        f"{timeout}s",
        "-T4",
        "-oX",
        output_path,
        "-iL",
        targets_path,
    ]

    logger.info(
        "SSLCert: scanning %d IPs for certificates on ports %s",
        len(ips),
        _SSL_CERT_PORTS,
    )

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if line:
                    logger.debug("SSLCert nmap: %s", line)

        returncode = process.wait()
        if returncode != 0:
            logger.warning("SSLCert: nmap exited with code %d", returncode)
            return {}

        with open(output_path, encoding="utf-8") as handle:
            xml_content = handle.read()

        results = _parse_ssl_cert_xml(xml_content, logger)

        if results:
            logger.info("SSLCert: resolved %d/%d hostnames", len(results), len(ips))

        return {ip: [name] for ip, name in results.items()}

    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("SSLCert: nmap failed: %s", exc)
        return {}
    finally:
        for path in (output_path, targets_path):
            try:
                os.remove(path)
            except OSError:
                pass


def _parse_ssl_cert_xml(xml_content: str, logger: logging.Logger) -> dict[str, str]:
    """Parse nmap ssl-cert script XML output to extract hostnames.

    Returns the raw single-name-per-IP map; the public function above
    wraps each value in a one-element list for the new uniform return
    shape.
    """
    results: dict[str, str] = {}

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        logger.warning("SSLCert: failed to parse nmap XML: %s", exc)
        return results

    for host in root.findall(".//host"):
        ip_elem = host.find("address[@addrtype='ipv4']")
        if ip_elem is None:
            ip_elem = host.find("address[@addrtype='ipv6']")
        if ip_elem is None:
            continue
        ip = ip_elem.get("addr", "")
        if not ip or ip in results:
            continue

        for script in host.findall(".//script[@id='ssl-cert']"):
            hostname = _extract_hostname_from_nmap_ssl_cert(script)
            if hostname:
                results[ip] = hostname
                logger.info("SSLCert: %s -> %s", ip, hostname)
                break

    return results


def _extract_hostname_from_nmap_ssl_cert(script_elem: ET.Element) -> str | None:
    """Extract a non-wildcard hostname from nmap ssl-cert script XML element.

    Checks SAN extensions first (dNSName), then falls back to subject CN.
    """
    for table in script_elem.findall(".//table[@key='extensions']"):
        for ext_table in table.findall("table"):
            name_elem = ext_table.find("elem[@key='name']")
            if name_elem is not None and "Subject Alternative Name" in (
                name_elem.text or ""
            ):
                value_elem = ext_table.find("elem[@key='value']")
                if value_elem is not None and value_elem.text:
                    for part in value_elem.text.split(","):
                        part = part.strip()
                        if part.startswith("DNS:"):
                            name = part[4:].strip()
                            if name and not name.startswith("*"):
                                return name

    for table in script_elem.findall(".//table[@key='subject']"):
        cn_elem = table.find("elem[@key='commonName']")
        if cn_elem is not None and cn_elem.text and not cn_elem.text.startswith("*"):
            return cn_elem.text

    return None


def enrich_hostnames_ip_api(
    ips: list[str],
    logger: logging.Logger,
    timeout: float = _API_TIMEOUT,
) -> dict[str, list[str]]:
    """Query ip-api.com batch endpoint for reverse DNS hostnames."""
    if not ips:
        return {}

    results: dict[str, list[str]] = {}

    for i in range(0, len(ips), _IP_API_BATCH_SIZE):
        batch = ips[i : i + _IP_API_BATCH_SIZE]
        payload = [{"query": ip, "fields": _IP_API_FIELDS} for ip in batch]

        try:
            with httpx.Client(timeout=timeout) as client:
                response = client.post(_IP_API_BATCH_URL, json=payload)
                response.raise_for_status()

            for entry in response.json():
                if not isinstance(entry, dict):
                    continue
                ip = entry.get("query", "")
                reverse = entry.get("reverse", "")
                if entry.get("status") == "success" and reverse:
                    results[ip] = [reverse]

            logger.info(
                "ip-api.com: resolved %d/%d hostnames (batch %d-%d)",
                len(results),
                len(batch),
                i,
                i + len(batch),
            )

        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("ip-api.com batch lookup failed: %s", exc)

    return results


def enrich_hostnames_hackertarget(
    ips: list[str],
    logger: logging.Logger,
    source: HackerTargetSource | None = None,
) -> dict[str, list[str]]:
    """Reverse-IP lookup via HackerTarget for the given IPs.

    Delegates per-IP fetching to ``HackerTargetSource.fetch`` so the
    parse logic stays in one place. Stops early when the source
    reports its rate limit exceeded so the rest of the run doesn't
    burn quota. Returns the **full** vhost list per IP (not just the
    first entry) so the backend cache and SNI fan-out can use them.

    Failed / no_results outcomes are silently dropped from the
    returned map; the orchestrator captures the per-source raw
    outcome separately via ``run_vhost_source`` for the post-back to
    the backend cache.
    """
    if not ips:
        return {}

    src = source or HackerTargetSource()
    results: dict[str, list[str]] = {}

    for ip in ips:
        result = src.fetch(ip)

        if result.status == "failed" and _is_rate_limit_signal(result):
            logger.warning(
                "HackerTarget: rate limit reached, skipping remaining %d IPs",
                len(ips) - ips.index(ip) - 1,
            )
            break

        if result.status == "success" and result.hostnames:
            results[ip] = list(result.hostnames)
            logger.info(
                "HackerTarget: %s -> %d hostnames", ip, len(result.hostnames)
            )

        if len(ips) > 1:
            time.sleep(HACKERTARGET_MIN_REQUEST_INTERVAL_S)

    if results:
        logger.info(
            "HackerTarget: resolved %d/%d hostnames", len(results), len(ips)
        )

    return results


def enrich_hostnames_rapiddns(
    ips: list[str],
    logger: logging.Logger,
    source: RapidDnsSource | None = None,
) -> dict[str, list[str]]:
    """Reverse-IP lookup via RapidDNS as the HackerTarget fallback.

    Same shape as :func:`enrich_hostnames_hackertarget`. Used after
    HackerTarget so the more rate-limited source still gets a chance
    when HT runs out (or vice versa, when HT is exhausted but RapidDNS
    has budget left).
    """
    if not ips:
        return {}

    src = source or RapidDnsSource()
    results: dict[str, list[str]] = {}

    for ip in ips:
        result = src.fetch(ip)

        if result.status == "failed" and _is_rate_limit_signal(result):
            logger.warning(
                "RapidDNS: rate limit reached, skipping remaining %d IPs",
                len(ips) - ips.index(ip) - 1,
            )
            break

        if result.status == "success" and result.hostnames:
            results[ip] = list(result.hostnames)
            logger.info("RapidDNS: %s -> %d hostnames", ip, len(result.hostnames))

        if len(ips) > 1:
            time.sleep(RAPIDDNS_MIN_REQUEST_INTERVAL_S)

    if results:
        logger.info("RapidDNS: resolved %d/%d hostnames", len(results), len(ips))

    return results


def _is_rate_limit_signal(result: HostnameLookupResult) -> bool:
    """True when a failed result indicates the source's daily cap is hit."""
    if result.status != "failed":
        return False
    return (
        result.error_message is not None
        and "api count exceeded" in result.error_message.lower()
    )


def _ip_to_ptr_name(ip: str) -> str:
    """Convert an IPv4 address to its PTR lookup name."""
    return ".".join(reversed(ip.split("."))) + ".in-addr.arpa"


def enrich_hostnames_google_dns(
    ips: list[str],
    logger: logging.Logger,
    timeout: float = _API_TIMEOUT,
) -> dict[str, list[str]]:
    """Query Google Public DNS for PTR records."""
    if not ips:
        return {}

    results: dict[str, list[str]] = {}

    with httpx.Client(timeout=timeout) as client:
        for ip in ips:
            try:
                ptr_name = _ip_to_ptr_name(ip)
                response = client.get(
                    _GOOGLE_DNS_URL,
                    params={"name": ptr_name, "type": "PTR"},
                )
                response.raise_for_status()
                data = response.json()

                if data.get("Status") == 0 and data.get("Answer"):
                    for answer in data["Answer"]:
                        if answer.get("type") == 12:
                            hostname = answer.get("data", "").rstrip(".")
                            if hostname and not _is_ip_address(hostname):
                                results[ip] = [hostname]
                                logger.info("GoogleDNS: %s -> %s", ip, hostname)
                                break

            except (httpx.HTTPError, ValueError) as exc:
                logger.debug("GoogleDNS lookup failed for %s: %s", ip, exc)

            if len(ips) > 1:
                time.sleep(_GOOGLE_DNS_DELAY)

    if results:
        logger.info("GoogleDNS: resolved %d/%d hostnames", len(results), len(ips))

    return results


def enrich_hostnames_crt_sh(
    ips: list[str],
    logger: logging.Logger,
    timeout: float = _CRT_SH_TIMEOUT,
) -> dict[str, list[str]]:
    """Query crt.sh certificate transparency logs for cert hostnames."""
    if not ips:
        return {}

    results: dict[str, list[str]] = {}
    consecutive_failures = 0

    with httpx.Client(timeout=timeout) as client:
        for ip in ips:
            try:
                response = client.get(
                    _CRT_SH_URL, params={"q": ip, "output": "json"}
                )
                response.raise_for_status()

                entries = response.json()
                if not isinstance(entries, list) or not entries:
                    consecutive_failures = 0
                    continue

                for entry in entries:
                    common_name = entry.get("common_name", "")
                    if common_name and not _is_ip_address(common_name):
                        results[ip] = [common_name]
                        logger.info("crt.sh: %s -> %s", ip, common_name)
                        break

                consecutive_failures = 0

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    logger.debug("crt.sh: no certificates for %s", ip)
                    consecutive_failures = 0
                else:
                    consecutive_failures += 1
                    logger.debug("crt.sh lookup failed for %s: %s", ip, exc)
            except (httpx.HTTPError, ValueError) as exc:
                consecutive_failures += 1
                logger.debug("crt.sh lookup failed for %s: %s", ip, exc)

            if consecutive_failures >= _CRT_SH_MAX_CONSECUTIVE_FAILURES:
                logger.warning(
                    "crt.sh: %d consecutive failures, skipping remaining %d IPs",
                    consecutive_failures,
                    len(ips) - ips.index(ip) - 1,
                )
                break

            time.sleep(_CRT_SH_DELAY)

    if results:
        logger.info("crt.sh: resolved %d/%d hostnames", len(results), len(ips))

    return results


def _is_ip_address(value: str) -> bool:
    """Check if a string looks like an IP address (not a hostname)."""
    parts = value.split(".")
    if len(parts) == 4:
        return all(p.isdigit() for p in parts)
    return ":" in value and all(c in "0123456789abcdefABCDEF:" for c in value)


def _is_private_ip(ip: str) -> bool:
    """Check if an IP address is private (RFC1918, ULA, link-local, etc.)."""
    import ipaddress

    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def post_hostname_results_to_backend(
    client: ScannerClient,
    results: list[dict[str, Any]],
    logger: logging.Logger,
) -> None:
    """POST a batch of vhost-list enrichment outcomes to the backend.

    Filters out anything that isn't from a tracked vhost-list source
    (HT / RapidDNS / crt.sh) so display-name sources never end up in
    the SNI fan-out cache. Empty input short-circuits.
    """
    payload = [r for r in results if r.get("source") in _VHOST_LIST_SOURCES]
    if not payload:
        return
    logger.info(
        "hostname-results: posting %d entries to backend cache", len(payload)
    )
    client.post_hostname_results(payload)


def enrich_host_results(
    hosts: list[HostResult],
    logger: logging.Logger,
    client: ScannerClient | None = None,
) -> list[HostResult]:
    """Enrich host results with hostnames from external APIs.

    Enriches all pingable public hosts that have no hostname. Each
    provider is queried until its limit is reached; over daily runs
    all hostnames will eventually be resolved.

    Priority: nmap reverse DNS > SSL Cert > Google DNS > ip-api.com
    > HackerTarget > RapidDNS > crt.sh.

    When ``client`` is provided:
    - Pre-flights ``GET /api/scanner/hostname-budget`` and skips
      HackerTarget / RapidDNS for sources whose ``remaining`` is 0.
    - After enrichment, posts the HT / RapidDNS / crt.sh outcomes
      back to ``POST /api/scanner/hostname-results`` so the backend
      cache + per-source budget counters update.

    When ``client`` is ``None`` the legacy behaviour is preserved
    (no budget pre-flight, no post-back) — used by tests and any
    caller that doesn't have a ``ScannerClient`` handy.
    """
    ips_without_hostname = [h.ip for h in hosts if not h.hostname and h.is_pingable]

    if not ips_without_hostname:
        logger.info(
            "All %d hosts already have hostnames, skipping enrichment", len(hosts)
        )
        return hosts

    enrichable: list[str] = []
    skipped_private = 0
    for ip in ips_without_hostname:
        if _is_private_ip(ip):
            skipped_private += 1
            continue
        enrichable.append(ip)

    if skipped_private:
        logger.info("Skipping %d private IPs from enrichment", skipped_private)

    if not enrichable:
        logger.info("No IPs eligible for hostname enrichment after filtering")
        return hosts

    logger.info(
        "Enriching hostnames for %d/%d hosts without reverse DNS",
        len(enrichable),
        len(hosts),
    )

    # Pre-flight budget check for the budgeted vhost-list sources.
    # Empty dict (transport error / 404 / unauth) means "no signal,
    # try anyway" — same as if the call had succeeded with a positive
    # remaining for every source.
    budget: dict[str, int] = {}
    if client is not None:
        budget = client.get_hostname_budget()

    def _budget_allows(source: str) -> bool:
        if not budget:
            return True
        return budget.get(source, 1) > 0

    # Display-name map: ip -> first usable hostname (preserves the
    # legacy single-string semantics for HostResult.hostname).
    display_map: dict[str, str] = {}
    # Vhost-list outcomes for backend posting (only HT / RapidDNS /
    # crt.sh — never display-name sources). Includes failed +
    # no_results so the backend can dedupe and pin budgets.
    vhost_results: list[dict[str, Any]] = []

    def _merge(source_map: dict[str, list[str]]) -> None:
        for ip, names in source_map.items():
            if not names:
                continue
            display_map.setdefault(ip, names[0])

    # Step 1: SSL certificate CN/SAN (local, no API)
    if enrichable:
        ssl_results = enrich_hostnames_ssl_cert(enrichable, logger)
        _merge(ssl_results)

    # Step 2: Google DNS PTR (IPv4 only)
    remaining = [ip for ip in enrichable if ip not in display_map and ":" not in ip]
    if remaining:
        google_results = enrich_hostnames_google_dns(remaining, logger)
        _merge(google_results)

    # Step 3: ip-api.com (batch PTR, IPv6 too)
    remaining = [ip for ip in enrichable if ip not in display_map]
    if remaining:
        ipapi_results = enrich_hostnames_ip_api(remaining, logger)
        _merge(ipapi_results)

    # Step 4: HackerTarget — vhost-list source, budget-checked
    remaining = [ip for ip in enrichable if ip not in display_map and ":" not in ip]
    if remaining:
        if _budget_allows("hackertarget"):
            ht_results = enrich_hostnames_hackertarget(remaining, logger)
            _merge(ht_results)
            for ip, names in ht_results.items():
                vhost_results.append(
                    {
                        "ip": ip,
                        "source": "hackertarget",
                        "status": "success",
                        "hostnames": names,
                    }
                )
        else:
            logger.info(
                "HackerTarget: budget exhausted (remaining=0), skipping %d IPs",
                len(remaining),
            )

    # Step 5: RapidDNS — vhost-list fallback, budget-checked
    remaining = [ip for ip in enrichable if ip not in display_map and ":" not in ip]
    if remaining:
        if _budget_allows("rapiddns"):
            rd_results = enrich_hostnames_rapiddns(remaining, logger)
            _merge(rd_results)
            for ip, names in rd_results.items():
                vhost_results.append(
                    {
                        "ip": ip,
                        "source": "rapiddns",
                        "status": "success",
                        "hostnames": names,
                    }
                )
        else:
            logger.info(
                "RapidDNS: budget exhausted (remaining=0), skipping %d IPs",
                len(remaining),
            )

    # Step 6: crt.sh — vhost-list source, no formal budget
    remaining = [ip for ip in enrichable if ip not in display_map and ":" not in ip]
    if remaining:
        crt_results = enrich_hostnames_crt_sh(remaining, logger)
        _merge(crt_results)
        for ip, names in crt_results.items():
            vhost_results.append(
                {
                    "ip": ip,
                    "source": "crt_sh",
                    "status": "success",
                    "hostnames": names,
                }
            )

    if not display_map:
        logger.info("No additional hostnames found from external APIs")
    else:
        logger.info(
            "Hostname enrichment complete: resolved %d/%d additional hostnames",
            len(display_map),
            len(enrichable),
        )

    # Post HT / RapidDNS / crt.sh outcomes to the backend cache.
    if client is not None and vhost_results:
        post_hostname_results_to_backend(client, vhost_results, logger)

    enriched: list[HostResult] = []
    for host in hosts:
        if not host.hostname and host.ip in display_map:
            enriched.append(replace(host, hostname=display_map[host.ip]))
        else:
            enriched.append(host)

    return enriched
