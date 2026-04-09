"""Job processing and orchestration logic."""

from __future__ import annotations

import logging
import shutil
from typing import Any

# Ensure scanners are registered at import time
import src.scanners  # noqa: F401
from src.client import ScannerClient
from src.discovery import (
    DEFAULT_SSH_PROBE_CONCURRENCY,
    DEFAULT_SSH_PROBE_TIMEOUT,
    detect_ssh_services,
    run_host_discovery,
    run_ssh_probes,
)
from src.models import (
    HostDiscoveryJob,
    OpenPortResult,
    ScannerJob,
    ScanPhase,
)
from src.scanners.nmap import run_nmap
from src.scanners.registry import get_scanner
from src.ssh_probe import SSHProbeResult
from src.threading_utils import LogBufferHandler, LogStreamer, ProgressReporter
from src.utils import check_ipv6_connectivity


def process_host_discovery_job(
    job: HostDiscoveryJob,
    client: ScannerClient,
    logger: logging.Logger,
) -> None:
    """Process a host discovery job."""
    logger.info(
        "Claiming host discovery job for network %s (scan_id=%s)",
        job.network_id,
        job.scan_id,
    )

    claimed_job = client.claim_host_discovery_job(job.scan_id)
    if claimed_job is None:
        return

    logger.info("Claimed host discovery job for network %s", claimed_job.network_id)

    try:
        if claimed_job.is_ipv6:
            if not check_ipv6_connectivity(logger):
                raise RuntimeError("IPv6 connectivity not available")

        hosts = run_host_discovery(
            claimed_job.cidr,
            claimed_job.is_ipv6,
            logger,
            known_hostnames=claimed_job.known_hostnames,
        )

        logger.info("Host discovery completed, found %s hosts", len(hosts))
        client.submit_host_discovery_results(claimed_job.scan_id, "success", hosts)
        logger.info("Submitted host discovery results for scan %s", claimed_job.scan_id)

    except Exception as exc:
        logger.exception("Host discovery failed for network %s", claimed_job.network_id)
        try:
            client.submit_host_discovery_results(
                claimed_job.scan_id, "failed", [], error_message=str(exc)
            )
        except Exception:
            logger.exception(
                "Failed to submit failure results for host discovery scan %s",
                claimed_job.scan_id,
            )


# ── Phase Pipeline ───────────────────────────────────────────────────────


def _format_phase_progress(
    phase_name: str, pct: float, phase_num: int, total: int,
) -> str:
    """Format: 'Port Scan: 45% (2 of 3 phases)'."""
    labels = {
        "host_discovery": "Host Discovery",
        "port_scan": "Port Scan",
        "vulnerability": "Vulnerability Scan",
    }
    label = labels.get(phase_name, phase_name)
    return f"{label}: {pct:.0f}% ({phase_num} of {total} phases)"


def _build_legacy_phases(job: ScannerJob) -> list[ScanPhase]:
    """Build phases from legacy scanner_type for backward compat."""
    if job.scanner_type == "nse":
        return [
            ScanPhase(name="vulnerability", enabled=True, tool="nmap_nse", config={}),
        ]
    return [
        ScanPhase(name="port_scan", enabled=True, tool=job.scanner_type, config={}),
    ]


class _CancelledError(Exception):
    """Raised when a scan is cancelled by the user."""


def _run_host_discovery_phase(
    phase: ScanPhase, job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger,
    progress_reporter: ProgressReporter, completed: dict[str, Any],
) -> dict[str, Any]:
    """Run host discovery phase."""
    target = job.target_ip or job.cidr
    logger.info("=== Host Discovery Phase === target=%s", target)
    hosts = run_host_discovery(target, job.is_ipv6, logger)
    live_ips = [h.ip for h in hosts]
    logger.info("Host discovery found %d live hosts", len(live_ips))
    return {"live_ips": live_ips, "hosts": hosts}


def _run_port_scan_phase(
    phase: ScanPhase, job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger,
    progress_reporter: ProgressReporter, completed: dict[str, Any],
) -> dict[str, Any]:
    """Run port scan phase."""
    config = phase.config
    port_range = config.get("port_range") or job.port_spec
    target = job.target_ip or job.cidr

    # Use live IPs from host discovery if available
    hd = completed.get("host_discovery")
    if hd and hd.get("live_ips"):
        live_ips = hd["live_ips"]
        target = ",".join(live_ips)
        logger.info("Port scan targeting %d live hosts from discovery", len(live_ips))

    logger.info("=== Port Scan Phase === tool=%s target=%s ports=%s", phase.tool, target, port_range)

    if job.target_ip and phase.tool != "nmap":
        result = run_nmap(
            client, scan_id, job.target_ip, port_range,
            job.scan_timeout, job.port_timeout, job.scan_protocol,
            job.is_ipv6, logger, progress_reporter,
        )
    else:
        scanner = get_scanner(phase.tool)
        result = scanner.run(
            client, scan_id, target, port_range, job.rate,
            job.scan_timeout, job.port_timeout, job.scan_protocol,
            job.is_ipv6, logger, progress_reporter,
        )

    if result.cancelled:
        raise _CancelledError()

    logger.info("Port scan found %d open ports", len(result.open_ports))
    return {"open_ports": result.open_ports, "result": result}


