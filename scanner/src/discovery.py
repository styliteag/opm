"""Host discovery and SSH probing functions."""

from __future__ import annotations

import logging
import os
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import replace
from typing import TYPE_CHECKING

from src.hostname_enrichment import enrich_host_results
from src.models import HostResult, OpenPortResult
from src.ssh_probe import SSHProbeResult, probe_ssh
from src.utils import format_command, sanitize_cidr

if TYPE_CHECKING:
    from src.threading_utils import ProgressReporter

# Constants
DEFAULT_SSH_PROBE_CONCURRENCY = 10
DEFAULT_SSH_PROBE_TIMEOUT = 10


def parse_nmap_host_discovery_xml(xml_content: str, logger: logging.Logger) -> list[HostResult]:
    """Parse nmap XML output from host discovery scan and extract host info.

    Args:
        xml_content: XML content from nmap output
        logger: Logger instance

    Returns:
        List of discovered hosts
    """
    results: list[HostResult] = []

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        logger.error("Failed to parse nmap XML output: %s", exc)
        return results

    for host in root.findall(".//host"):
        # Check if host is up (pingable)
        status_elem = host.find("status")
        is_pingable = status_elem is not None and status_elem.get("state") == "up"

        # Get IP address
        ip_addr: str | None = None
        mac_address: str | None = None
        mac_vendor: str | None = None

        for addr_elem in host.findall("address"):
            addr_type = addr_elem.get("addrtype", "")
            if addr_type in ("ipv4", "ipv6"):
                ip_addr = addr_elem.get("addr")
            elif addr_type == "mac":
                mac_address = addr_elem.get("addr")
                mac_vendor = addr_elem.get("vendor")

        if not ip_addr:
            continue

        # Get hostname from reverse DNS
        hostname: str | None = None
        hostnames_elem = host.find("hostnames")
        if hostnames_elem is not None:
            hostname_elem = hostnames_elem.find("hostname")
            if hostname_elem is not None:
                hostname = hostname_elem.get("name")

        results.append(
            HostResult(
                ip=ip_addr,
                hostname=hostname,
                is_pingable=is_pingable,
                mac_address=mac_address,
                mac_vendor=mac_vendor,
            )
        )

    return results


def run_host_discovery(
    cidr: str,
    is_ipv6: bool,
    logger: logging.Logger,
    timeout: int = 300,
    known_hostnames: dict[str, str] | None = None,
) -> list[HostResult]:
    """
    Run host discovery using nmap ping scan with reverse DNS.
    Only returns hosts that responded to the scan (is_pingable=True).

    Command: nmap -sn -R [-6] --host-timeout {timeout}s -oX {output} {cidr}

    -sn: Ping scan (no port scan)
    -R: Always do reverse DNS lookup

    Args:
        cidr: CIDR to scan
        is_ipv6: Whether to use IPv6 mode
        logger: Logger instance
        timeout: Timeout in seconds

    Returns:
        List of discovered hosts
    """
    # Sanitize CIDR input to prevent command injection
    cidr = sanitize_cidr(cidr)

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as output_file:
        output_path = output_file.name

    command = [
        "nmap",
        "-sn",  # Ping scan only
        "-PE",  # ICMP echo only (no TCP/ARP probes)
        "--disable-arp-ping",  # Don't use ARP (which finds all hosts on local network)
        "-R",  # Always do reverse DNS
        *(["-6"] if is_ipv6 else []),
        "--host-timeout",
        f"{timeout}s",
        "-oX",
        output_path,
        cidr,
    ]

    logger.info("Running host discovery for %s", cidr)
    logger.info("Host discovery command: %s", format_command(command))
    if is_ipv6:
        logger.info("Host discovery IPv6 mode enabled (-6)")

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        # Read output for logging
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if line:
                    logger.info("Nmap: %s", line)

        returncode = process.wait()
        if returncode != 0:
            raise RuntimeError(f"Nmap host discovery failed with exit code {returncode}")

        # Read results
        with open(output_path, "r", encoding="utf-8") as handle:
            content = handle.read()

        hosts = parse_nmap_host_discovery_xml(content, logger)

        # Apply known hostnames from backend before API enrichment
        if known_hostnames:
            applied = 0
            updated: list[HostResult] = []
            for host in hosts:
                if not host.hostname and host.ip in known_hostnames:
                    updated.append(replace(host, hostname=known_hostnames[host.ip]))
                    applied += 1
                else:
                    updated.append(host)
            hosts = updated
            if applied:
                logger.info(
                    "Skipping enrichment for %d IPs with known hostnames", applied
                )

        # Enrich hostnames via external APIs for hosts without reverse DNS
        hosts = enrich_host_results(hosts, logger)

        return hosts

    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass


