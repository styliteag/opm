"""Job processing and orchestration logic."""

from __future__ import annotations

import logging
import shutil

from src.client import ScannerClient
from src.discovery import (
    DEFAULT_SSH_PROBE_CONCURRENCY,
    DEFAULT_SSH_PROBE_TIMEOUT,
    detect_ssh_services,
    run_host_discovery,
    run_ssh_probes,
)
from src.models import HostDiscoveryJob, ScannerJob, ScanRunResult
from src.scanners.masscan import run_masscan
from src.scanners.nmap import run_nmap, run_nmap_service_detection
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
        "Claiming host discovery job for network %s (scan_id=%s)", job.network_id, job.scan_id
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
            ips_with_open_ports=claimed_job.ips_with_open_ports,
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
            logger.info("Submitted failed host discovery results for scan %s", claimed_job.scan_id)
        except Exception:
            logger.exception(
                "Failed to submit failure results for host discovery scan %s", claimed_job.scan_id
            )


def process_job(
    job: ScannerJob,
    client: ScannerClient,
    logger: logging.Logger,
    log_buffer: LogBufferHandler,
) -> None:
    """Process a port scan job.

    Args:
        job: Port scan job to process
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
    logger.info("Scanner type: %s", job.scanner_type)
    logger.info("Scan protocol: %s", job.scan_protocol)
    if job.target_ip:
        logger.info("Single-host scan mode: targeting %s", job.target_ip)

    # Start log streamer
    log_streamer = LogStreamer(client=client, log_buffer=log_buffer, scan_id=scan_id)
    log_streamer.start()

    # Start progress reporter
    progress_reporter = ProgressReporter(client=client, scan_id=scan_id)
    progress_reporter.start()

    try:
        # Report 0% at start
        progress_reporter.update(0, "Starting scan...")

        if job.is_ipv6:
            progress_reporter.update(0, "Checking IPv6 connectivity...")
            if not check_ipv6_connectivity(logger):
                raise RuntimeError("IPv6 connectivity not available")

        # For single-host scans, always use nmap for better results
        if job.target_ip:
            logger.info("Using nmap for single-host scan of %s", job.target_ip)
            result = run_nmap(
                client,
                scan_id,
                job.target_ip,  # Use target_ip instead of cidr
                job.port_spec,
                job.scan_timeout,
                job.port_timeout,
                job.scan_protocol,
                job.is_ipv6,
                logger,
                progress_reporter,
            )
            logger.info("Nmap single-host scan completed with %s open ports", len(result.open_ports))
        # Dispatch to appropriate scanner based on scanner_type for full network scans
        elif job.scanner_type == "nmap":
            result = run_nmap(
                client,
                scan_id,
                job.cidr,
                job.port_spec,
                job.scan_timeout,
                job.port_timeout,
                job.scan_protocol,
                job.is_ipv6,
                logger,
                progress_reporter,
            )
            logger.info("Nmap completed with %s open ports", len(result.open_ports))
        else:
            # Default to masscan for backward compatibility
            result = run_masscan(
                client,
                scan_id,
                job.cidr,
                job.port_spec,
                job.rate,
                job.scan_timeout,
                job.port_timeout,
                job.scan_protocol,
                logger,
                progress_reporter,
            )
            logger.info("Masscan completed with %s open ports", len(result.open_ports))

            # Run nmap service detection on discovered ports (hybrid approach)
            if result.open_ports and not result.cancelled:
                logger.info("Starting service detection phase...")
                updated_ports = run_nmap_service_detection(
                    client,
                    scan_id,
                    result.open_ports,
                    job.scan_timeout,
                    logger,
                    progress_reporter,
                )
                result = ScanRunResult(open_ports=updated_ports, cancelled=result.cancelled)
                services_found = sum(1 for p in updated_ports if p.service_guess)
                logger.info(
                    "Service detection complete: %d/%d ports identified",
                    services_found,
                    len(updated_ports),
                )

        # SSH probing phase - runs after port scanning
        ssh_results: list[SSHProbeResult] = []
        if result.open_ports and not result.cancelled:
            # Detect SSH services from discovered ports
            ssh_targets = detect_ssh_services(result.open_ports)

            if ssh_targets:
                logger.info("=== SSH Security Probing Phase ===")
                progress_reporter.update(
                    90, f"Starting SSH probes on {len(ssh_targets)} targets..."
                )

                # Run SSH probes - maps 90-100% progress
                ssh_results = run_ssh_probes(
                    ssh_targets,
                    logger,
                    progress_reporter,
                    concurrency=DEFAULT_SSH_PROBE_CONCURRENCY,
                    timeout=DEFAULT_SSH_PROBE_TIMEOUT,
                    progress_offset=90.0,
                    progress_scale=10.0,
                )

                # Log summary
                successful_probes = [r for r in ssh_results if r.success]
                insecure_auth = sum(1 for r in successful_probes if r.has_insecure_auth())
                weak_ciphers = sum(1 for r in successful_probes if r.has_weak_ciphers())

                logger.info(
                    "SSH probing complete: %d/%d successful, %d with insecure auth, %d with weak ciphers",
                    len(successful_probes),
                    len(ssh_targets),
                    insecure_auth,
                    weak_ciphers,
                )

        if result.cancelled:
            try:
                client.submit_results(
                    scan_id,
                    "failed",
                    result.open_ports,
                    ssh_results=ssh_results,
                    error_message="Scan cancelled by user request",
                )
                logger.info("Submitted cancelled scan results for scan %s", scan_id)
            except Exception:
                logger.exception("Failed to submit cancelled scan results for scan %s", scan_id)
            return

        # Report 100% at completion
        progress_reporter.update(100, "Scan complete")

        client.submit_results(scan_id, "success", result.open_ports, ssh_results=ssh_results)
        logger.info("Submitted scan results for scan %s", scan_id)
    except Exception as exc:
        logger.exception("Scan failed for network %s", job.network_id)
        try:
            client.submit_results(scan_id, "failed", [], error_message=str(exc))
            logger.info("Submitted failed scan results for scan %s", scan_id)
        except Exception:
            logger.exception("Failed to submit failure results for scan %s", scan_id)
    finally:
        # Stop progress reporter first to ensure final progress is reported
        progress_reporter.stop()
        progress_reporter.join()
        # Then stop log streamer
        log_streamer.stop()
        log_streamer.join()


def check_dependencies(logger: logging.Logger) -> None:
    """Check if required external tools are available.

    Args:
        logger: Logger instance
    """
    for tool in ["masscan", "nmap"]:
        if not shutil.which(tool):
            logger.warning(
                "Required tool '%s' not found in PATH. Scans using this tool will fail.", tool
            )