def _run_vulnerability_phase(
    phase: ScanPhase, job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger,
    progress_reporter: ProgressReporter, completed: dict[str, Any],
) -> dict[str, Any]:
    """Run NSE vulnerability scan phase."""
    logger.info("=== Vulnerability Scan Phase ===")

    # Determine target and ports from port_scan phase
    target = job.target_ip or job.cidr
    port_spec = job.port_spec
    ps = completed.get("port_scan")
    if ps and ps.get("open_ports"):
        open_ports: list[OpenPortResult] = ps["open_ports"]
        port_set = sorted({p.port for p in open_ports})
        if port_set:
            port_spec = ",".join(str(p) for p in port_set)
            ips = sorted({p.ip for p in open_ports})
            if ips:
                target = ",".join(ips)
            logger.info("Vuln scan targeting %d ports on %d hosts", len(port_set), len(ips))

    # Scripts come from job-level NSE fields (populated from nse_profile)
    nse_scripts = list(job.nse_scripts) if job.nse_scripts else None

    if job.custom_script_hashes and nse_scripts:
        from src.script_cache import ensure_scripts_cached, get_script_path, is_custom
        ensure_scripts_cached(client, job.custom_script_hashes)
        nse_scripts = [
            str(get_script_path(s)) if is_custom(s) else s for s in nse_scripts
        ]

    client._current_nse_scripts = nse_scripts  # type: ignore[attr-defined]
    client._current_nse_script_args = job.nse_script_args  # type: ignore[attr-defined]

    scanner = get_scanner("nse")
    result = scanner.run(
        client, scan_id, target, port_spec, job.rate,
        job.scan_timeout, job.port_timeout, job.scan_protocol,
        job.is_ipv6, logger, progress_reporter,
    )

    if result.cancelled:
        raise _CancelledError()

    return {"nse_result": result}


_PHASE_RUNNERS = {
    "host_discovery": _run_host_discovery_phase,
    "port_scan": _run_port_scan_phase,
    "vulnerability": _run_vulnerability_phase,
}


def _run_phase_pipeline(
    phases: list[ScanPhase], job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger, progress_reporter: ProgressReporter,
) -> None:
    """Execute scan phases sequentially as a pipeline."""
    enabled = [p for p in phases if p.enabled]
    total = len(enabled)
    completed: dict[str, Any] = {}

    logger.info("Starting %d-phase pipeline: %s", total, [p.name for p in enabled])

    for idx, phase in enumerate(enabled):
        num = idx + 1

        # Check cancellation between phases
        try:
            status = client.get_scan_status(scan_id)
            if status == "cancelled":
                logger.info("Scan cancelled before phase %s", phase.name)
                _submit_pipeline_results(
                    client, scan_id, completed, logger,
                    status="failed", error="Cancelled by user",
                )
                return
        except Exception:
            pass

        msg = _format_phase_progress(phase.name, 0, num, total)
        progress_reporter.update((idx / total) * 100, msg)

        runner = _PHASE_RUNNERS.get(phase.name)
        if runner is None:
            logger.warning("Unknown phase '%s', skipping", phase.name)
            continue

        try:
            result = runner(phase, job, client, scan_id, logger, progress_reporter, completed)
            completed[phase.name] = result
        except _CancelledError:
            logger.info("Scan cancelled during phase %s", phase.name)
            _submit_pipeline_results(
                client, scan_id, completed, logger,
                status="failed", error="Cancelled by user",
            )
            return
        except Exception as exc:
            logger.exception("Phase %s failed", phase.name)
            _submit_pipeline_results(
                client, scan_id, completed, logger,
                status="failed", error=f"Phase {phase.name} failed: {exc}",
            )
            return

        msg = _format_phase_progress(phase.name, 100, num, total)
        progress_reporter.update((num / total) * 100, msg)

    progress_reporter.update(100, "Scan complete")
    _submit_pipeline_results(client, scan_id, completed, logger, status="success")


def _submit_pipeline_results(
    client: ScannerClient, scan_id: int, completed: dict[str, Any],
    logger: logging.Logger, status: str = "success", error: str | None = None,
) -> None:
    """Submit results from completed phases."""
    ps = completed.get("port_scan")
    open_ports = ps["open_ports"] if ps else []

    # SSH probing on port scan results
    ssh_results: list[SSHProbeResult] = []
    if open_ports and status == "success":
        ssh_targets = detect_ssh_services(open_ports)
        if ssh_targets:
            logger.info("Running SSH probes on %d targets", len(ssh_targets))
            ssh_results = run_ssh_probes(
                ssh_targets, logger,
                concurrency=DEFAULT_SSH_PROBE_CONCURRENCY,
                timeout=DEFAULT_SSH_PROBE_TIMEOUT,
            )

    vuln = completed.get("vulnerability")

    if ps:
        try:
            client.submit_results(scan_id, status, open_ports, ssh_results=ssh_results, error_message=error)
            logger.info("Submitted port scan results for scan %s", scan_id)
        except Exception:
            logger.exception("Failed to submit port scan results for scan %s", scan_id)
    elif vuln:
        # NSE scanner handles its own submission
        logger.info("NSE scan completed for scan %s", scan_id)
    else:
        try:
            client.submit_results(scan_id, status, [], error_message=error)
        except Exception:
            logger.exception("Failed to submit results for scan %s", scan_id)


