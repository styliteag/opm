"""Hostname enrichment via external APIs and local probes.

Enriches discovered hosts that have no hostname from nmap reverse DNS
by querying free external services and local certificate inspection.

Lookup priority:
1. SSL Certificate — nmap ssl-cert script on common SSL ports (local, most authoritative)
2. Google DNS — PTR lookup via dns.google JSON API (fast, reliable)
3. ip-api.com  — PTR / reverse DNS (batch, fast)
4. HackerTarget — reverse IP lookup via DNS A-records (20 free req/day)
5. crt.sh — certificate transparency logs (last resort)
"""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import time
import xml.etree.ElementTree as ET
from dataclasses import replace

import httpx

from src.models import HostResult

# ip-api.com: free tier, HTTP only, batch up to 100 IPs, 15 batch req/min
_IP_API_BATCH_URL = "http://ip-api.com/batch"
_IP_API_BATCH_SIZE = 100
_IP_API_FIELDS = "query,reverse,status"

# HackerTarget: reverse IP lookup via DNS A-records, 20 free req/day
_HACKERTARGET_URL = "https://api.hackertarget.com/reverseiplookup/"

# Google DNS: PTR lookup via JSON API (no key needed, generous limits)
_GOOGLE_DNS_URL = "https://dns.google/resolve"

# crt.sh: certificate transparency log search
_CRT_SH_URL = "https://crt.sh/"

# Timeouts
_API_TIMEOUT = 10.0
_CRT_SH_TIMEOUT = 5.0
_CRT_SH_DELAY = 0.5  # delay between crt.sh requests to be polite
_CRT_SH_MAX_CONSECUTIVE_FAILURES = 3  # bail out after N consecutive failures
_HACKERTARGET_DELAY = 0.3  # delay between HackerTarget requests
_GOOGLE_DNS_DELAY = 0.1  # delay between Google DNS requests

# SSL certificate lookup via nmap ssl-cert script
_SSL_CERT_PORTS = "443,8443,993,995,465,636,989,990,5061,8080,8843"
_SSL_CERT_TIMEOUT = 30  # nmap host timeout in seconds


