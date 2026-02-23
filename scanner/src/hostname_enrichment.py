"""Hostname enrichment via external APIs (ip-api.com, HackerTarget, crt.sh).

Enriches discovered hosts that have no hostname from nmap reverse DNS
by querying free external services.

Lookup priority:
1. ip-api.com  — PTR / reverse DNS (batch, fast)
2. HackerTarget — reverse IP lookup via DNS A-records (20 free req/day)
3. crt.sh — certificate transparency logs (fallback)
"""

from __future__ import annotations

import logging
import time
from dataclasses import replace

import httpx

from src.models import HostResult

# ip-api.com: free tier, HTTP only, batch up to 100 IPs, 15 batch req/min
_IP_API_BATCH_URL = "http://ip-api.com/batch"
_IP_API_BATCH_SIZE = 100
_IP_API_FIELDS = "query,reverse,status"

# HackerTarget: reverse IP lookup via DNS A-records, 20 free req/day
_HACKERTARGET_URL = "https://api.hackertarget.com/reverseiplookup/"

# crt.sh: certificate transparency log search
_CRT_SH_URL = "https://crt.sh/"

# Timeouts
_API_TIMEOUT = 10.0
_CRT_SH_TIMEOUT = 15.0
_CRT_SH_DELAY = 0.5  # delay between crt.sh requests to be polite
_HACKERTARGET_DELAY = 0.3  # delay between HackerTarget requests


def enrich_hostnames_ip_api(
    ips: list[str],
    logger: logging.Logger,
    timeout: float = _API_TIMEOUT,
) -> dict[str, str]:
    """Query ip-api.com batch endpoint for reverse DNS hostnames.

    Args:
        ips: List of IP addresses to look up.
        logger: Logger instance.
        timeout: HTTP request timeout in seconds.

    Returns:
        Dict mapping IP -> hostname for IPs where a reverse DNS name was found.
    """
    if not ips:
        return {}

    results: dict[str, str] = {}

    # Process in batches of 100 (ip-api.com limit)
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
                    results[ip] = reverse

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
    timeout: float = _API_TIMEOUT,
) -> dict[str, str]:
    """Query HackerTarget reverse IP lookup for domains pointing to an IP via DNS A-records.

    This finds domains whose A-record resolves to the given IP, which is different
    from PTR/reverse DNS. This is often the most effective lookup for servers
    without PTR records.

    Free tier: 20 requests/day (no API key needed).

    Args:
        ips: List of IP addresses to look up.
        logger: Logger instance.
        timeout: HTTP request timeout in seconds.

    Returns:
        Dict mapping IP -> hostname for IPs where a domain was found.
    """
    if not ips:
        return {}

    results: dict[str, str] = {}

    with httpx.Client(timeout=timeout) as client:
        for ip in ips:
            try:
                response = client.get(_HACKERTARGET_URL, params={"q": ip})
                response.raise_for_status()
                text = response.text.strip()

                # HackerTarget returns plain text, one domain per line
                # Error responses start with "error" or "API count exceeded"
                if not text or text.startswith("error") or text.startswith("API count"):
                    if "API count" in text:
                        logger.warning("HackerTarget: daily API limit reached, skipping remaining")
                        break
                    logger.debug("HackerTarget: no results for %s", ip)
                    continue

                # Take the first domain from the list
                domains = [
                    line.strip()
                    for line in text.splitlines()
                    if line.strip() and not _is_ip_address(line.strip())
                ]
                if domains:
                    results[ip] = domains[0]
                    logger.info("HackerTarget: %s -> %s", ip, domains[0])

            except (httpx.HTTPError, ValueError) as exc:
                logger.debug("HackerTarget lookup failed for %s: %s", ip, exc)

            # Rate-limit politeness delay
            if len(ips) > 1:
                time.sleep(_HACKERTARGET_DELAY)

    if results:
        logger.info("HackerTarget: resolved %d/%d hostnames", len(results), len(ips))

    return results