# ── Main Entry Point ────────────────────────────────────────────────────


def process_job(
    job: ScannerJob,
    client: ScannerClient,
    logger: logging.Logger,
    log_buffer: LogBufferHandler,
) -> None:
    """Process a scan job — phase pipeline or legacy single-scanner."""
    log_buffer.reset()
    logger.info("Claiming job for network %s", job.network_id)

    scan_id = client.claim_job(job.network_id)
    if scan_id is None:
        log_buffer.reset()
        return

    logger.info("Claimed job for network %s with scan ID %s", job.network_id, scan_id)
    if job.target_ip:
        logger.info("Single-host scan mode: targeting %s", job.target_ip)

    log_streamer = LogStreamer(client=client, log_buffer=log_buffer, scan_id=scan_id)
    log_streamer.start()

    progress_reporter = ProgressReporter(client=client, scan_id=scan_id)
    progress_reporter.start()

    try:
        progress_reporter.update(0, "Starting scan...")

        if job.is_ipv6:
            progress_reporter.update(0, "Checking IPv6 connectivity...")
            if not check_ipv6_connectivity(logger):
                raise RuntimeError("IPv6 connectivity not available")

        # Use phase pipeline when phases are available
        phases = job.phases or _build_legacy_phases(job)
        _run_phase_pipeline(phases, job, client, scan_id, logger, progress_reporter)

    except Exception as exc:
        logger.exception("Scan failed for network %s", job.network_id)
        try:
            client.submit_results(scan_id, "failed", [], error_message=str(exc))
        except Exception:
            logger.exception("Failed to submit failure results for scan %s", scan_id)
    finally:
        progress_reporter.stop()
        progress_reporter.join()
        log_streamer.stop()
        log_streamer.join()


def process_greenbone_job(
    job: ScannerJob,
    client: ScannerClient,
    logger: logging.Logger,
    log_buffer: LogBufferHandler,
) -> None:
    """Process a Greenbone/GVM scan job — standalone pipeline."""
    log_buffer.reset()
    logger.info("Claiming Greenbone job for network %s", job.network_id)

    scan_id = client.claim_job(job.network_id)
    if scan_id is None:
        log_buffer.reset()
        return

    logger.info("Claimed Greenbone job for network %s with scan ID %s", job.network_id, scan_id)

    log_streamer = LogStreamer(client=client, log_buffer=log_buffer, scan_id=scan_id)
    log_streamer.start()

    progress_reporter = ProgressReporter(client=client, scan_id=scan_id)
    progress_reporter.start()

    try:
        from src.scanners.greenbone import GreenboneScanner

        progress_reporter.update(0, "Connecting to GVM...")

        scanner = GreenboneScanner()
        gvm_config = job.gvm_scan_config or "Full and fast"

        open_ports, vulnerabilities = scanner.run_scan(
            client=client,
            scan_id=scan_id,
            target_cidr=job.target_ip or job.cidr,
            port_spec=job.port_spec,
            gvm_scan_config=gvm_config,
            logger=logger,
            progress_reporter=progress_reporter,
        )

        # Submit open ports via standard endpoint
        if open_ports:
            try:
                client.submit_results(scan_id, "success", open_ports)
                logger.info("Submitted %d open ports for scan %s", len(open_ports), scan_id)
            except Exception:
                logger.exception("Failed to submit open port results for scan %s", scan_id)

        # Submit vulnerabilities via dedicated endpoint
        if vulnerabilities:
            try:
                client.submit_vulnerability_results(scan_id, vulnerabilities)
                logger.info(
                    "Submitted %d vulnerabilities for scan %s",
                    len(vulnerabilities),
                    scan_id,
                )
            except Exception:
                logger.exception("Failed to submit vulnerability results for scan %s", scan_id)

        # If no open ports found, still mark scan as success
        if not open_ports:
            try:
                client.submit_results(scan_id, "success", [])
            except Exception:
                logger.exception("Failed to submit empty results for scan %s", scan_id)

    except Exception as exc:
        logger.exception("Greenbone scan failed for network %s", job.network_id)
        try:
            client.submit_results(scan_id, "failed", [], error_message=str(exc))
        except Exception:
            logger.exception("Failed to submit failure results for scan %s", scan_id)
    finally:
        progress_reporter.stop()
        progress_reporter.join()
        log_streamer.stop()
        log_streamer.join()


def check_dependencies(logger: logging.Logger) -> None:
    """Check if required external tools are available."""
    for tool in ["masscan", "nmap"]:
        if not shutil.which(tool):
            logger.warning(
                "Required tool '%s' not found in PATH. "
                "Scans using this tool will fail.",
                tool,
            )
