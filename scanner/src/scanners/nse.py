"""NSE vulnerability scanner implementation.

Runs nmap with NSE scripts on already-discovered ports to detect
vulnerabilities and extract CVE identifiers from script output.
"""

from __future__ import annotations

import glob
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

from src.models import NseScriptResult, ScanRunResult
from src.utils import format_command, sanitize_cidr

if TYPE_CHECKING:
    from src.client import ScannerClient
    from src.threading_utils import ProgressReporter

# Regex for extracting CVE IDs from NSE script output
CVE_PATTERN = re.compile(r"CVE-\d{4}-\d{4,}", re.IGNORECASE)

# Fallback scripts — only used if profile somehow has no scripts
_FALLBACK_SCRIPTS = ["vulners"]

# Cached set of script names available on this nmap installation
_available_scripts: set[str] | None = None


def _get_available_scripts(logger: logging.Logger) -> set[str]:
    """Discover which NSE scripts are installed on this system."""
    global _available_scripts  # noqa: PLW0603
    if _available_scripts is not None:
        return _available_scripts

    scripts: set[str] = set()

    # Scan nmap script directories for .nse files
    for search_dir in ["/usr/share/nmap/scripts", "/usr/local/share/nmap/scripts"]:
        for path in glob.glob(os.path.join(search_dir, "*.nse")):
            name = os.path.splitext(os.path.basename(path))[0]
            scripts.add(name)

    if scripts:
        logger.info("Discovered %d available NSE scripts on this system", len(scripts))
    else:
        logger.warning("Could not discover available NSE scripts; passing all names to nmap")

    _available_scripts = scripts
    return scripts


def _filter_scripts(
    requested: list[str], logger: logging.Logger
) -> list[str]:
    """Filter script list to only those available on the system.

    Scripts that are file paths (custom scripts) are passed through unchanged.
    """
    available = _get_available_scripts(logger)
    if not available:
        return requested

    kept: list[str] = []
    skipped: list[str] = []
    for script in requested:
        # Custom script paths are always passed through
        if "/" in script or script.endswith(".nse"):
            kept.append(script)
        elif script in available:
            kept.append(script)
        else:
            skipped.append(script)

    if skipped:
        logger.warning(
            "Filtered out %d scripts not available on this system: %s",
            len(skipped),
            ", ".join(skipped[:20]) + ("..." if len(skipped) > 20 else ""),
        )

    return kept


