"""Job processing and orchestration logic."""

from __future__ import annotations

import logging
import shutil
import time
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
            client=client,
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
        "ssh_probe": "SSH Probe",
        "vulnerability": "Vulnerability Scan",
    }
    label = labels.get(phase_name, phase_name)
    return f"{label}: {pct:.0f}% ({phase_num} of {total} phases)"


def _build_legacy_phases(job: ScannerJob) -> list[ScanPhase]:
    """Build phases from legacy scanner_type for backward compat.

    Nuclei post-phase appending is handled centrally by
    ``_ensure_nuclei_phase`` so both legacy and pre-built pipelines pick up
    ``job.nuclei_enabled`` identically.
    """
    if job.scanner_type == "nse":
        return [
            ScanPhase(name="vulnerability", enabled=True, tool="nmap_nse", config={}),
        ]
    return [
        ScanPhase(name="port_scan", enabled=True, tool=job.scanner_type, config={}),
    ]


_SSH_ELIGIBLE_SCANNER_TYPES = ("masscan", "nmap")


def _ensure_ssh_phase(
    phases: list[ScanPhase], job: ScannerJob
) -> list[ScanPhase]:
    """Insert an SSH probe phase after port_scan when eligible.

    Inserts before any vulnerability phase so SSH probing happens between
    port discovery and nuclei/NSE scanning.
    """
    if not job.ssh_probe_enabled or job.scanner_type not in _SSH_ELIGIBLE_SCANNER_TYPES:
        return phases
    if any(p.name == "ssh_probe" for p in phases):
        return phases

    ssh_phase = ScanPhase(name="ssh_probe", enabled=True, tool="ssh_probe", config={})

    # Insert after the last port_scan and before the first vulnerability phase.
    insert_idx = len(phases)
    for i, p in enumerate(phases):
        if p.name == "vulnerability":
            insert_idx = i
            break

    return [*phases[:insert_idx], ssh_phase, *phases[insert_idx:]]


_NUCLEI_ELIGIBLE_SCANNER_TYPES = ("masscan", "nmap")


