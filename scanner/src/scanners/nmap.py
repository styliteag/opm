"""Nmap scanner implementation for port scanning and service detection."""

from __future__ import annotations

import logging
import os
import pty
import re
import select
import signal
import sys
import tempfile
import time
import xml.etree.ElementTree as ET
from typing import TYPE_CHECKING

from src.models import OpenPortResult, ScanRunResult
from src.utils import format_command, sanitize_cidr, sanitize_port_spec, split_port_spec

if TYPE_CHECKING:
    from src.client import ScannerClient
    from src.threading_utils import ProgressReporter


def run_nmap_service_detection(
    client: ScannerClient,
    scan_id: int,
    open_ports: list[OpenPortResult],
    scan_timeout: int,
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
) -> list[OpenPortResult]:
    """
    Run nmap service detection (-sV) on ports discovered by masscan.

    This is the second phase of hybrid scanning: masscan finds open ports quickly,
    then nmap identifies what services are running on them.

    Uses PTY for progress output and a target file for large host lists.

    Returns updated OpenPortResult list with service_guess populated.
    """
    if not open_ports:
        return open_ports

    # Group ports by IP for efficient scanning
    ip_ports: dict[str, set[int]] = {}
    for port_result in open_ports:
        if port_result.ip not in ip_ports:
            ip_ports[port_result.ip] = set()
        ip_ports[port_result.ip].add(port_result.port)

    num_hosts = len(ip_ports)
    logger.info(
        "Starting nmap service detection on %d ports across %d hosts",
        len(open_ports),
        num_hosts,
    )

    if progress_reporter:
        progress_reporter.update(75, f"Service detection: 0/{num_hosts} hosts")

    # Build port list: all unique ports across all IPs
    all_ports: set[int] = set()
    for ports in ip_ports.values():
        all_ports.update(ports)
    port_list = ",".join(str(p) for p in sorted(all_ports))

    # Create temp files for targets and XML output
    targets_path: str | None = None
    output_path: str | None = None

    try:
        # Write targets to file (avoids command line length limits)
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as targets_file:
            targets_path = targets_file.name
            for ip in ip_ports.keys():
                targets_file.write(f"{ip}\n")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as output_file:
            output_path = output_file.name

        # Build nmap command for service detection only
        command = [
            "nmap",
            "-sV",  # Service detection
            "--version-intensity",
            "5",  # Balanced intensity (0-9)
            "-T4",  # Aggressive timing
            "-p",
            port_list,
            "-oX",
            output_path,
            "--open",  # Only show open ports
            "-Pn",  # Skip host discovery (we know hosts are up from masscan)
            "--stats-every",
            "5s",  # Report progress every 5 seconds
            "-iL",
            targets_path,  # Read targets from file
        ]

        logger.info("Nmap service detection command: %s", format_command(command))
        logger.info("Targets file: %s (%d hosts)", targets_path, num_hosts)

        # Calculate timeout for service detection phase
        # Give it 30% of the original scan timeout, minimum 120 seconds
        svc_timeout = max(120, int(scan_timeout * 0.3))

        # Use PTY for progress output (like _run_nmap_phase)
        pid, master_fd = pty.fork()

        if pid == 0:
            # Child process
            try:
                os.execvp(command[0], command)
            except Exception as e:
                sys.stderr.write(f"Failed to exec nmap: {e}\n")
                os._exit(1)

        # Parent process
        timed_out = False
        cancelled = False
        child_exited = False
        exit_status = 0

        # Progress tracking
        hosts_completed = 0
        total_hosts_up = 0
        max_pct = 75.0  # Start at 75% (masscan done)

        try:
            start_time = time.time()
            buffer = ""

            while True:
                elapsed = time.time() - start_time

                # Check timeout
                if svc_timeout > 0 and elapsed >= svc_timeout:
                    if not timed_out:
                        logger.warning(
                            "Service detection exceeded timeout (%d seconds); terminating",
                            svc_timeout,
                        )
                        timed_out = True
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except OSError:
                            pass
                    break

                # Check cancellation
                try:
                    status = client.get_scan_status(scan_id)
                    if status == "cancelled":
                        logger.warning("Scan cancelled by user request during service detection")
                        cancelled = True
                        try:
                            os.kill(pid, signal.SIGTERM)
                        except OSError:
                            pass
                        break
                except Exception:
                    pass

                # Check if child exited
                try:
                    wait_pid, wait_status = os.waitpid(pid, os.WNOHANG)
                    if wait_pid != 0:
                        child_exited = True
                        if os.WIFEXITED(wait_status):
                            exit_status = os.WEXITSTATUS(wait_status)
                        elif os.WIFSIGNALED(wait_status):
                            exit_status = -os.WTERMSIG(wait_status)
                        break
                except ChildProcessError:
                    child_exited = True
                    break

                # Read PTY output
                try:
                    readable, _, _ = select.select([master_fd], [], [], 1.0)
                    if master_fd in readable:
                        try:
                            data = os.read(master_fd, 4096)
                            if not data:
                                child_exited = True
                                break
                            text = data.decode("utf-8", errors="replace")
                            buffer += text

                            while "\n" in buffer or "\r" in buffer:
                                line, sep, buffer = (
                                    buffer.partition("\n")
                                    if "\n" in buffer
                                    else buffer.partition("\r")
                                )
                                line = line.strip()
                                if not line:
                                    continue

                                # Log progress-related lines
                                if any(
                                    x in line
                                    for x in [
                                        "Stats:",
                                        "Timing:",
                                        "elapsed",
                                        "remaining",
                                        "done",
                                        "hosts completed",
                                    ]
                                ):
                                    logger.info("Nmap svc: %s", line)

                                    # Parse host completion: "8 hosts completed (32 up)"
                                    stats_match = re.search(
                                        r"(\d+)\s+hosts?\s+completed\s+\((\d+)\s+up\)",
                                        line,
                                        re.IGNORECASE,
                                    )
                                    if stats_match:
                                        hosts_completed = int(stats_match.group(1))
                                        total_hosts_up = int(stats_match.group(2))

                                    # Parse percentage: "About 26.91% done"
                                    pct_match = re.search(
                                        r"About\s+([\d.]+)%\s+done", line, re.IGNORECASE
                                    )
                                    if pct_match and progress_reporter:
                                        try:
                                            nmap_pct = float(pct_match.group(1))
                                            # Scale from 75-100% (service detection phase)
                                            scaled_pct = 75.0 + (nmap_pct * 0.25)
                                            if scaled_pct > max_pct:
                                                max_pct = scaled_pct
                                            hosts_str = (
                                                f"{hosts_completed}/{total_hosts_up}"
                                                if total_hosts_up > 0
                                                else f"0/{num_hosts}"
                                            )
                                            progress_reporter.update(
                                                max_pct,
                                                f"Service detection: {hosts_str} hosts, {nmap_pct:.0f}%",
                                            )
                                        except ValueError:
                                            pass

                                elif "Nmap scan report" in line or "/tcp" in line or "/udp" in line:
                                    logger.info("Nmap svc: %s", line)

                        except OSError:
                            child_exited = True
                            break
                except (OSError, ValueError):
                    pass

            # Wait for child if not exited
            if not child_exited:
                try:
                    for _ in range(10):
                        wait_pid, wait_status = os.waitpid(pid, os.WNOHANG)
                        if wait_pid != 0:
                            if os.WIFEXITED(wait_status):
                                exit_status = os.WEXITSTATUS(wait_status)
                            elif os.WIFSIGNALED(wait_status):
                                exit_status = -os.WTERMSIG(wait_status)
                            child_exited = True
                            break
                        time.sleep(0.5)
                    if not child_exited:
                        logger.error("Nmap service detection did not terminate; killing")
                        os.kill(pid, signal.SIGKILL)
                        os.waitpid(pid, 0)
                except (ChildProcessError, OSError):
                    pass
        finally:
            try:
                os.close(master_fd)
            except OSError:
                pass

        # Handle results
        if cancelled:
            logger.warning("Service detection cancelled, returning original results")
            return open_ports

        if timed_out:
            logger.warning(
                "Service detection timed out after %d seconds, returning original results",
                svc_timeout,
            )
            return open_ports

        if exit_status != 0:
            logger.warning(
                "Nmap service detection failed with exit code %d, returning original results",
                exit_status,
            )
            return open_ports

        # Parse nmap XML output
        xml_content = ""
        try:
            with open(output_path, "r", encoding="utf-8") as handle:
                xml_content = handle.read()
        except FileNotFoundError:
            logger.warning("Nmap XML output file not found, returning original results")
            return open_ports

        nmap_results = _parse_nmap_xml(xml_content, logger)

        # Build lookup map from nmap results: (ip, port) -> service_guess
        service_map: dict[tuple[str, int], str] = {}
        for nmap_port in nmap_results:
            if nmap_port.service_guess:
                service_map[(nmap_port.ip, nmap_port.port)] = nmap_port.service_guess

        logger.info("Service detection identified %d services", len(service_map))

        # Update original results with service_guess
        updated_ports: list[OpenPortResult] = []
        for port_result in open_ports:
            key = (port_result.ip, port_result.port)
            service_guess = service_map.get(key)

            updated_ports.append(
                OpenPortResult(
                    ip=port_result.ip,
                    port=port_result.port,
                    protocol=port_result.protocol,
                    ttl=port_result.ttl,
                    banner=port_result.banner,
                    service_guess=service_guess,
                    mac_address=port_result.mac_address,
                    mac_vendor=port_result.mac_vendor,
                )
            )

        return updated_ports

    except Exception as exc:
        logger.warning(
            "Service detection failed with error: %s, returning original results",
            exc,
        )
        return open_ports
    finally:
        # Clean up temp files
        for path in [targets_path, output_path]:
            if path:
                try:
                    os.remove(path)
                except OSError:
                    pass