class NseScanner:
    """NSE vulnerability scanner using nmap scripting engine."""

    name = "nse"
    label = "NSE Vulnerability"

    def run(
        self,
        client: ScannerClient,
        scan_id: int,
        target: str,
        port_spec: str,
        rate: int | None,
        scan_timeout: int,
        port_timeout: int,
        scan_protocol: str,
        is_ipv6: bool,
        logger: logging.Logger,
        progress_reporter: ProgressReporter | None = None,
    ) -> ScanRunResult:
        """Run an NSE vulnerability scan.

        Fetches NSE script list from job metadata, runs nmap with those scripts
        on the specified ports, parses XML output, and extracts CVEs.
        """
        sanitized_target = sanitize_cidr(target)

        # Get NSE scripts from job metadata (set by client when fetching jobs)
        nse_scripts = getattr(client, "_current_nse_scripts", None) or _FALLBACK_SCRIPTS
        nse_script_args = getattr(client, "_current_nse_script_args", None)

        # Filter to only scripts that exist on this nmap installation
        nse_scripts = _filter_scripts(nse_scripts, logger)
        if not nse_scripts:
            logger.error("No valid NSE scripts available after filtering; aborting scan")
            return ScanRunResult(open_ports=[], cancelled=False)

        scripts_str = ",".join(nse_scripts)
        logger.info(
            "=== NSE Vulnerability Scan ===\n"
            "  Target: %s\n"
            "  Scripts (%d): %s\n"
            "  Ports: %s\n"
            "  Timeout: %ds",
            sanitized_target,
            len(nse_scripts),
            scripts_str,
            port_spec or "all",
            scan_timeout,
        )

        if progress_reporter:
            progress_reporter.update(0.0, f"Starting NSE scan with {len(nse_scripts)} scripts")

        # Build nmap command
        output_fd, output_path = tempfile.mkstemp(suffix=".xml", prefix="nse_")
        os.close(output_fd)

        command = [
            "nmap",
            "-Pn",              # Skip host discovery (already known live)
            "-sV",              # Service version detection (needed for vulners)
            "-T4",              # Aggressive timing
            "--script", scripts_str,
            "-oX", output_path,
            "-v",               # Verbose for progress output
            "--stats-every", "10s",  # Print progress every 10 seconds
        ]

        # Add script args if provided
        if nse_script_args:
            args_parts = [f"{k}={v}" for k, v in nse_script_args.items()]
            command.extend(["--script-args", ",".join(args_parts)])

        # Port specification
        if port_spec:
            command.extend(["-p", port_spec])

        # IPv6 support
        if is_ipv6:
            command.append("-6")

        command.extend(t.strip() for t in sanitized_target.split(","))

        # Execute nmap with PTY for progress tracking
        nse_results, cancelled = _run_nse_scan(
            client=client,
            scan_id=scan_id,
            command=command,
            output_path=output_path,
            scan_timeout=scan_timeout,
            logger=logger,
            progress_reporter=progress_reporter,
        )

        if cancelled:
            logger.warning("NSE scan cancelled")
        else:
            # Count CVEs and vulnerable findings
            total_cves = sum(len(r.cve_ids) for r in nse_results)
            vuln_count = sum(1 for r in nse_results if "VULNERABLE" in r.script_output.upper())
            logger.info(
                "=== NSE Scan Complete ===\n"
                "  Findings: %d\n"
                "  CVEs found: %d\n"
                "  VULNERABLE: %d",
                len(nse_results),
                total_cves,
                vuln_count,
            )

        # Submit NSE results to backend (always submit, even if empty,
        # so the scan status transitions from RUNNING to COMPLETED)
        if not cancelled:
            _submit_nse_results(client, scan_id, nse_results, logger)

        # Return empty ScanRunResult — NSE scans don't discover ports,
        # they analyze already-discovered ones
        return ScanRunResult(open_ports=[], cancelled=cancelled)


