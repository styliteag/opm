"""Greenbone (GVM) scanner bridge via python-gvm GMP protocol."""

from __future__ import annotations

import logging
import os
import re
import time
from typing import Any
from xml.etree import ElementTree

from src.client import ScannerClient
from src.models import OpenPortResult, VulnerabilityResult
from src.threading_utils import ProgressReporter

# GVM poll interval in seconds
GVM_POLL_INTERVAL = 10

# Fallback UUIDs — used only if dynamic lookup fails
_FALLBACK_CONFIG_IDS: dict[str, str] = {
    "Full and fast": "daba56c8-73ec-11df-a475-002264764cea",
    "Full and deep": "708f25c4-7489-11df-8094-002264764cea",
    "Discovery": "8715c877-47a0-438d-98a3-27c7a6ab2196",
    "System Discovery": "bbca7412-a950-11e3-9109-406186ea4fc5",
}

SEVERITY_LABELS = {
    (9.0, 10.0): "critical",
    (7.0, 8.9): "high",
    (4.0, 6.9): "medium",
    (0.1, 3.9): "low",
    (0.0, 0.0): "info",
}


def _cvss_to_label(score: float) -> str:
    """Convert CVSS score to severity label."""
    for (low, high), label in SEVERITY_LABELS.items():
        if low <= score <= high:
            return label
    return "info"


def _extract_cves(text: str) -> list[str]:
    """Extract CVE IDs from text."""
    return re.findall(r"CVE-\d{4}-\d{4,}", text)