def detect_ssh_services(open_ports: list[OpenPortResult]) -> list[tuple[str, int]]:
    """
    Detect SSH services from open port results.

    SSH services are detected by:
    1. Port 22 (standard SSH port)
    2. service_guess containing "ssh" (from nmap service detection)

    Returns a list of (ip, port) tuples for SSH services.

    Args:
        open_ports: List of open port results

    Returns:
        List of (ip, port) tuples for SSH services
    """
    ssh_targets: list[tuple[str, int]] = []
    seen: set[tuple[str, int]] = set()

    for port_result in open_ports:
        key = (port_result.ip, port_result.port)
        if key in seen:
            continue

        # Check for standard SSH port
        if port_result.port == 22:
            ssh_targets.append(key)
            seen.add(key)
            continue

        # Check for SSH service identification from nmap
        if port_result.service_guess:
            service_lower = port_result.service_guess.lower()
            if "ssh" in service_lower:
                ssh_targets.append(key)
                seen.add(key)

    return ssh_targets


def run_ssh_probes(
    ssh_targets: list[tuple[str, int]],
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
    concurrency: int = DEFAULT_SSH_PROBE_CONCURRENCY,
    timeout: int = DEFAULT_SSH_PROBE_TIMEOUT,
    progress_offset: float = 0.0,
    progress_scale: float = 1.0,
) -> list[SSHProbeResult]:
    """
    Run SSH probes in parallel with configurable concurrency.

    Args:
        ssh_targets: List of (ip, port) tuples to probe
        logger: Logger instance
        progress_reporter: Optional progress reporter for updates
        concurrency: Maximum concurrent probes (default: 10)
        timeout: Timeout per probe in seconds (default: 10)
        progress_offset: Progress percentage offset for reporting
        progress_scale: Progress scaling factor for reporting

    Returns:
        List of SSHProbeResult objects (including failures)
    """
    if not ssh_targets:
        return []

    total = len(ssh_targets)
    logger.info("Starting SSH security probes on %d targets (concurrency=%d)", total, concurrency)

    results: list[SSHProbeResult] = []
    completed = 0

    def probe_target(target: tuple[str, int]) -> SSHProbeResult:
        ip, port = target
        return probe_ssh(ip, port, timeout=timeout)

    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        future_to_target = {executor.submit(probe_target, target): target for target in ssh_targets}

        for future in as_completed(future_to_target):
            target = future_to_target[future]
            try:
                result = future.result()
                results.append(result)

                if result.success:
                    logger.info(
                        "SSH probe completed: %s:%d - version=%s, auth=[%s]",
                        result.host,
                        result.port,
                        result.ssh_version or "unknown",
                        ", ".join(
                            m
                            for m in [
                                "publickey" if result.publickey_enabled else None,
                                "password" if result.password_enabled else None,
                                "keyboard-interactive"
                                if result.keyboard_interactive_enabled
                                else None,
                            ]
                            if m
                        )
                        or "none detected",
                    )
                else:
                    logger.warning(
                        "SSH probe failed: %s:%d - %s",
                        result.host,
                        result.port,
                        result.error_message or "unknown error",
                    )

            except Exception as exc:
                ip, port = target
                logger.error("SSH probe exception for %s:%d: %s", ip, port, exc)
                # Create a failed result for exceptions
                results.append(
                    SSHProbeResult(
                        host=ip,
                        port=port,
                        success=False,
                        error_message=str(exc),
                    )
                )

            completed += 1
            if progress_reporter:
                pct = (completed / total) * 100.0
                scaled_pct = progress_offset + (pct * progress_scale / 100.0)
                progress_reporter.update(
                    scaled_pct,
                    f"SSH probing: {completed}/{total} targets",
                )

    successful = sum(1 for r in results if r.success)
    logger.info("SSH probes completed: %d/%d successful", successful, total)

    return results