def _parse_nmap_xml(xml_content: str, logger: logging.Logger) -> list[OpenPortResult]:
    """Parse nmap XML output and extract open ports."""
    results: list[OpenPortResult] = []

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        logger.error("Failed to parse nmap XML output: %s", exc)
        return results

    for host in root.findall(".//host"):
        # Skip hosts that are not up
        status_elem = host.find("status")
        if status_elem is not None and status_elem.get("state") != "up":
            continue

        # Get IP address
        ip_addr: str | None = None
        ipv4_addr: str | None = None
        ipv6_addr: str | None = None
        mac_address: str | None = None
        mac_vendor: str | None = None

        for addr_elem in host.findall("address"):
            addr_type = addr_elem.get("addrtype", "")
            if addr_type in ("ipv4", "ipv6"):
                address_value = addr_elem.get("addr")
                if addr_type == "ipv6":
                    ipv6_addr = address_value
                else:
                    ipv4_addr = address_value
            elif addr_type == "mac":
                mac_address = addr_elem.get("addr")
                mac_vendor = addr_elem.get("vendor")

        ip_addr = ipv6_addr or ipv4_addr
        if not ip_addr:
            continue

        # Process ports
        ports_elem = host.find("ports")
        if ports_elem is None:
            continue

        for port_elem in ports_elem.findall("port"):
            # Check if port is open
            state_elem = port_elem.find("state")
            if state_elem is None:
                continue
            state = state_elem.get("state", "")
            if state != "open":
                continue

            # Get port number and protocol
            port_id = port_elem.get("portid")
            if port_id is None:
                continue
            try:
                port_num = int(port_id)
            except ValueError:
                continue

            protocol = port_elem.get("protocol", "tcp")

            # Get service info for banner and service_guess
            banner: str | None = None
            service_guess: str | None = None
            service_elem = port_elem.find("service")
            if service_elem is not None:
                service_parts: list[str] = []
                service_name = service_elem.get("name")
                if service_name:
                    service_parts.append(service_name)
                    # Use service name as the service_guess
                    service_guess = service_name
                product = service_elem.get("product")
                if product:
                    service_parts.append(product)
                version = service_elem.get("version")
                if version:
                    service_parts.append(version)
                extra_info = service_elem.get("extrainfo")
                if extra_info:
                    service_parts.append(f"({extra_info})")
                if service_parts:
                    banner = " ".join(service_parts)

            # Get TTL from times or extrareasons if available (nmap doesn't typically expose TTL directly)
            # TTL is not commonly available in nmap output, so we leave it as None
            ttl: int | None = None

            results.append(
                OpenPortResult(
                    ip=ip_addr,
                    port=port_num,
                    protocol=protocol,
                    ttl=ttl,
                    banner=banner,
                    service_guess=service_guess,
                    mac_address=mac_address,
                    mac_vendor=mac_vendor,
                )
            )

    return results


