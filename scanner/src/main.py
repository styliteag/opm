"""STYLiTE Orbit Monitor Scanner Agent - Main entry point."""

from __future__ import annotations

import logging
import os
import shutil
import socket
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

# How long to wait on startup for gvmd to begin accepting connections
# on its Unix socket before giving up and entering the main loop anyway.
# The shared `gvmd_socket_vol` means the socket file appears immediately
# when the gvmd container mounts it, but gvmd itself may not be listening
# yet — especially on cold boot when feed sync is running. Feed sync can
# take hours, so we don't block the main loop forever; instead, we give
# up after GVM_READY_MAX_ATTEMPTS * (avg backoff) seconds and let the
# background pulse retry the push at its normal cadence.
GVM_READY_MAX_ATTEMPTS = 60
GVM_READY_BACKOFF_INITIAL = 2.0
GVM_READY_BACKOFF_MAX = 10.0
GVM_READY_CONNECT_TIMEOUT = 2.0


def _wait_for_gvmd(logger: logging.Logger) -> bool:
    """Poll the gvmd Unix socket until it accepts connections.

    On cold boot the shared socket volume makes the socket file visible
    immediately, but gvmd may take a while before it actually ``listen()``s
    on it — during this window a connect attempt yields ``ECONNREFUSED``.
    A raw ``socket.connect`` probe is cheap and avoids spamming the log
    with full GMP-handshake tracebacks for something we know is a boot race.

    Returns True when gvmd is ready. Returns False after
    ``GVM_READY_MAX_ATTEMPTS`` — we deliberately do not block forever so
    that a long-running feed sync (which can take hours on first boot) does
    not starve the main poll loop of OPM job processing.
    """
    gvm_socket = os.environ.get("GVM_SOCKET", "/run/gvmd/gvmd.sock")
    delay = GVM_READY_BACKOFF_INITIAL
    announced = False
    for attempt in range(1, GVM_READY_MAX_ATTEMPTS + 1):
        try:
            with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as probe:
                probe.settimeout(GVM_READY_CONNECT_TIMEOUT)
                probe.connect(gvm_socket)
            logger.info(
                "gvmd is accepting connections on %s (attempt %d)",
                gvm_socket,
                attempt,
            )
            return True
        except (FileNotFoundError, ConnectionRefusedError, OSError) as exc:
            if not announced:
                logger.info(
                    "Waiting for gvmd on %s (feed sync may be in progress)...",
                    gvm_socket,
                )
                announced = True
            elif attempt % 10 == 0:
                logger.info(
                    "Still waiting for gvmd (attempt %d/%d): %s",
                    attempt,
                    GVM_READY_MAX_ATTEMPTS,
                    exc,
                )
            time.sleep(delay)
            delay = min(delay * 1.2, GVM_READY_BACKOFF_MAX)

    logger.warning(
        "gvmd not ready after %d attempts — continuing without a cold-boot "
        "metadata push; the background pulse will keep retrying",
        GVM_READY_MAX_ATTEMPTS,
    )
    return False


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
    is_gvm = _is_gvm_scanner()
    kind = "gvm" if is_gvm else "standard"
    logger.info(
        "STYLiTE Orbit Monitor Scanner v%s (%s) starting...",
        version,
        kind,
    )
    logger.info("Polling interval set to %s seconds", config.poll_interval)

    client = ScannerClient(
        config.backend_url,
        config.api_key,
        logger,
        scanner_version=version,
        scanner_kind=kind,
    )

    # Wait for backend to be ready before starting
    logger.info("Waiting for backend to be ready...")
    client.wait_for_backend()

    last_gvm_metadata_push = 0.0
    if is_gvm:
        logger.info("Running as GVM scanner — will push metadata snapshots to backend")
        # Probe gvmd before attempting the first GMP handshake. On cold boot
        # the socket file is visible via the shared volume long before gvmd
        # is actually listening, so without this wait the cold-boot push
        # would always race-fail with ECONNREFUSED + a noisy traceback.
        if _wait_for_gvmd(logger):
            if _push_gvm_metadata(client, logger):
                last_gvm_metadata_push = time.monotonic()
            else:
                # Probe succeeded but the GMP handshake/push failed (auth,
                # transient hiccup, etc.). Anchor the pulse window to "now"
                # so the background pulse waits the full GVM_METADATA_PULSE_INTERVAL
                # before retrying instead of firing on the very next loop tick.
                last_gvm_metadata_push = time.monotonic()
        else:
            # Probe gave up. Same anchoring rule — don't double-fire on the
            # first loop iteration. The background pulse will retry once
            # GVM_METADATA_PULSE_INTERVAL has elapsed, by which point gvmd
            # has had several more minutes to finish booting.
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
                # Anchor the timer regardless of success — a failed push
                # should not cause the pulse to retry on every poll cycle
                # (which would otherwise spam the log every 60 s during a
                # gvmd outage). The next attempt happens after the full
                # pulse interval has elapsed.
                _push_gvm_metadata(client, logger)
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
