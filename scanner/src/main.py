"""Open Port Monitor Scanner Agent - Main entry point."""

from __future__ import annotations

import time

from src.client import ScannerClient
from src.orchestration import check_dependencies, process_host_discovery_job, process_job
from src.threading_utils import LogBufferHandler
from src.utils import configure_logging, get_version, load_config


def main() -> None:
    """Main entry point for the scanner agent."""
    config = load_config()
    log_buffer = LogBufferHandler()
    logger = configure_logging(config.log_level, log_buffer)

    check_dependencies(logger)

    version = get_version()
    logger.info("Open Port Monitor Scanner v%s starting...", version)
    logger.info("Polling interval set to %s seconds", config.poll_interval)

    client = ScannerClient(config.backend_url, config.api_key, logger, scanner_version=version)

    # Wait for backend to be ready before starting
    logger.info("Waiting for backend to be ready...")
    client.wait_for_backend()

    try:
        while True:
            has_work = False

            # Check for port scan jobs
            try:
                jobs = client.get_jobs()
                if jobs:
                    has_work = True
                    logger.info("Found %s pending port scan job(s)", len(jobs))
                    for job in jobs:
                        process_job(job, client, logger, log_buffer)
            except Exception:
                logger.exception("Failed to fetch port scan jobs")

            # Check for host discovery jobs
            try:
                host_discovery_jobs = client.get_host_discovery_jobs()
                if host_discovery_jobs:
                    has_work = True
                    logger.info("Found %s pending host discovery job(s)", len(host_discovery_jobs))
                    for hd_job in host_discovery_jobs:
                        process_host_discovery_job(hd_job, client, logger)
            except Exception:
                logger.exception("Failed to fetch host discovery jobs")

            if not has_work:
                logger.debug("No pending jobs; sleeping")

            time.sleep(config.poll_interval)
    except KeyboardInterrupt:
        logger.info("Scanner agent shutting down...")
    finally:
        client.close()


if __name__ == "__main__":
    main()