def _run_nmap_phase(
    client: ScannerClient,
    scan_id: int,
    command: list[str],
    output_path: str,
    scan_timeout: int,
    phase_name: str,
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
    progress_offset: float = 0.0,
    progress_scale: float = 1.0,
) -> tuple[str, bool, bool, int]:
    """Run a single nmap phase and return (xml_content, cancelled, timed_out, exit_status).

    Uses pty.fork() to run nmap with a pseudo-TTY for progress output.
    Progress is scaled: actual_pct = progress_offset + (nmap_pct * progress_scale)
    """
    logger.info("Nmap %s command: %s", phase_name, format_command(command))

    pid, master_fd = pty.fork()

    if pid == 0:
        try:
            os.execvp(command[0], command)
        except Exception as e:
            sys.stderr.write(f"Failed to exec nmap: {e}\n")
            os._exit(1)

    # Parent process
    timed_out = False
    cancelled = False
    child_exited = False
    exit_status = 0
    output_lines: list[str] = []

    # Track nmap host progress for accurate overall percentage
    hosts_completed = 0
    total_hosts_up = 0
    hosts_in_progress = 0
    last_total_hosts = 0  # Track when nmap discovers more hosts
    max_scaled_pct = 0.0  # Never let progress go backwards

    try:
        start_time = time.time()
        warning_issued = False
        buffer = ""

        while True:
            elapsed = time.time() - start_time

            if scan_timeout > 0 and elapsed >= scan_timeout:
                if not timed_out:
                    logger.error(
                        "Nmap %s exceeded max runtime (%s seconds); terminating",
                        phase_name,
                        scan_timeout,
                    )
                    timed_out = True
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass
                break

            if scan_timeout > 0 and not warning_issued and elapsed >= scan_timeout * 0.9:
                logger.warning("Nmap %s approaching max runtime (90%% elapsed)", phase_name)
                warning_issued = True

            try:
                status = client.get_scan_status(scan_id)
                if status == "cancelled":
                    logger.warning("Scan cancelled by user request")
                    cancelled = True
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass
                    break
            except Exception as exc:
                logger.warning("Failed to check scan status: %s", exc)

            try:
                wait_pid, wait_status = os.waitpid(pid, os.WNOHANG)
                if wait_pid != 0:
                    child_exited = True
                    if os.WIFEXITED(wait_status):
                        exit_status = os.WEXITSTATUS(wait_status)
                    elif os.WIFSIGNALED(wait_status):
                        exit_status = -os.WTERMSIG(wait_status)
                    break
            except ChildProcessError:
                child_exited = True
                break

            try:
                readable, _, _ = select.select([master_fd], [], [], 1.0)
                if master_fd in readable:
                    try:
                        data = os.read(master_fd, 4096)
                        if not data:
                            child_exited = True
                            break
                        text = data.decode("utf-8", errors="replace")
                        buffer += text
                        while "\n" in buffer or "\r" in buffer:
                            line, sep, buffer = (
                                buffer.partition("\n") if "\n" in buffer else buffer.partition("\r")
                            )
                            line = line.strip()
                            if line:
                                output_lines.append(line)
                                if any(
                                    x in line
                                    for x in ["Stats:", "Timing:", "elapsed", "remaining", "done"]
                                ):
                                    logger.info("Nmap: %s", line)

                                    # Parse host completion stats: "8 hosts completed (32 up), 24 undergoing"
                                    stats_match = re.search(
                                        r"(\d+)\s+hosts?\s+completed\s+\((\d+)\s+up\)(?:,\s+(\d+)\s+undergoing)?",
                                        line,
                                        re.IGNORECASE,
                                    )
                                    if stats_match:
                                        hosts_completed = int(stats_match.group(1))
                                        total_hosts_up = int(stats_match.group(2))
                                        hosts_in_progress = (
                                            int(stats_match.group(3)) if stats_match.group(3) else 0
                                        )

                                        # When nmap discovers more hosts, reset max to completed work only
                                        if (
                                            total_hosts_up > last_total_hosts
                                            and last_total_hosts > 0
                                        ):
                                            # Recalculate max based on completed hosts (locked-in progress)
                                            completed_pct = (
                                                hosts_completed / total_hosts_up
                                            ) * 100.0
                                            max_scaled_pct = progress_offset + (
                                                completed_pct * progress_scale
                                            )
                                            logger.info(
                                                "Host count increased %d -> %d, reset progress to %.1f%% (completed hosts only)",
                                                last_total_hosts,
                                                total_hosts_up,
                                                max_scaled_pct,
                                            )
                                        last_total_hosts = total_hosts_up

                                    # Parse batch percentage: "About 26.91% done"
                                    pct_match = re.search(
                                        r"About\s+([\d.]+)%\s+done", line, re.IGNORECASE
                                    )
                                    if pct_match and progress_reporter and total_hosts_up > 0:
                                        try:
                                            batch_pct = float(pct_match.group(1))
                                            # Calculate true overall progress accounting for host batching
                                            # Formula: (completed_hosts + in_progress_hosts * batch_pct/100) / total_hosts * 100
                                            batch_progress = hosts_in_progress * batch_pct / 100.0
                                            overall_nmap_pct = (
                                                (hosts_completed + batch_progress) / total_hosts_up
                                            ) * 100.0
                                            # Scale to phase range (0-50% for phase 1, 50-100% for phase 2)
                                            scaled_pct = progress_offset + (
                                                overall_nmap_pct * progress_scale
                                            )
                                            # Never let progress bar go backwards within the same host count
                                            # But always update the message so user sees activity
                                            display_pct = max(scaled_pct, max_scaled_pct)
                                            if scaled_pct > max_scaled_pct:
                                                max_scaled_pct = scaled_pct
                                            progress_msg = f"{phase_name}: {hosts_completed}/{total_hosts_up} hosts, batch {batch_pct:.0f}%"
                                            progress_reporter.update(display_pct, progress_msg)
                                            logger.info(
                                                "Progress %.1f%% (overall: %.1f%%, batch: %.1f%%) - %d/%d hosts",
                                                display_pct,
                                                overall_nmap_pct,
                                                batch_pct,
                                                hosts_completed,
                                                total_hosts_up,
                                            )
                                        except (ValueError, ZeroDivisionError):
                                            pass
                                elif (
                                    line.startswith("Nmap scan report")
                                    or "PORT" in line
                                    or "/tcp" in line
                                    or "/udp" in line
                                ):
                                    logger.info("Nmap: %s", line)
                    except OSError:
                        child_exited = True
                        break
            except (OSError, ValueError):
                pass

        if not child_exited:
            try:
                for _ in range(10):
                    wait_pid, wait_status = os.waitpid(pid, os.WNOHANG)
                    if wait_pid != 0:
                        if os.WIFEXITED(wait_status):
                            exit_status = os.WEXITSTATUS(wait_status)
                        elif os.WIFSIGNALED(wait_status):
                            exit_status = -os.WTERMSIG(wait_status)
                        child_exited = True
                        break
                    time.sleep(0.5)
                if not child_exited:
                    logger.error("Nmap did not terminate gracefully; killing")
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
            except (ChildProcessError, OSError):
                pass
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass

    # Read XML output
    content = ""
    try:
        with open(output_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    except FileNotFoundError:
        logger.warning("Nmap XML output file not found")
    except Exception as exc:
        logger.error("Failed to read nmap XML output: %s", exc)

    try:
        os.remove(output_path)
    except OSError:
        pass

    return content, cancelled, timed_out, exit_status


def run_nmap(
    client: ScannerClient,
    scan_id: int,
    cidr: str,
    port_spec: str,
    scan_timeout: int,
    port_timeout: int,
    scan_protocol: str,
    is_ipv6: bool,
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
) -> ScanRunResult:
    """Run nmap scan using hybrid approach: fast port scan, then service detection.

    Phase 1: Fast SYN scan to discover open ports (no -sV)
    Phase 2: Service detection only on discovered open ports (-sV)
    """
    # Sanitize inputs to prevent command injection
    cidr = sanitize_cidr(cidr)
    port_spec = sanitize_port_spec(port_spec)

    include_ports, exclude_ports = split_port_spec(port_spec)

    if exclude_ports:
        logger.warning(
            "Nmap does not support port exclusions in the same way as masscan. "
            "Excluded ports (%s) will not be scanned if included in the port spec.",
            exclude_ports,
        )

    # Build scan type flags based on protocol
    scan_flags: list[str] = []
    if scan_protocol == "tcp":
        scan_flags = ["-sS"]
    elif scan_protocol == "udp":
        scan_flags = ["-sU"]
    else:  # both
        scan_flags = ["-sS", "-sU"]

    protocol_label = scan_protocol.upper() if scan_protocol != "both" else "TCP+UDP"
    logger.info(
        "Running nmap hybrid scan for %s with ports %s (%s)", cidr, include_ports, protocol_label
    )
    if is_ipv6:
        logger.info("Nmap IPv6 mode enabled (-6)")

    # ========== PHASE 1: Fast port discovery (no service detection) ==========
    logger.info("=== Phase 1: Fast port discovery ===")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as f:
        phase1_output = f.name

    phase1_command = [
        "nmap",
        *(["-6"] if is_ipv6 else []),
        *scan_flags,
        "-n",  # No DNS resolution (faster)
        f"-p{include_ports}",
        "--max-rtt-timeout",
        f"{int(port_timeout)}ms",
        "-oX",
        phase1_output,
        "--open",
        "-T4",
        "--stats-every",
        "5s",
        cidr,
    ]

    # Use 70% of timeout for phase 1
    phase1_timeout = int(scan_timeout * 0.7) if scan_timeout > 0 else 0

    xml_content, cancelled, timed_out, exit_status = _run_nmap_phase(
        client,
        scan_id,
        phase1_command,
        phase1_output,
        phase1_timeout,
        "Phase 1 - Port Discovery",
        logger,
        progress_reporter,
        progress_offset=0.0,
        progress_scale=0.5,  # Maps to 0-50%
    )

    if cancelled:
        return ScanRunResult(open_ports=_parse_nmap_xml(xml_content, logger), cancelled=True)
    if timed_out:
        raise TimeoutError(f"Nmap phase 1 exceeded max runtime of {phase1_timeout} seconds")
    if exit_status != 0:
        raise RuntimeError(f"Nmap phase 1 failed with exit code {exit_status}")

    # Parse phase 1 results to get open ports
    phase1_ports = _parse_nmap_xml(xml_content, logger)

    # Report 50% progress (phase 1 complete)
    if progress_reporter:
        progress_reporter.update(50.0, "Phase 1 complete - analyzing results")

    if not phase1_ports:
        logger.info("No open ports found in phase 1, skipping service detection")
        if progress_reporter:
            progress_reporter.update(100.0, "Complete - no open ports found")
        return ScanRunResult(open_ports=[], cancelled=False)

    # Collect unique ip:port combinations for phase 2
    open_port_targets: dict[str, set[int]] = {}
    for port in phase1_ports:
        if port.ip not in open_port_targets:
            open_port_targets[port.ip] = set()
        open_port_targets[port.ip].add(port.port)

    total_open = sum(len(ports) for ports in open_port_targets.values())
    logger.info(
        "Phase 1 complete: found %d open ports on %d hosts", total_open, len(open_port_targets)
    )

    # ========== PHASE 2: Service detection on open ports only ==========
    logger.info("=== Phase 2: Service detection on %d open ports ===", total_open)
    if progress_reporter:
        progress_reporter.update(
            50.0, f"Starting Phase 2 - detecting services on {total_open} ports"
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as f:
        phase2_output = f.name

    # Build target list: specific IPs with their open ports
    # For efficiency, scan all hosts but only the ports we found open
    all_open_ports = sorted(set(p for ports in open_port_targets.values() for p in ports))
    port_list = ",".join(str(p) for p in all_open_ports)
    target_ips = list(open_port_targets.keys())

    # Write target IPs to a file to avoid command line length limits
    with tempfile.NamedTemporaryFile(delete=False, suffix=".txt", mode="w") as targets_file:
        phase2_targets_file = targets_file.name
        for ip in target_ips:
            targets_file.write(f"{ip}\n")

    phase2_command = [
        "nmap",
        *(["-6"] if is_ipv6 else []),
        *scan_flags,
        "-sV",  # Service detection
        "--version-intensity",
        "5",  # Balanced intensity
        f"-p{port_list}",
        "--max-rtt-timeout",
        f"{int(port_timeout)}ms",
        "-oX",
        phase2_output,
        "--open",
        "-T4",
        "--stats-every",
        "5s",
        "-iL",
        phase2_targets_file,  # Read targets from file
    ]

    # Use remaining 30% of timeout for phase 2
    phase2_timeout = int(scan_timeout * 0.3) if scan_timeout > 0 else 0

    try:
        xml_content2, cancelled2, timed_out2, exit_status2 = _run_nmap_phase(
            client,
            scan_id,
            phase2_command,
            phase2_output,
            phase2_timeout,
            "Phase 2 - Service Detection",
            logger,
            progress_reporter,
            progress_offset=50.0,
            progress_scale=0.5,  # Maps to 50-100%
        )

        if cancelled2:
            # Return phase 1 results if cancelled during phase 2
            return ScanRunResult(open_ports=phase1_ports, cancelled=True)
        if timed_out2:
            # Return phase 1 results if phase 2 times out
            logger.warning("Phase 2 timed out, returning phase 1 results without service info")
            return ScanRunResult(open_ports=phase1_ports, cancelled=False)
        if exit_status2 != 0:
            logger.warning("Phase 2 failed (exit %d), returning phase 1 results", exit_status2)
            return ScanRunResult(open_ports=phase1_ports, cancelled=False)

        # Parse phase 2 results (with service info)
        phase2_ports = _parse_nmap_xml(xml_content2, logger)
        logger.info("Phase 2 complete: service detection on %d ports", len(phase2_ports))

        if progress_reporter:
            progress_reporter.update(
                100.0, f"Complete - {len(phase2_ports)} open ports with service info"
            )

        return ScanRunResult(open_ports=phase2_ports, cancelled=False)
    finally:
        # Clean up targets file
        try:
            os.unlink(phase2_targets_file)
        except OSError:
            pass
