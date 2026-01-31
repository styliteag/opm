"""Masscan scanner implementation."""

from __future__ import annotations

import json
import logging
import math
import os
import subprocess
import tempfile
from typing import TYPE_CHECKING, Any

from src.models import OpenPortResult, ScanRunResult
from src.threading_utils import ProcessTimeoutWatcher, ScanCancellationWatcher
from src.utils import (
    format_command,
    parse_int,
    parse_masscan_progress,
    split_port_spec,
)

if TYPE_CHECKING:
    from src.client import ScannerClient
    from src.threading_utils import ProgressReporter


def parse_masscan_json(content: str, logger: logging.Logger) -> list[dict[str, Any]]:
    """Parse masscan JSON output, handling both full JSON and line-by-line format.

    Args:
        content: JSON content from masscan output
        logger: Logger instance

    Returns:
        List of parsed entries
    """
    trimmed = content.strip()
    if not trimmed:
        return []
    try:
        data = json.loads(trimmed)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        logger.debug("Masscan JSON parsing failed; attempting line-by-line parsing")

    entries: list[dict[str, Any]] = []
    for line in trimmed.splitlines():
        line = line.strip().rstrip(",")
        if not line or line in {"[", "]"}:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(entry, dict):
            entries.append(entry)
    return entries


def extract_open_ports(entries: list[dict[str, Any]]) -> list[OpenPortResult]:
    """Extract open port results from masscan JSON entries.

    Args:
        entries: Parsed masscan JSON entries

    Returns:
        List of OpenPortResult objects
    """
    results: list[OpenPortResult] = []
    for entry in entries:
        ip = entry.get("ip")
        if not isinstance(ip, str):
            continue
        mac_address = None
        mac_vendor = None
        if isinstance(entry.get("mac"), str):
            mac_address = entry.get("mac")
        if isinstance(entry.get("vendor"), str):
            mac_vendor = entry.get("vendor")
        ports = entry.get("ports", [])
        if not isinstance(ports, list):
            continue
        for port_entry in ports:
            if not isinstance(port_entry, dict):
                continue
            status = port_entry.get("status")
            if isinstance(status, str) and status.lower() != "open":
                continue
            port_value = parse_int(port_entry.get("port"))
            if port_value is None:
                continue
            protocol_value = port_entry.get("proto") or port_entry.get("protocol") or "tcp"
            protocol = str(protocol_value)
            ttl = parse_int(port_entry.get("ttl"))
            banner = port_entry.get("banner")
            if banner is not None and not isinstance(banner, str):
                banner = str(banner)
            port_mac = port_entry.get("mac")
            port_vendor = port_entry.get("vendor")
            results.append(
                OpenPortResult(
                    ip=ip,
                    port=port_value,
                    protocol=protocol,
                    ttl=ttl,
                    banner=banner,
                    service_guess=None,  # masscan doesn't detect services
                    mac_address=port_mac if isinstance(port_mac, str) else mac_address,
                    mac_vendor=port_vendor if isinstance(port_vendor, str) else mac_vendor,
                )
            )
    return results


def build_masscan_port_spec(include_ports: str, scan_protocol: str) -> str:
    """Build masscan port specification based on scan protocol.

    Masscan port syntax:
    - TCP only: -p <ports> or -p T:<ports>
    - UDP only: -pU:<ports>
    - Both: -p T:<ports>,U:<ports>

    Args:
        include_ports: Ports to include
        scan_protocol: Protocol to scan (tcp, udp, or both)

    Returns:
        Masscan port specification string
    """
    if scan_protocol == "udp":
        return f"U:{include_ports}"
    elif scan_protocol == "both":
        return f"T:{include_ports},U:{include_ports}"
    else:
        # Default to TCP
        return include_ports