def _run_nse_scan(
    client: ScannerClient,
    scan_id: int,
    command: list[str],
    output_path: str,
    scan_timeout: int,
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
) -> tuple[list[NseScriptResult], bool]:
    """Run nmap NSE scan with PTY for progress monitoring.

    Returns (nse_results, cancelled).
    """
    logger.info("NSE scan command: %s", format_command(command))

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
    max_pct = 0.0
    hosts_done = 0
    current_host = ""

    try:
        start_time = time.time()
        buffer = ""

        while True:
            elapsed = time.time() - start_time

            if scan_timeout > 0 and elapsed >= scan_timeout:
                if not timed_out:
                    logger.error("NSE scan exceeded max runtime (%ds); terminating", scan_timeout)
                    timed_out = True
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass
                break

            # Check for cancellation
            try:
                status = client.get_scan_status(scan_id)
                if status == "cancelled":
                    logger.warning("NSE scan cancelled by user request")
                    cancelled = True
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass
                    break
            except Exception as exc:
                logger.warning("Failed to check scan status: %s", exc)

            # Read PTY output for progress
            try:
                rlist, _, _ = select.select([master_fd], [], [], 2.0)
                if rlist:
                    try:
                        data = os.read(master_fd, 4096)
                        if not data:
                            child_exited = True
                            break
                        buffer += data.decode("utf-8", errors="replace")
                        while "\n" in buffer:
                            line, buffer = buffer.split("\n", 1)
                            line = line.strip()
                            if not line:
                                continue

                            # Parse progress percentage
                            pct_match = re.search(
                                r"About\s+([\d.]+)%\s+done", line, re.IGNORECASE
                            )
                            if pct_match and progress_reporter:
                                try:
                                    nmap_pct = float(pct_match.group(1))
                                    if nmap_pct > max_pct:
                                        max_pct = nmap_pct
                                    progress_reporter.update(
                                        max_pct,
                                        f"NSE scanning: {nmap_pct:.0f}% complete",
                                    )
                                except ValueError:
                                    pass

                            # Parse host completion stats
                            host_match = re.search(
                                r"Nmap scan report for\s+(\S+)", line
                            )
                            if host_match:
                                hosts_done += 1
                                current_host = host_match.group(1)
                                logger.info(
                                    "NSE: scanning host %s (%d done)",
                                    current_host,
                                    hosts_done,
                                )
                                if progress_reporter and max_pct < 5:
                                    progress_reporter.update(
                                        5.0, f"NSE: scanning {current_host}"
                                    )

                            # Log NSE script output as it happens
                            if "VULNERABLE" in line.upper():
                                logger.warning("NSE: VULNERABLE: %s", line)
                            elif any(x in line for x in [
                                "NSE:", "Completed NSE", "Script scan",
                                "scan report", "/tcp", "/udp",
                                "CVE-", "vulners",
                            ]):
                                logger.info("NSE: %s", line)
                            elif "Initiating NSE" in line or "NSE: Script" in line:
                                logger.info("NSE: %s", line)
                                if progress_reporter:
                                    progress_reporter.update(
                                        max(max_pct, 10.0),
                                        "Running NSE scripts...",
                                    )

                    except OSError:
                        child_exited = True
                        break
            except (OSError, ValueError):
                pass

        # Wait for child
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
                    logger.error("NSE scan did not terminate; killing")
                    os.kill(pid, signal.SIGKILL)
                    os.waitpid(pid, 0)
            except (ChildProcessError, OSError):
                pass
    finally:
        try:
            os.close(master_fd)
        except OSError:
            pass

    # Parse results
    if cancelled or timed_out:
        return [], cancelled

    if exit_status != 0:
        logger.warning("NSE scan failed with exit code %d", exit_status)
        return [], False

    # Read XML output
    xml_content = ""
    try:
        with open(output_path, "r", encoding="utf-8") as f:
            xml_content = f.read()
    except FileNotFoundError:
        logger.warning("NSE XML output file not found")
        return [], False
    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass

    if progress_reporter:
        progress_reporter.update(95.0, "Parsing NSE results")

    results = _parse_nse_xml(xml_content, logger)

    if progress_reporter:
        progress_reporter.update(100.0, f"NSE scan complete: {len(results)} findings")

    return results, False


