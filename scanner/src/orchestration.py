"""Job processing and orchestration logic."""

from __future__ import annotations

import logging
import shutil
from typing import Any

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
    ScanRunResult,
)
from src.scanners.nmap import run_nmap
from src.scanners.registry import get_scanner

# Ensure scanners are registered at import time
import src.scanners  # noqa: F401
from src.ssh_probe import SSHProbeResult
from src.threading_utils import LogBufferHandler, LogStreamer, ProgressReporter
from src.utils import check_ipv6_connectivity


def process_host_discovery_job(
    job: HostDiscoveryJob,
    client: ScannerClient,
    logger: logging.Logger,
) -> None:
    """Process a host discovery job.

    Args:
        job: Host discovery job to process
        client: Scanner client for API communication
        logger: Logger instance
    """
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


def _format_phase_progress(
    phase_name: str,
    phase_pct: float,
    phase_idx: int,
    total_phases: int,
) -> str:
    """Format progress message: 'Port Scan: 45% (2 of 3 phases)'."""
    labels = {
        "host_discovery": "Host Discovery",
        "port_scan": "Port Scan",
        "vulnerability": "Vulnerability Scan",
    }
    label = labels.get(phase_name, phase_name)
    return f"{label}: {phase_pct:.0f}% ({phase_idx} of {total_phases} phases)"


def _build_legacy_phases(job: ScannerJob) -> list[ScanPhase]:
    """Build phases from legacy scanner_type field for backward compat."""
    if job.scanner_type == "nse":
        return [
            ScanPhase(
                name="vulnerability",
                enabled=True,
                tool="nmap_nse",
                config={
                    "scripts": list(job.nse_scripts) if job.nse_scripts else [],
                    "script_args": dict(job.nse_script_args) if job.nse_script_args else {},
                },
            ),
        ]
    return [
        ScanPhase(
            name="port_scan",
            enabled=True,
            tool=job.scanner_type,
            config={},
        ),
    ]


def _run_host_discovery_phase(
    phase: ScanPhase,
    job: ScannerJob,
    client: ScannerClient,
    scan_id: int,
    logger: logging.Logger,
    _completed: dict[str, Any],
) -> dict[str, Any]:
    """Run host discovery phase, returns list of live IPs."""
    target = job.target_ip or job.cidr
    logger.info("=== Host Discovery Phase ===")
    logger.info("Target: %s", target)

    hosts = run_host_discovery(target, job.is_ipv6, logger)
    live_ips = [h.ip for h in hosts]
    logger.info("Host discovery found %d live hosts", len(live_ips))

    return {"live_ips": live_ips, "hosts": hosts}


def _run_port_scan_phase(
    phase: ScanPhase,
    job: ScannerJob,
    client: ScannerClient,
    scan_id: int,
    logger: logging.Logger,
    progress_reporter: ProgressReporter,
    completed: dict[str, Any],
) -> dict[str, Any]:
    """Run port scan phase, returns open ports."""
    config = phase.config
    port_range = config.get("port_range") or job.port_spec
    target = job.target_ip or job.cidr

    # Use live IPs from host discovery if available
    hd_result = completed.get("host_discovery")
    if hd_result and hd_result.get("live_ips"):
        live_ips = hd_result["live_ips"]
        target = ",".join(live_ips)
        logger.info("Port scan targeting %d live hosts from discovery", len(live_ips))

    logger.info("=== Port Scan Phase ===")
    logger.info("Tool: %s, Target: %s, Ports: %s", phase.tool, target, port_range)

    # For single-host scans, always use nmap
    if job.target_ip and phase.tool != "nmap":
        logger.info("Using nmap for single-host scan of %s", job.target_ip)
        result = run_nmap(
            client,
            scan_id,
            job.target_ip,
            port_range,
            job.scan_timeout,
            job.port_timeout,
            job.scan_protocol,
            job.is_ipv6,
            logger,
            progress_reporter,
        )
    else:
        scanner = get_scanner(phase.tool)
        logger.info("Using scanner: %s (%s)", scanner.name, scanner.label)
        result = scanner.run(
            client,
            scan_id,
            target,
            port_range,
            job.rate,
            job.scan_timeout,
            job.port_timeout,
            job.scan_protocol,
            job.is_ipv6,
            logger,
            progress_reporter,
        )

    if result.cancelled:
        raise _CancelledError()

    logger.info("Port scan found %d open ports", len(result.open_ports))
    return {"open_ports": result.open_ports, "result": result}