def run_masscan(
    client: ScannerClient,
    scan_id: int,
    cidr: str,
    port_spec: str,
    rate: int | None,
    scan_timeout: int,
    port_timeout: int,
    scan_protocol: str,
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
) -> ScanRunResult:
    """Run masscan to scan for open ports.

    Args:
        client: Scanner client for API communication
        scan_id: Scan ID
        cidr: CIDR to scan
        port_spec: Port specification
        rate: Scan rate limit
        scan_timeout: Scan timeout in seconds
        port_timeout: Port timeout in milliseconds
        scan_protocol: Protocol to scan (tcp, udp, or both)
        logger: Logger instance
        progress_reporter: Optional progress reporter

    Returns:
        ScanRunResult with discovered ports
    """
    include_ports, exclude_ports = split_port_spec(port_spec)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as output_file:
        output_path = output_file.name

    wait_seconds = max(1, int(math.ceil(port_timeout / 100.0)))

    # Build port specification based on protocol
    masscan_port_spec = build_masscan_port_spec(include_ports, scan_protocol)

    command = [
        "masscan",
        cidr,
        f"-p{masscan_port_spec}",
        "--banners",
        "--wait",
        str(wait_seconds),
        "-oJ",
        output_path,
    ]
    if exclude_ports:
        command.extend(["--exclude-ports", exclude_ports])

    if rate:
        command.extend(["--rate", str(rate)])

    logger.info("Masscan command: %s", format_command(command))
    protocol_label = scan_protocol.upper() if scan_protocol != "both" else "TCP+UDP"
    logger.info("Running masscan for %s with ports %s (%s)", cidr, include_ports, protocol_label)
    if exclude_ports:
        logger.info("Excluding ports: %s", exclude_ports)
    if rate:
        logger.info("Rate limit: %s pps", rate)
    logger.info("Port timeout (masscan --wait): %s seconds", wait_seconds)

    timeout_watcher: ProcessTimeoutWatcher | None = None
    cancel_watcher: ScanCancellationWatcher | None = None
    try:
        # Use Popen to capture stdout/stderr for progress monitoring
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        timeout_watcher = ProcessTimeoutWatcher(
            process=process,
            timeout_seconds=scan_timeout,
            logger=logger,
            label="Masscan",
        )
        timeout_watcher.start()
        cancel_watcher = ScanCancellationWatcher(
            client=client,
            scan_id=scan_id,
            process=process,
            logger=logger,
        )
        cancel_watcher.start()

        stderr_lines: list[str] = []
        # Read stdout (stderr is merged into stdout) line by line to extract progress
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                logger.info("Masscan: %s", line)
                stderr_lines.append(line)

                # Try to parse progress from stdout
                if progress_reporter:
                    progress = parse_masscan_progress(line)
                    if progress is not None:
                        progress_reporter.update(progress, f"Scanning: {progress}% complete")

        # Wait for process to complete
        returncode = process.wait()
        timed_out = False
        cancelled = False
        if timeout_watcher:
            timeout_watcher.stop()
            timeout_watcher.join()
            timed_out = timeout_watcher.timed_out
            timeout_watcher = None
        if cancel_watcher:
            cancel_watcher.stop()
            cancel_watcher.join()
            cancelled = cancel_watcher.cancelled
            cancel_watcher = None

        if cancelled:
            with open(output_path, "r", encoding="utf-8") as handle:
                content = handle.read()
            entries = parse_masscan_json(content, logger)
            return ScanRunResult(open_ports=extract_open_ports(entries), cancelled=True)
        if timed_out:
            raise TimeoutError(f"Masscan exceeded timeout of {scan_timeout} seconds")
        if returncode != 0:
            stderr_output = "\n".join(stderr_lines)
            if stderr_output:
                logger.error("Masscan stderr: %s", stderr_output)
            raise RuntimeError(f"Masscan failed with exit code {returncode}")

        with open(output_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    finally:
        if timeout_watcher:
            timeout_watcher.stop()
            timeout_watcher.join()
        if cancel_watcher:
            cancel_watcher.stop()
            cancel_watcher.join()
        try:
            os.remove(output_path)
        except OSError:
            pass

    entries = parse_masscan_json(content, logger)
    return ScanRunResult(open_ports=extract_open_ports(entries), cancelled=False)