def _ensure_nuclei_phase(
    phases: list[ScanPhase], job: ScannerJob
) -> list[ScanPhase]:
    """Ensure a nuclei vulnerability phase is present when eligible.

    Appends a ``ScanPhase(name="vulnerability", tool="nuclei", ...)`` when
    all of the following hold:

    * ``job.nuclei_enabled`` is true,
    * ``job.scanner_type`` is masscan or nmap (nuclei is mutually exclusive
      with NSE and with greenbone by design), and
    * ``phases`` does not already contain an enabled nuclei phase.

    This runs for *both* legacy-built pipelines and pre-built ``job.phases``
    coming from the backend, so networks with a stored ``phases`` column
    that only lists ``host_discovery`` + ``port_scan`` + a disabled
    ``nmap_nse`` vulnerability phase still get nuclei when the user has
    flipped ``nuclei_enabled`` on at the network level.
    """
    if not job.nuclei_enabled or job.scanner_type not in _NUCLEI_ELIGIBLE_SCANNER_TYPES:
        return phases
    if any(p.enabled and p.tool == "nuclei" for p in phases):
        return phases
    return [
        *phases,
        ScanPhase(
            name="vulnerability",
            enabled=True,
            tool="nuclei",
            config={
                "tags": job.nuclei_tags,
                "severity": job.nuclei_severity,
                "timeout": job.nuclei_timeout,
            },
        ),
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

    logger.info(
        "=== Port Scan Phase === tool=%s target=%s ports=%s",
        phase.tool,
        target,
        port_range,
    )

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


def _run_ssh_probe_phase(
    phase: ScanPhase, job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger,
    progress_reporter: ProgressReporter, completed: dict[str, Any],
) -> dict[str, Any]:
    """Run SSH probes on ports identified by the port_scan phase."""
    logger.info("=== SSH Probe Phase ===")

    ps = completed.get("port_scan")
    open_ports = ps.get("open_ports", []) if ps else []
    if not open_ports:
        logger.info("ssh_probe: no open ports, skipping")
        return {"ssh_results": []}

    ssh_targets = detect_ssh_services(open_ports)
    if not ssh_targets:
        logger.info("ssh_probe: no SSH services detected, skipping")
        return {"ssh_results": []}

    logger.info("ssh_probe: probing %d SSH target(s)", len(ssh_targets))
    progress_reporter.update(0, "SSH Probe: starting")

    ssh_results = run_ssh_probes(
        ssh_targets, logger,
        concurrency=DEFAULT_SSH_PROBE_CONCURRENCY,
        timeout=DEFAULT_SSH_PROBE_TIMEOUT,
    )

    responded = sum(1 for r in ssh_results if r.success)
    logger.info(
        "ssh_probe: %d/%d targets responded",
        responded,
        len(ssh_targets),
    )
    progress_reporter.update(100, f"SSH Probe: {responded}/{len(ssh_targets)} responded")
    return {"ssh_results": ssh_results}


def _run_nuclei_phase(
    phase: ScanPhase, job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger,
    progress_reporter: ProgressReporter, completed: dict[str, Any],
) -> dict[str, Any]:
    """Run nuclei against HTTP-ish ports discovered by the port_scan phase.

    Best-effort: any failure (missing binary, subprocess crash, parse
    error, submission error) is caught and logged here so nuclei problems
    can never turn a successful port scan into a failed scan notification.
    """
    logger.info("=== Vulnerability Scan Phase (Nuclei) ===")

    try:
        from src.scanners.nuclei import build_targets, run_nuclei
    except Exception as exc:  # pragma: no cover — import safety net
        logger.warning("nuclei: module import failed: %s", exc)
        return {"nuclei_result": None}

    ps = completed.get("port_scan")
    open_ports = ps.get("open_ports", []) if ps else []
    if not open_ports:
        logger.info("nuclei: no open ports from port_scan phase, skipping")
        return {"nuclei_result": None}

    # SNI fan-out: fetch cached hostnames for the discovered IPs so
    # nuclei can scan each vhost separately via https://vhost:port.
    # Only enabled when the network opted in AND we have open web ports
    # — no point paying the round-trip for a zero-target scan.
    known_hostnames: dict[str, list[str]] = {}
    if job.nuclei_sni_enabled:
        unique_ips = sorted({p.ip for p in open_ports})
        try:
            known_hostnames = client.get_hostnames_for_ips(unique_ips)
        except Exception as exc:  # pragma: no cover — non-fatal
            logger.warning(
                "nuclei: hostname lookup failed (%s), falling back to IP-only targets",
                exc,
            )
            known_hostnames = {}
        if known_hostnames:
            total_vhosts = sum(len(v) for v in known_hostnames.values())
            logger.info(
                "nuclei: SNI fan-out enabled, cached hostnames for %d/%d IPs (%d total vhosts)",
                len(known_hostnames),
                len(unique_ips),
                total_vhosts,
            )
        else:
            logger.info(
                "nuclei: SNI fan-out enabled but no cached hostnames for any of %d IPs; "
                "using IP-only targets",
                len(unique_ips),
            )

    try:
        targets = build_targets(
            open_ports,
            job.scanner_type,
            known_hostnames=known_hostnames or None,
        )
    except Exception as exc:
        logger.warning("nuclei: build_targets failed: %s", exc)
        return {"nuclei_result": None}

    if not targets:
        logger.info(
            "nuclei: no web-like targets among %d open ports (scanner_type=%s), skipping",
            len(open_ports),
            job.scanner_type,
        )
        return {"nuclei_result": None}

    progress_reporter.update(0, "Nuclei: starting")

    try:
        nuclei_result = run_nuclei(
            targets=targets,
            tags=phase.config.get("tags") or job.nuclei_tags,
            timeout_s=phase.config.get("timeout") or job.nuclei_timeout,
            logger=logger,
            on_progress=lambda pct, msg: progress_reporter.update(pct, msg),
            exclude_tags=job.nuclei_exclude_tags,
        )
    except Exception:
        logger.exception("nuclei: unexpected failure during run_nuclei")
        return {"nuclei_result": None}

    findings = nuclei_result.findings
    vuln_status = "timeout" if nuclei_result.timed_out else "success"

    try:
        client.submit_vulnerability_results(
            scan_id=scan_id,
            vulnerabilities=findings,
            status=vuln_status,
        )
        logger.info("nuclei: submitted %d finding(s) for scan %s (status=%s)", len(findings), scan_id, vuln_status)
    except Exception:
        logger.exception("nuclei: failed to submit results for scan %s", scan_id)

    if nuclei_result.timed_out:
        progress_reporter.update(100, "Nuclei: timed out")
    else:
        progress_reporter.update(100, f"Nuclei: {len(findings)} finding(s)")
    return {"nuclei_result": findings}


def _run_vulnerability_phase(
    phase: ScanPhase, job: ScannerJob, client: ScannerClient,
    scan_id: int, logger: logging.Logger,
    progress_reporter: ProgressReporter, completed: dict[str, Any],
) -> dict[str, Any]:
    """Run a vulnerability scan phase.

    Dispatches on `phase.tool`:
    - `"nmap_nse"`: existing NSE code path.
    - `"nuclei"`: runs nuclei against HTTP-ish open ports from the prior
      port_scan phase. Failures are caught internally so a broken nuclei
      run never fails the surrounding pipeline.
    """
    if phase.tool == "nuclei":
        return _run_nuclei_phase(
            phase, job, client, scan_id, logger, progress_reporter, completed
        )

    logger.info("=== Vulnerability Scan Phase (NSE) ===")

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
    "ssh_probe": _run_ssh_probe_phase,
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

        phase_start = time.monotonic()
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

        elapsed = time.monotonic() - phase_start
        logger.info("Phase '%s' completed in %.1fs", phase.name, elapsed)

        msg = _format_phase_progress(phase.name, 100, num, total)
        progress_reporter.update((num / total) * 100, msg)

    progress_reporter.update(100, "Scan complete")
    _submit_pipeline_results(
        client, scan_id, completed, logger, status="success",
    )


def _submit_pipeline_results(
    client: ScannerClient, scan_id: int, completed: dict[str, Any],
    logger: logging.Logger, status: str = "success", error: str | None = None,
) -> None:
    """Submit results from completed phases."""
    ps = completed.get("port_scan")
    open_ports = ps["open_ports"] if ps else []

    # SSH results come from the ssh_probe phase (if it ran).
    sp = completed.get("ssh_probe")
    ssh_results: list[SSHProbeResult] = sp["ssh_results"] if sp else []

    vuln = completed.get("vulnerability")

    if ps:
        try:
            client.submit_results(
                scan_id,
                status,
                open_ports,
                ssh_results=ssh_results,
                error_message=error,
            )
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

    claimed = client.claim_job(job.network_id)
    if claimed is None:
        log_buffer.reset()
        return

    scan_id = claimed.scan_id
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

        # Use phase pipeline when phases are available. Nuclei eligibility
        # is applied uniformly to both legacy and pre-built phases so that
        # networks with a stored `phases` column still honor
        # `nuclei_enabled`.
        base_phases = job.phases or _build_legacy_phases(job)
        phases = _ensure_nuclei_phase(
            _ensure_ssh_phase(base_phases, job), job
        )
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

    claimed = client.claim_job(job.network_id)
    if claimed is None:
        log_buffer.reset()
        return

    scan_id = claimed.scan_id
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
            gvm_port_list=job.gvm_port_list,
            required_library_entries=claimed.required_library_entries,
            keep_reports=job.gvm_keep_reports,
        )

        # Submit vulnerabilities FIRST (before port results, which transitions
        # scan to COMPLETED — vulnerability endpoint requires RUNNING status)
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

        # Submit open ports (transitions scan to COMPLETED)
        try:
            client.submit_results(scan_id, "success", open_ports)
            logger.info("Submitted %d open ports for scan %s", len(open_ports), scan_id)
        except Exception:
            logger.exception("Failed to submit port results for scan %s", scan_id)

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
    """Check if required external tools are available.

    masscan/nmap are required for the standard scanner image; missing them
    yields a warning so scans using those tools will fail.

    nuclei is optional — networks that don't enable the nuclei post-phase
    don't need it. A missing nuclei binary logs a single info-level line
    so operators can tell whether an old image is in play.
    """
    for tool in ["masscan", "nmap"]:
        if not shutil.which(tool):
            logger.warning(
                "Required tool '%s' not found in PATH. "
                "Scans using this tool will fail.",
                tool,
            )
    if not shutil.which("nuclei"):
        logger.info(
            "Optional tool 'nuclei' not found in PATH. "
            "Networks with nuclei_enabled=true will skip the nuclei post-phase."
        )
