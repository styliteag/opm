"""STYLiTE Orbit Monitor Scanner Agent - Main entry point."""

from __future__ import annotations

import logging
import os
import shutil
import time

from src.client import ScannerClient
from src.orchestration import (
    check_dependencies,
    process_greenbone_job,
    process_host_discovery_job,
    process_job,
)
from src.threading_utils import LogBufferHandler
from src.utils import configure_logging, get_version, load_config

# Push a fresh GVM metadata snapshot at most once every N seconds
# (background pulse). An explicit refresh flag in the /jobs response
# bypasses this throttle and forces an immediate push.
GVM_METADATA_PULSE_INTERVAL = 300  # 5 minutes


def _is_gvm_scanner() -> bool:
    """Return True when this container is the GVM-specialised image.

    The GVM image ships without masscan, so the absence of masscan is a
    reliable signal that we should be running the GVM metadata loop.
    """
    return shutil.which("masscan") is None and bool(
        os.environ.get("GVM_SOCKET") or os.path.exists("/run/gvmd/gvmd.sock")
    )


def _push_gvm_metadata(client: ScannerClient, logger: logging.Logger) -> bool:
    """Connect to GVM, snapshot its state, and POST it to the backend.

    Returns True on successful push, False otherwise. Callers should use
    the return value to decide whether to reset the "last pushed" timer
    — on cold boot, gvmd may still be warming up, so retrying on the
    next short poll cycle is preferable to waiting a full 5 min pulse.
    """
    try:
        from gvm.connections import UnixSocketConnection
        from gvm.protocols.gmp import Gmp

        from src.scanners.greenbone_metadata import fetch_snapshot

        gvm_socket = os.environ.get("GVM_SOCKET", "/run/gvmd/gvmd.sock")
        gvm_user = os.environ.get("GVM_USER", "admin")
        gvm_pass = os.environ.get("GVM_PASSWORD", "admin")

        with Gmp(connection=UnixSocketConnection(path=gvm_socket)) as gmp:
            gmp.authenticate(gvm_user, gvm_pass)
            entries = fetch_snapshot(gmp, logger)
        client.post_gvm_metadata(entries)
        return True
    except Exception as exc:
        # Downgrade to a single-line warning during cold boot — gvmd may
        # still be initialising or the feed sync may be running. Keep the
        # stack trace at DEBUG level for diagnostics.
        logger.warning("Could not push GVM metadata snapshot: %s", exc)
        logger.debug("GVM metadata push traceback", exc_info=True)
        return False


def main() -> None:
    """Main entry point for the scanner agent."""
    config = load_config()
    log_buffer = LogBufferHandler()
    logger = configure_logging(config.log_level, log_buffer)

    check_dependencies(logger)

    version = get_version()
    logger.info("STYLiTE Orbit Monitor Scanner v%s starting...", version)
    logger.info("Polling interval set to %s seconds", config.poll_interval)

    client = ScannerClient(config.backend_url, config.api_key, logger, scanner_version=version)

    # Wait for backend to be ready before starting
    logger.info("Waiting for backend to be ready...")
    client.wait_for_backend()

    is_gvm = _is_gvm_scanner()
    last_gvm_metadata_push = 0.0
    if is_gvm:
        logger.info("Running as GVM scanner — will push metadata snapshots to backend")
        # Best-effort cold-boot push; on failure, the main loop will retry
        # on the next poll interval rather than waiting a full pulse window.
        if _push_gvm_metadata(client, logger):
            last_gvm_metadata_push = time.monotonic()

    try:
        while True:
            has_work = False

            # Check for port scan jobs
            try:
                result = client.get_jobs()
                if result.jobs:
                    has_work = True
                    logger.info("Found %s pending port scan job(s)", len(result.jobs))
                    for job in result.jobs:
                        if job.scanner_type == "greenbone":
                            process_greenbone_job(job, client, logger, log_buffer)
                        else:
                            process_job(job, client, logger, log_buffer)

                # Handle on-demand metadata refresh trigger
                if is_gvm and result.gvm_refresh:
                    logger.info("Admin requested GVM metadata refresh")
                    if _push_gvm_metadata(client, logger):
                        last_gvm_metadata_push = time.monotonic()
            except Exception:
                logger.exception("Failed to fetch port scan jobs")

            # Check for host discovery jobs (skip if nmap not available, e.g. GVM-only container)
            if shutil.which("nmap"):
                try:
                    host_discovery_jobs = client.get_host_discovery_jobs()
                    if host_discovery_jobs:
                        has_work = True
                        logger.info(
                            "Found %s pending host discovery job(s)",
                            len(host_discovery_jobs),
                        )
                        for hd_job in host_discovery_jobs:
                            process_host_discovery_job(hd_job, client, logger)
                except Exception:
                    logger.exception("Failed to fetch host discovery jobs")

            # Background GVM metadata pulse
            if is_gvm and (
                time.monotonic() - last_gvm_metadata_push >= GVM_METADATA_PULSE_INTERVAL
            ):
                if _push_gvm_metadata(client, logger):
                    last_gvm_metadata_push = time.monotonic()

            if not has_work:
                logger.debug("No pending jobs; sleeping")

            time.sleep(config.poll_interval)
    except KeyboardInterrupt:
        logger.info("Scanner agent shutting down...")
    finally:
        client.close()


if __name__ == "__main__":
    main()