def _parse_nse_xml(xml_content: str, logger: logging.Logger) -> list[NseScriptResult]:
    """Parse nmap XML output and extract NSE script results."""
    results: list[NseScriptResult] = []

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        logger.error("Failed to parse NSE XML output: %s", exc)
        return results

    for host in root.findall(".//host"):
        status_elem = host.find("status")
        if status_elem is not None and status_elem.get("state") != "up":
            continue

        # Get IP address
        ip_addr = _extract_ip(host)
        if not ip_addr:
            continue

        # Process ports and their scripts
        ports_elem = host.find("ports")
        if ports_elem is None:
            continue

        for port_elem in ports_elem.findall("port"):
            port_id = port_elem.get("portid")
            if port_id is None:
                continue
            try:
                port_num = int(port_id)
            except ValueError:
                continue

            protocol = port_elem.get("protocol", "tcp")

            # Extract NSE script results
            for script_elem in port_elem.findall("script"):
                script_id = script_elem.get("id")
                if not script_id:
                    continue

                script_output = script_elem.get("output", "")

                # Also collect structured table/elem data
                table_output = _extract_script_tables(script_elem)
                if table_output:
                    script_output = script_output + "\n" + table_output

                if not script_output.strip():
                    continue

                # Extract CVE IDs
                cve_ids = _extract_cves(script_output)

                # Determine severity
                severity = _infer_severity(script_output, cve_ids)

                results.append(
                    NseScriptResult(
                        ip=ip_addr,
                        port=port_num,
                        protocol=protocol,
                        script_name=script_id,
                        script_output=script_output.strip(),
                        cve_ids=cve_ids,
                        severity=severity,
                    )
                )

        # Also check host-level scripts
        hostscript = host.find("hostscript")
        if hostscript is not None:
            for script_elem in hostscript.findall("script"):
                script_id = script_elem.get("id")
                if not script_id:
                    continue
                script_output = script_elem.get("output", "")
                table_output = _extract_script_tables(script_elem)
                if table_output:
                    script_output = script_output + "\n" + table_output
                if not script_output.strip():
                    continue

                cve_ids = _extract_cves(script_output)
                severity = _infer_severity(script_output, cve_ids)

                results.append(
                    NseScriptResult(
                        ip=ip_addr,
                        port=0,
                        protocol="tcp",
                        script_name=script_id,
                        script_output=script_output.strip(),
                        cve_ids=cve_ids,
                        severity=severity,
                    )
                )

    logger.info("Parsed %d NSE script results", len(results))
    return results


def _extract_ip(host: ET.Element) -> str | None:
    """Extract the best IP address from an nmap host element."""
    ipv4 = None
    ipv6 = None
    for addr_elem in host.findall("address"):
        addr_type = addr_elem.get("addrtype", "")
        if addr_type == "ipv6":
            ipv6 = addr_elem.get("addr")
        elif addr_type == "ipv4":
            ipv4 = addr_elem.get("addr")
    return ipv6 or ipv4


def _extract_script_tables(script_elem: ET.Element) -> str:
    """Extract structured data from script table/elem elements."""
    parts: list[str] = []

    for table in script_elem.findall(".//table"):
        table_key = table.get("key", "")
        for elem in table.findall("elem"):
            key = elem.get("key", "")
            value = elem.text or ""
            if key and value:
                prefix = f"{table_key}." if table_key else ""
                parts.append(f"  {prefix}{key}: {value}")

    for elem in script_elem.findall("elem"):
        key = elem.get("key", "")
        value = elem.text or ""
        if value:
            if key:
                parts.append(f"  {key}: {value}")
            else:
                parts.append(f"  {value}")

    return "\n".join(parts)


def _extract_cves(output: str) -> list[str]:
    """Extract unique CVE IDs from script output."""
    found = CVE_PATTERN.findall(output)
    # Deduplicate and normalize to uppercase
    seen: set[str] = set()
    unique: list[str] = []
    for cve in found:
        upper = cve.upper()
        if upper not in seen:
            seen.add(upper)
            unique.append(upper)
    return unique


def _infer_severity(output: str, cve_ids: list[str]) -> str:
    """Infer severity from script output content."""
    output_upper = output.upper()

    if "VULNERABLE" in output_upper:
        return "high"
    if cve_ids:
        # Multiple CVEs suggest a more severe finding
        if len(cve_ids) >= 3:
            return "high"
        return "medium"
    if any(word in output_upper for word in ["CRITICAL", "EXPLOIT", "RCE", "REMOTE CODE"]):
        return "critical"
    if any(word in output_upper for word in ["WARNING", "WEAK", "INSECURE", "DEPRECATED"]):
        return "medium"
    return "info"


def _submit_nse_results(
    client: ScannerClient,
    scan_id: int,
    nse_results: list[NseScriptResult],
    logger: logging.Logger,
) -> None:
    """Submit NSE results to the backend."""
    client.submit_nse_results(scan_id, nse_results)
    logger.info("Submitted %d NSE results to backend", len(nse_results))