def enrich_hostnames_crt_sh(
    ips: list[str],
    logger: logging.Logger,
    timeout: float = _CRT_SH_TIMEOUT,
) -> dict[str, str]:
    """Query crt.sh certificate transparency logs for hostnames associated with IPs.

    Args:
        ips: List of IP addresses to look up.
        logger: Logger instance.
        timeout: HTTP request timeout in seconds.

    Returns:
        Dict mapping IP -> hostname for IPs where a certificate name was found.
    """
    if not ips:
        return {}

    results: dict[str, str] = {}

    with httpx.Client(timeout=timeout) as client:
        for ip in ips:
            try:
                response = client.get(_CRT_SH_URL, params={"q": ip, "output": "json"})
                response.raise_for_status()

                entries = response.json()
                if not isinstance(entries, list) or not entries:
                    continue

                # Pick the most recent certificate's common_name
                # Entries are sorted by id desc (most recent first)
                for entry in entries:
                    common_name = entry.get("common_name", "")
                    if common_name and not _is_ip_address(common_name):
                        results[ip] = common_name
                        logger.info("crt.sh: %s -> %s", ip, common_name)
                        break

            except (httpx.HTTPError, ValueError) as exc:
                logger.warning("crt.sh lookup failed for %s: %s", ip, exc)

            # Rate-limit politeness delay
            time.sleep(_CRT_SH_DELAY)

    if results:
        logger.info("crt.sh: resolved %d/%d hostnames", len(results), len(ips))

    return results


def _is_ip_address(value: str) -> bool:
    """Check if a string looks like an IP address (not a hostname)."""
    # Simple check: if it contains only digits and dots (IPv4) or hex and colons (IPv6)
    parts = value.split(".")
    if len(parts) == 4:
        return all(p.isdigit() for p in parts)
    return ":" in value and all(c in "0123456789abcdefABCDEF:" for c in value)


def _is_private_ip(ip: str) -> bool:
    """Check if an IP address is private (RFC1918, ULA, link-local, loopback, etc.)."""
    import ipaddress

    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


def enrich_host_results(
    hosts: list[HostResult],
    logger: logging.Logger,
    ips_with_open_ports: list[str] | None = None,
) -> list[HostResult]:
    """Enrich host results with hostnames from external APIs.

    Hosts that already have a hostname from nmap are not modified.
    Priority: nmap reverse DNS > ip-api.com > HackerTarget > crt.sh

    Args:
        hosts: List of discovered hosts from nmap.
        logger: Logger instance.

    Returns:
        Updated list of HostResult with enriched hostnames.
    """
    # Collect IPs that need hostname enrichment
    ips_without_hostname = [h.ip for h in hosts if not h.hostname]

    if not ips_without_hostname:
        logger.info("All %d hosts already have hostnames, skipping enrichment", len(hosts))
        return hosts

    # Filter out RFC1918 private addresses (external APIs have no useful data for these)
    open_ports_set = set(ips_with_open_ports) if ips_with_open_ports is not None else None
    enrichable: list[str] = []
    skipped_private = 0
    skipped_no_ports = 0
    for ip in ips_without_hostname:
        if _is_private_ip(ip):
            skipped_private += 1
            continue
        if open_ports_set is not None and ip not in open_ports_set:
            skipped_no_ports += 1
            continue
        enrichable.append(ip)

    if skipped_private:
        logger.info("Skipping %d private IPs from enrichment", skipped_private)
    if skipped_no_ports:
        logger.info("Skipping %d IPs without open ports from enrichment", skipped_no_ports)

    if not enrichable:
        logger.info("No IPs eligible for hostname enrichment after filtering")
        return hosts

    logger.info(
        "Enriching hostnames for %d/%d hosts without reverse DNS",
        len(enrichable),
        len(hosts),
    )

    # Step 1: Try ip-api.com (batch, fast — PTR records)
    hostname_map = enrich_hostnames_ip_api(enrichable, logger)

    # Step 2 & 3: HackerTarget and crt.sh only work with IPv4
    remaining_ipv4 = [ip for ip in enrichable if ip not in hostname_map and ":" not in ip]

    # Step 2: Try HackerTarget (DNS A-record reverse lookup, IPv4 only)
    if remaining_ipv4:
        ht_results = enrich_hostnames_hackertarget(remaining_ipv4, logger)
        hostname_map.update(ht_results)

    # Step 3: For remaining IPv4 IPs, try crt.sh (certificate transparency, fallback)
    remaining_ipv4 = [ip for ip in remaining_ipv4 if ip not in hostname_map]
    if remaining_ipv4:
        crt_results = enrich_hostnames_crt_sh(remaining_ipv4, logger)
        hostname_map.update(crt_results)

    if not hostname_map:
        logger.info("No additional hostnames found from external APIs")
        return hosts

    logger.info(
        "Hostname enrichment complete: resolved %d/%d additional hostnames",
        len(hostname_map),
        len(enrichable),
    )

    # Build updated host list
    enriched: list[HostResult] = []
    for host in hosts:
        if not host.hostname and host.ip in hostname_map:
            enriched.append(replace(host, hostname=hostname_map[host.ip]))
        else:
            enriched.append(host)

    return enriched