def _run_vulnerability_phase(
    phase: ScanPhase,
    job: ScannerJob,
    client: ScannerClient,
    scan_id: int,
    logger: logging.Logger,
    progress_reporter: ProgressReporter,
    completed: dict[str, Any],
) -> dict[str, Any]:
    """Run NSE vulnerability scan phase."""
    config = phase.config
    scripts = config.get("scripts") or (list(job.nse_scripts) if job.nse_scripts else None)
    script_args = config.get("script_args") or job.nse_script_args

    logger.info("=== Vulnerability Scan Phase ===")
    logger.info("Scripts: %s", scripts)

    # Determine target: use open ports from port_scan if available
    target = job.target_ip or job.cidr
    port_spec = job.port_spec
    ps_result = completed.get("port_scan")
    if ps_result and ps_result.get("open_ports"):
        open_ports: list[OpenPortResult] = ps_result["open_ports"]
        port_set = sorted({p.port for p in open_ports})
        if port_set:
            port_spec = ",".join(str(p) for p in port_set)
            ips = sorted({p.ip for p in open_ports})
            if ips:
                target = ",".join(ips)
            logger.info(
                "Vulnerability scan targeting %d ports on %d hosts",
                len(port_set),
                len(ips),
            )

    # Set NSE scripts on client for NseScanner to pick up
    nse_scripts = list(scripts) if scripts else None

    if job.custom_script_hashes and nse_scripts:
        from src.script_cache import ensure_scripts_cached, get_script_path, is_custom

        ensure_scripts_cached(client, job.custom_script_hashes)
        nse_scripts = [
            str(get_script_path(s)) if is_custom(s) else s
            for s in nse_scripts
        ]

    client._current_nse_scripts = nse_scripts  # type: ignore[attr-defined]
    client._current_nse_script_args = script_args  # type: ignore[attr-defined]

    scanner = get_scanner("nse")
    result = scanner.run(
        client,
        scan_id,
        target,
        port_spec,
        job.rate,
        job.scan_timeout,
        job.port_timeout,
        job.scan_protocol,
        job.is_ipv6,
        logger,
        progress_reporter,
    )

    if result.cancelled:
        raise _CancelledError()

    return {"nse_result": result}


class _CancelledError(Exception):
    """Raised when a scan is cancelled by the user."""


_PHASE_RUNNERS = {
    "host_discovery": _run_host_discovery_phase,
    "port_scan": _run_port_scan_phase,
    "vulnerability": _run_vulnerability_phase,
}


def _run_phase_pipeline(
    phases: list[ScanPhase],
    job: ScannerJob,
    client: ScannerClient,
    scan_id: int,
    logger: logging.Logger,
    progress_reporter: ProgressReporter,
) -> None:
    """Execute scan phases sequentially as a pipeline."""
    enabled_phases = [p for p in phases if p.enabled]
    total = len(enabled_phases)
    completed: dict[str, Any] = {}

    logger.info("Starting %d-phase pipeline: %s", total, [p.name for p in enabled_phases])

    for idx, phase in enumerate(enabled_phases):
        phase_num = idx + 1

        # Check for cancellation between phases
        try:
            status = client.get_scan_status(scan_id)
            if status == "cancelled":
                logger.info("Scan cancelled before phase %s", phase.name)
                _submit_pipeline_results(
                    client, scan_id, completed, logger, status="failed",
                    error="Scan cancelled by user request",
                )
                return
        except Exception:
            pass  # If status check fails, continue anyway

        msg = _format_phase_progress(phase.name, 0, phase_num, total)
        progress_reporter.update(0, msg)

        runner = _PHASE_RUNNERS.get(phase.name)
        if runner is None:
            logger.warning("Unknown phase '%s', skipping", phase.name)
            continue

        try:
            result = runner(
                phase, job, client, scan_id, logger, progress_reporter, completed,
            )
            completed[phase.name] = result
        except _CancelledError:
            logger.info("Scan cancelled during phase %s", phase.name)
            _submit_pipeline_results(
                client, scan_id, completed, logger, status="failed",
                error="Scan cancelled by user request",
            )
            return
        except Exception as exc:
            logger.exception("Phase %s failed", phase.name)
            _submit_pipeline_results(
                client, scan_id, completed, logger, status="partial",
                error=f"Phase {phase.name} failed: {exc}",
            )
            return

        msg = _format_phase_progress(phase.name, 100, phase_num, total)
        progress_reporter.update((phase_num / total) * 100, msg)

    # All phases complete
    progress_reporter.update(100, "Scan complete")
    _submit_pipeline_results(client, scan_id, completed, logger, status="success")