class GreenboneScanner:
    """Bridge to GVM/OpenVAS via python-gvm GMP protocol."""

    name = "greenbone"
    label = "Greenbone (GVM)"

    def __init__(self) -> None:
        self._gvm_socket = os.environ.get("GVM_SOCKET", "/run/gvmd/gvmd.sock")
        self._gvm_user = os.environ.get("GVM_USER", "admin")
        self._gvm_pass = os.environ.get("GVM_PASSWORD", "admin")

    def run_scan(
        self,
        client: ScannerClient,
        scan_id: int,
        target_cidr: str,
        port_spec: str,
        gvm_scan_config: str,
        logger: logging.Logger,
        progress_reporter: ProgressReporter,
    ) -> tuple[list[OpenPortResult], list[VulnerabilityResult]]:
        """Run a full GVM scan: create target, start task, poll, fetch results.

        Returns:
            Tuple of (open_ports, vulnerabilities)
        """
        from gvm.connections import UnixSocketConnection
        from gvm.protocols.gmp import Gmp

        connection = UnixSocketConnection(path=self._gvm_socket)
        target_id: str | None = None
        task_id: str | None = None

        with Gmp(connection=connection) as gmp:
            gmp.authenticate(self._gvm_user, self._gvm_pass)
            logger.info("Authenticated with GVM via %s", self._gvm_socket)

            config_id = self._resolve_config_id(gmp, gvm_scan_config, logger)

            try:
                # Create target
                target_name = f"OPM-scan-{scan_id}-{int(time.time())}"
                target_resp = gmp.create_target(
                    name=target_name,
                    hosts=[target_cidr],
                    port_range=port_spec,
                )
                target_id = self._extract_id(target_resp)
                logger.info("Created GVM target %s (%s)", target_name, target_id)

                # Find the OpenVAS default scanner
                openvas_scanner_id = self._find_openvas_scanner(gmp, logger)

                # Create task
                task_name = f"OPM-task-{scan_id}-{int(time.time())}"
                task_resp = gmp.create_task(
                    name=task_name,
                    config_id=config_id,
                    target_id=target_id,
                    scanner_id=openvas_scanner_id,
                )
                task_id = self._extract_id(task_resp)
                logger.info("Created GVM task %s (%s)", task_name, task_id)

                # Start task
                gmp.start_task(task_id)
                logger.info("Started GVM task %s", task_id)
                progress_reporter.update(0, "GVM scan started")

                # Poll loop
                self._poll_until_done(
                    gmp, task_id, client, scan_id, logger, progress_reporter
                )

                # Fetch results
                open_ports, vulnerabilities = self._fetch_results(
                    gmp, task_id, logger
                )

                logger.info(
                    "GVM scan complete: %d open ports, %d vulnerabilities",
                    len(open_ports),
                    len(vulnerabilities),
                )
                return open_ports, vulnerabilities

            finally:
                # Cleanup GVM objects
                self._cleanup(gmp, task_id, target_id, logger)

    def _resolve_config_id(
        self, gmp: Any, config_name: str, logger: logging.Logger
    ) -> str:
        """Resolve config name to GVM config UUID via dynamic lookup."""
        try:
            configs_resp = gmp.get_scan_configs()
            tree = ElementTree.fromstring(str(configs_resp))
            for cfg in tree.findall(".//config"):
                name_elem = cfg.find("name")
                cfg_id = cfg.get("id", "")
                if name_elem is not None and name_elem.text == config_name:
                    logger.info("Resolved GVM config '%s' -> %s", config_name, cfg_id)
                    return cfg_id
            logger.warning("GVM config '%s' not found in dynamic lookup", config_name)
        except Exception:
            logger.warning("Dynamic config lookup failed", exc_info=True)

        # Fall back to hardcoded UUIDs
        fallback = _FALLBACK_CONFIG_IDS.get(config_name)
        if fallback:
            logger.info("Using fallback UUID for '%s': %s", config_name, fallback)
            return fallback

        raise RuntimeError(
            f"GVM scan config '{config_name}' not found. "
            "Feeds may still be syncing — retry after feed sync completes."
        )

    def _find_openvas_scanner(self, gmp: Any, logger: logging.Logger) -> str:
        """Find the OpenVAS scanner UUID in GVM."""
        scanners_resp = gmp.get_scanners()
        tree = ElementTree.fromstring(str(scanners_resp))
        for scanner_elem in tree.findall(".//scanner"):
            name_elem = scanner_elem.find("name")
            scanner_id = scanner_elem.get("id", "")
            if name_elem is not None and "OpenVAS" in (name_elem.text or ""):
                logger.info("Found OpenVAS scanner: %s", scanner_id)
                return scanner_id
        raise RuntimeError("OpenVAS scanner not found in GVM")

    def _extract_id(self, response: Any) -> str:
        """Extract the @id attribute from a GMP create response."""
        tree = ElementTree.fromstring(str(response))
        entity_id = tree.get("id")
        if not entity_id:
            raise RuntimeError(f"Failed to extract ID from GMP response: {response}")
        return entity_id

    def _poll_until_done(
        self,
        gmp: Any,
        task_id: str,
        client: ScannerClient,
        scan_id: int,
        logger: logging.Logger,
        progress_reporter: ProgressReporter,
    ) -> None:
        """Poll GVM task status until complete, reporting progress."""
        while True:
            time.sleep(GVM_POLL_INTERVAL)

            # Check OPM cancellation
            opm_status = client.get_scan_status(scan_id)
            if opm_status == "cancelled":
                logger.info("Scan cancelled by user, stopping GVM task")
                gmp.stop_task(task_id)
                raise RuntimeError("Cancelled by user")

            # Check GVM task status
            task_resp = gmp.get_task(task_id)
            tree = ElementTree.fromstring(str(task_resp))

            status_elem = tree.find(".//task/status")
            progress_elem = tree.find(".//task/progress")

            task_status = status_elem.text if status_elem is not None else "Unknown"
            progress = int(progress_elem.text or "0") if progress_elem is not None else 0

            progress_reporter.update(
                min(progress, 99), f"GVM scan: {task_status} ({progress}%)"
            )

            if task_status == "Done":
                break

            if task_status in (
                "Stopped", "Interrupted",
                "Stop Requested", "Delete Requested",
            ):
                raise RuntimeError(f"GVM task ended with status: {task_status}")

            logger.info("GVM task %s: %s (%d%%)", task_id, task_status, progress)

    def _fetch_results(
        self,
        gmp: Any,
        task_id: str,
        logger: logging.Logger,
    ) -> tuple[list[OpenPortResult], list[VulnerabilityResult]]:
        """Fetch and parse results from a completed GVM task."""
        results_resp = gmp.get_results(task_id=task_id, details=True)
        tree = ElementTree.fromstring(str(results_resp))

        open_ports: list[OpenPortResult] = []
        vulnerabilities: list[VulnerabilityResult] = []
        seen_ports: set[tuple[str, int, str]] = set()

        for result_elem in tree.findall(".//result"):
            host_elem = result_elem.find("host")
            port_elem = result_elem.find("port")
            nvt_elem = result_elem.find("nvt")

            if host_elem is None or nvt_elem is None:
                continue

            ip = host_elem.text or ""
            oid = nvt_elem.get("oid", "")
            name = self._get_text(nvt_elem, "name")
            description = self._get_text(result_elem, "description")

            # Parse severity
            severity_text = self._get_text(result_elem, "severity")
            severity = max(0.0, float(severity_text)) if severity_text else 0.0
            severity_label = _cvss_to_label(severity)

            # Parse port
            port_text = port_elem.text if port_elem is not None else ""
            port, protocol = self._parse_port(port_text)

            # Extract CVEs from NVT refs and description
            cve_ids = self._extract_cve_refs(nvt_elem, description)

            # Build vulnerability
            vuln = VulnerabilityResult(
                ip=ip,
                port=port,
                protocol=protocol,
                oid=oid,
                name=name,
                description=description,
                severity=severity,
                severity_label=severity_label,
                cvss_base_vector=self._get_text(nvt_elem, "cvss_base_vector"),
                cve_ids=cve_ids,
                solution=self._get_text(nvt_elem, "solution"),
                solution_type=self._get_attr(nvt_elem, "solution", "type"),
                qod=self._parse_qod(result_elem),
            )
            vulnerabilities.append(vuln)

            # Track unique open ports
            if port is not None:
                port_key = (ip, port, protocol)
                if port_key not in seen_ports:
                    seen_ports.add(port_key)
                    open_ports.append(
                        OpenPortResult(
                            ip=ip,
                            port=port,
                            protocol=protocol,
                            ttl=None,
                            banner=None,
                            service_guess=None,
                            mac_address=None,
                            mac_vendor=None,
                        )
                    )

        logger.info(
            "Parsed %d vulnerabilities and %d unique open ports from GVM results",
            len(vulnerabilities),
            len(open_ports),
        )
        return open_ports, vulnerabilities

    def _parse_port(self, port_text: str) -> tuple[int | None, str]:
        """Parse GVM port string like '443/tcp' into (port, protocol)."""
        if not port_text or port_text == "general/tcp":
            return None, "tcp"
        match = re.match(r"(\d+)/(\w+)", port_text)
        if match:
            return int(match.group(1)), match.group(2)
        return None, "tcp"

    def _extract_cve_refs(self, nvt_elem: ElementTree.Element, description: str) -> list[str]:
        """Extract CVE IDs from NVT refs element and description text."""
        cves: set[str] = set()
        refs_elem = nvt_elem.find("refs")
        if refs_elem is not None:
            for ref in refs_elem.findall("ref"):
                if ref.get("type") == "cve":
                    cve_id = ref.get("id", "")
                    if cve_id:
                        cves.add(cve_id)
        cves.update(_extract_cves(description))
        return sorted(cves)

    def _parse_qod(self, result_elem: ElementTree.Element) -> int | None:
        """Parse Quality of Detection value."""
        qod_elem = result_elem.find("qod/value")
        if qod_elem is not None and qod_elem.text:
            try:
                return int(qod_elem.text)
            except ValueError:
                pass
        return None

    def _get_text(self, elem: ElementTree.Element, tag: str) -> str:
        """Get text content of a child element, defaulting to empty string."""
        child = elem.find(tag)
        return (child.text or "") if child is not None else ""

    def _get_attr(self, elem: ElementTree.Element, tag: str, attr: str) -> str | None:
        """Get attribute of a child element."""
        child = elem.find(tag)
        return child.get(attr) if child is not None else None

    def _cleanup(
        self,
        gmp: Any,
        task_id: str | None,
        target_id: str | None,
        logger: logging.Logger,
    ) -> None:
        """Clean up GVM task and target objects."""
        if task_id:
            try:
                gmp.delete_task(task_id, ultimate=True)
                logger.debug("Deleted GVM task %s", task_id)
            except Exception:
                logger.warning("Failed to delete GVM task %s", task_id, exc_info=True)
        if target_id:
            try:
                gmp.delete_target(target_id, ultimate=True)
                logger.debug("Deleted GVM target %s", target_id)
            except Exception:
                logger.warning("Failed to delete GVM target %s", target_id, exc_info=True)