def enrich_hostnames_ssl_cert(
    ips: list[str],
    logger: logging.Logger,
    timeout: int = _SSL_CERT_TIMEOUT,
) -> dict[str, str]:
    """Grab hostnames from SSL certificates using nmap's ssl-cert script.

    Runs nmap with --script ssl-cert on common SSL/STARTTLS ports for all
    target IPs. Extracts the certificate CN or SAN from the XML output.
    Works with any SSL/TLS port, including STARTTLS services.

    Args:
        ips: List of IP addresses to check.
        logger: Logger instance.
        timeout: Nmap host timeout in seconds.

    Returns:
        Dict mapping IP -> hostname for IPs where a certificate hostname was found.
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

    logger.info("SSLCert: scanning %d IPs for certificates on ports %s", len(ips), _SSL_CERT_PORTS)

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

        return results

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

    Extracts the commonName from the certificate subject, preferring
    SAN dNSName entries when available. Skips wildcard names.

    Returns:
        Dict mapping IP -> hostname.
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

        # Look for ssl-cert script output in any port
        for script in host.findall(".//script[@id='ssl-cert']"):
            hostname = _extract_hostname_from_nmap_ssl_cert(script)
            if hostname:
                results[ip] = hostname
                logger.info("SSLCert: %s -> %s", ip, hostname)
                break  # Take the first valid hostname per IP

    return results


def _extract_hostname_from_nmap_ssl_cert(script_elem: ET.Element) -> str | None:
    """Extract a non-wildcard hostname from nmap ssl-cert script XML element.

    Checks SAN extensions first (dNSName), then falls back to subject CN.
    """
    # Check for SAN extensions first (in <table> elements)
    for table in script_elem.findall(".//table[@key='extensions']"):
        for ext_table in table.findall("table"):
            name_elem = ext_table.find("elem[@key='name']")
            if name_elem is not None and "Subject Alternative Name" in (name_elem.text or ""):
                value_elem = ext_table.find("elem[@key='value']")
                if value_elem is not None and value_elem.text:
                    # Parse "DNS:host1, DNS:host2, ..."
                    for part in value_elem.text.split(","):
                        part = part.strip()
                        if part.startswith("DNS:"):
                            name = part[4:].strip()
                            if name and not name.startswith("*"):
                                return name

    # Fall back to subject commonName
    for table in script_elem.findall(".//table[@key='subject']"):
        cn_elem = table.find("elem[@key='commonName']")
        if cn_elem is not None and cn_elem.text and not cn_elem.text.startswith("*"):
            return cn_elem.text

    return None


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
                # "No DNS A records found" means no results (not an error)
                if (
                    not text
                    or text.startswith("error")
                    or text.startswith("API count")
                    or "No DNS" in text
                ):
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


def _ip_to_ptr_name(ip: str) -> str:
    """Convert an IPv4 address to its PTR lookup name."""
    return ".".join(reversed(ip.split("."))) + ".in-addr.arpa"


def enrich_hostnames_google_dns(
    ips: list[str],
    logger: logging.Logger,
    timeout: float = _API_TIMEOUT,
) -> dict[str, str]:
    """Query Google Public DNS for PTR records.

    Uses https://dns.google/resolve — fast, reliable, no API key needed.

    Args:
        ips: List of IP addresses to look up.
        logger: Logger instance.
        timeout: HTTP request timeout in seconds.

    Returns:
        Dict mapping IP -> hostname for IPs where a PTR record was found.
    """
    if not ips:
        return {}

    results: dict[str, str] = {}

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

                # Status 0 = NOERROR, Answer contains PTR records
                if data.get("Status") == 0 and data.get("Answer"):
                    for answer in data["Answer"]:
                        # Type 12 = PTR
                        if answer.get("type") == 12:
                            hostname = answer.get("data", "").rstrip(".")
                            if hostname and not _is_ip_address(hostname):
                                results[ip] = hostname
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
    consecutive_failures = 0

    with httpx.Client(timeout=timeout) as client:
        for ip in ips:
            try:
                response = client.get(_CRT_SH_URL, params={"q": ip, "output": "json"})
                response.raise_for_status()

                entries = response.json()
                if not isinstance(entries, list) or not entries:
                    consecutive_failures = 0  # successful request, just no data
                    continue

                # Pick the most recent certificate's common_name
                # Entries are sorted by id desc (most recent first)
                for entry in entries:
                    common_name = entry.get("common_name", "")
                    if common_name and not _is_ip_address(common_name):
                        results[ip] = common_name
                        logger.info("crt.sh: %s -> %s", ip, common_name)
                        break

                consecutive_failures = 0

            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 404:
                    # 404 is expected for IPs without certificate records
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
) -> list[HostResult]:
    """Enrich host results with hostnames from external APIs.

    Enriches all pingable public hosts that have no hostname.
    Each provider is queried until its limit is reached; over daily runs
    all hostnames will eventually be resolved.

    Priority: nmap reverse DNS > SSL Cert CN > Google DNS > ip-api.com > HackerTarget > crt.sh

    Args:
        hosts: List of discovered hosts from nmap.
        logger: Logger instance.

    Returns:
        Updated list of HostResult with enriched hostnames.
    """
    # Collect pingable IPs that need hostname enrichment
    ips_without_hostname = [h.ip for h in hosts if not h.hostname and h.is_pingable]

    if not ips_without_hostname:
        logger.info("All %d hosts already have hostnames, skipping enrichment", len(hosts))
        return hosts

    # Filter out RFC1918 private addresses (external APIs have no useful data for these)
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

    hostname_map: dict[str, str] = {}

    # Step 1: SSL certificate CN/SAN from port 443 (local, no API, most authoritative)
    if enrichable:
        ssl_results = enrich_hostnames_ssl_cert(enrichable, logger)
        hostname_map.update(ssl_results)

    # Step 2: Google DNS PTR lookup (fast, reliable, no hard limit, IPv4 only)
    remaining = [ip for ip in enrichable if ip not in hostname_map and ":" not in ip]
    if remaining:
        google_results = enrich_hostnames_google_dns(remaining, logger)
        hostname_map.update(google_results)

    # Step 3: ip-api.com (batch PTR, covers IPv6 too)
    remaining = [ip for ip in enrichable if ip not in hostname_map]
    if remaining:
        ipapi_results = enrich_hostnames_ip_api(remaining, logger)
        hostname_map.update(ipapi_results)

    # Step 4: HackerTarget (DNS A-record reverse, 20 free req/day, IPv4 only)
    remaining = [ip for ip in enrichable if ip not in hostname_map and ":" not in ip]
    if remaining:
        ht_results = enrich_hostnames_hackertarget(remaining, logger)
        hostname_map.update(ht_results)

    # Step 5: crt.sh (certificate transparency, last resort, IPv4 only)
    remaining = [ip for ip in enrichable if ip not in hostname_map and ":" not in ip]
    if remaining:
        crt_results = enrich_hostnames_crt_sh(remaining, logger)
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