def _submit_pipeline_results(
    client: ScannerClient,
    scan_id: int,
    completed: dict[str, Any],
    logger: logging.Logger,
    status: str = "success",
    error: str | None = None,
) -> None:
    """Submit results from all completed phases."""
    # Port scan results
    ps_result = completed.get("port_scan")
    open_ports = ps_result["open_ports"] if ps_result else []

    # SSH probing on port scan results
    ssh_results: list[SSHProbeResult] = []
    if open_ports and status == "success":
        ssh_targets = detect_ssh_services(open_ports)
        if ssh_targets:
            logger.info("Running SSH probes on %d targets", len(ssh_targets))
            ssh_results = run_ssh_probes(
                ssh_targets,
                logger,
                concurrency=DEFAULT_SSH_PROBE_CONCURRENCY,
                timeout=DEFAULT_SSH_PROBE_TIMEOUT,
            )

    # Check if vulnerability phase ran (NSE results submitted by NseScanner itself)
    vuln_result = completed.get("vulnerability")

    # Submit port scan results if we have them
    if ps_result:
        try:
            client.submit_results(
                scan_id, status, open_ports,
                ssh_results=ssh_results,
                error_message=error,
            )
            logger.info("Submitted port scan results for scan %s", scan_id)
        except Exception:
            logger.exception("Failed to submit port scan results for scan %s", scan_id)
    elif vuln_result:
        # Vulnerability-only scan — NSE scanner handles its own submission
        logger.info("NSE scan completed for scan %s", scan_id)
    else:
        # No results to submit (host discovery only, or failed early)
        try:
            client.submit_results(
                scan_id, status, [], error_message=error,
            )
        except Exception:
            logger.exception("Failed to submit results for scan %s", scan_id)


def process_job(
    job: ScannerJob,
    client: ScannerClient,
    logger: logging.Logger,
    log_buffer: LogBufferHandler,
) -> None:
    """Process a scan job — dispatches to phase pipeline or legacy single-scanner.

    Args:
        job: Scan job to process
        client: Scanner client for API communication
        logger: Logger instance
        log_buffer: Log buffer for collecting logs
    """
    log_buffer.reset()
    logger.info("Claiming job for network %s", job.network_id)

    scan_id = client.claim_job(job.network_id)
    if scan_id is None:
        log_buffer.reset()
        return

    logger.info("Claimed job for network %s with scan ID %s", job.network_id, scan_id)
    if job.target_ip:
        logger.info("Single-host scan mode: targeting %s", job.target_ip)

    # Start log streamer
    log_streamer = LogStreamer(client=client, log_buffer=log_buffer, scan_id=scan_id)
    log_streamer.start()

    # Start progress reporter
    progress_reporter = ProgressReporter(client=client, scan_id=scan_id)
    progress_reporter.start()

    try:
        progress_reporter.update(0, "Starting scan...")

        if job.is_ipv6:
            progress_reporter.update(0, "Checking IPv6 connectivity...")
            if not check_ipv6_connectivity(logger):
                raise RuntimeError("IPv6 connectivity not available")

        # Use phase pipeline if phases are available
        phases = job.phases or _build_legacy_phases(job)
        _run_phase_pipeline(
            phases, job, client, scan_id, logger, progress_reporter,
        )

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


def check_dependencies(logger: logging.Logger) -> None:
    """Check if required external tools are available."""
    for tool in ["masscan", "nmap"]:
        if not shutil.which(tool):
            logger.warning(
                "Required tool '%s' not found in PATH. "
                "Scans using this tool will fail.",
                tool,
            )
