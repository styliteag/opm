"""Open Port Monitor Scanner Agent - Main entry point."""

from __future__ import annotations

import json
import logging
import math
import os
import pty
import re
import select
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import traceback
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from threading import Event, Lock, Thread
from typing import Any

import httpx

DEFAULT_POLL_INTERVAL = 60
REQUEST_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 5
BACKOFF_BASE_SECONDS = 1.0
BACKOFF_MAX_SECONDS = 30.0
LOG_STREAM_INTERVAL_SECONDS = 5
PROGRESS_REPORT_INTERVAL_SECONDS = 5
CANCEL_POLL_INTERVAL_SECONDS = 5
IPV6_CONNECTIVITY_TARGETS = (
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
)
IPV6_CONNECTIVITY_TIMEOUT_SECONDS = 3.0


@dataclass(frozen=True)
class ScannerConfig:
    """Configuration for the scanner agent."""

    backend_url: str
    api_key: str
    poll_interval: int
    log_level: str


@dataclass(frozen=True)
class ScannerJob:
    """A pending scan job from the backend."""

    network_id: int
    cidr: str
    port_spec: str
    rate: int | None
    scanner_type: str  # masscan or nmap
    scan_timeout: int  # seconds
    port_timeout: int  # milliseconds
    scan_protocol: str  # tcp, udp, or both
    is_ipv6: bool = False  # whether the network CIDR is IPv6


@dataclass(frozen=True)
class OpenPortResult:
    """Normalized open port data from masscan output."""

    ip: str
    port: int
    protocol: str
    ttl: int | None
    banner: str | None
    service_guess: str | None
    mac_address: str | None
    mac_vendor: str | None

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "ip": self.ip,
            "port": self.port,
            "protocol": self.protocol,
            "ttl": self.ttl,
            "banner": self.banner,
            "service_guess": self.service_guess,
            "mac_address": self.mac_address,
            "mac_vendor": self.mac_vendor,
        }


@dataclass(frozen=True)
class LogEntry:
    """Scanner log entry for backend submission."""

    timestamp: datetime
    level: str
    message: str

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "level": self.level,
            "message": self.message,
        }


@dataclass(frozen=True)
class ScanRunResult:
    """Result from running a scan, including cancellation state."""

    open_ports: list[OpenPortResult]
    cancelled: bool


@dataclass(frozen=True)
class HostDiscoveryJob:
    """A pending host discovery job from the backend."""

    scan_id: int
    network_id: int
    cidr: str
    is_ipv6: bool = False


@dataclass(frozen=True)
class HostResult:
    """Discovered host data from nmap ping scan."""

    ip: str
    hostname: str | None
    is_pingable: bool
    mac_address: str | None
    mac_vendor: str | None

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "ip": self.ip,
            "hostname": self.hostname,
            "is_pingable": self.is_pingable,
            "mac_address": self.mac_address,
            "mac_vendor": self.mac_vendor,
        }


def _format_command(command: list[str]) -> str:
    """Return a shell-safe representation of the command for logging."""
    return shlex.join(command)


class LogBufferHandler(logging.Handler):
    """Collects log entries for periodic streaming."""

    def __init__(self) -> None:
        super().__init__()
        self._lock = Lock()
        self._entries: list[LogEntry] = []

    def emit(self, record: logging.LogRecord) -> None:
        try:
            message = record.getMessage()
        except Exception:
            message = "<failed to format log message>"
        if record.exc_info:
            exception_text = "".join(traceback.format_exception(*record.exc_info)).strip()
            message = f"{message}\n{exception_text}"
        level = _normalize_log_level(record.levelname)
        entry = LogEntry(timestamp=datetime.now(timezone.utc), level=level, message=message)
        with self._lock:
            self._entries.append(entry)

    def drain(self) -> list[LogEntry]:
        with self._lock:
            entries = self._entries
            self._entries = []
        return entries

    def requeue(self, entries: list[LogEntry]) -> None:
        if not entries:
            return
        with self._lock:
            self._entries = entries + self._entries

    def reset(self) -> None:
        with self._lock:
            self._entries = []


class LogStreamer(Thread):
    """Background thread to stream logs to the backend during a scan."""

    def __init__(
        self,
        client: "ScannerClient",
        log_buffer: LogBufferHandler,
        scan_id: int,
        interval: int = LOG_STREAM_INTERVAL_SECONDS,
    ) -> None:
        super().__init__(daemon=True)
        self._client = client
        self._log_buffer = log_buffer
        self._scan_id = scan_id
        self._interval = interval
        self._stop_event = Event()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.is_set():
            self._flush()
            if self._stop_event.wait(self._interval):
                break
        self._flush()

    def _flush(self) -> None:
        entries = self._log_buffer.drain()
        if not entries:
            return
        try:
            self._client.submit_logs(self._scan_id, entries)
        except Exception:
            self._log_buffer.requeue(entries)


class ProgressReporter(Thread):
    """Background thread to report scan progress to the backend."""

    def __init__(
        self,
        client: "ScannerClient",
        scan_id: int,
        interval: int = PROGRESS_REPORT_INTERVAL_SECONDS,
    ) -> None:
        super().__init__(daemon=True)
        self._client = client
        self._scan_id = scan_id
        self._interval = interval
        self._stop_event = Event()
        self._lock = Lock()
        self._current_percent: float = 0.0
        self._current_message: str | None = None
        self._last_reported_percent: float = -1.0
        self._last_reported_message: str | None = None

    def stop(self) -> None:
        self._stop_event.set()

    def update(self, percent: float, message: str | None = None) -> None:
        """Update the current progress values (thread-safe)."""
        with self._lock:
            self._current_percent = max(0.0, min(100.0, float(percent)))
            self._current_message = message

    def run(self) -> None:
        while not self._stop_event.is_set():
            self._report()
            if self._stop_event.wait(self._interval):
                break
        # Final report on stop
        self._report()

    def _report(self) -> None:
        with self._lock:
            percent = self._current_percent
            message = self._current_message

        # Only report if progress changed or we haven't reported yet
        if percent == self._last_reported_percent and message == self._last_reported_message:
            return

        try:
            self._client.submit_progress(self._scan_id, percent, message)
            self._last_reported_percent = percent
            self._last_reported_message = message
        except Exception:
            # Silently ignore progress report failures to not disrupt scan
            pass


class ProcessTimeoutWatcher(Thread):
    """Watchdog thread to warn and terminate long-running scan processes."""

    def __init__(
        self,
        process: subprocess.Popen[str],
        timeout_seconds: int,
        logger: logging.Logger,
        label: str,
    ) -> None:
        super().__init__(daemon=True)
        self._process = process
        self._timeout_seconds = max(0, timeout_seconds)
        self._logger = logger
        self._label = label
        self._stop_event = Event()
        self._timed_out = Event()

    @property
    def timed_out(self) -> bool:
        return self._timed_out.is_set()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        if self._timeout_seconds <= 0:
            return

        warning_delay = self._timeout_seconds * 0.9
        if warning_delay > 0:
            if self._stop_event.wait(warning_delay):
                return
            if self._process.poll() is None:
                self._logger.warning(
                    "%s scan approaching timeout (90%% elapsed)",
                    self._label,
                )

        remaining = self._timeout_seconds - warning_delay
        if remaining > 0:
            if self._stop_event.wait(remaining):
                return

        if self._process.poll() is not None:
            return

        self._logger.error(
            "%s scan exceeded timeout (%s seconds); terminating",
            self._label,
            self._timeout_seconds,
        )
        self._timed_out.set()
        self._process.terminate()
        try:
            self._process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self._logger.error("%s scan did not terminate gracefully; killing", self._label)
            self._process.kill()


class ScanCancellationWatcher(Thread):
    """Watch for scan cancellation and terminate the scan process."""

    def __init__(
        self,
        client: "ScannerClient",
        scan_id: int,
        process: subprocess.Popen[str],
        logger: logging.Logger,
        interval: int = CANCEL_POLL_INTERVAL_SECONDS,
    ) -> None:
        super().__init__(daemon=True)
        self._client = client
        self._scan_id = scan_id
        self._process = process
        self._logger = logger
        self._interval = interval
        self._stop_event = Event()
        self._cancelled = Event()

    @property
    def cancelled(self) -> bool:
        return self._cancelled.is_set()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        while not self._stop_event.is_set():
            status: str | None = None
            try:
                status = self._client.get_scan_status(self._scan_id)
            except Exception as exc:
                self._logger.warning(
                    "Failed to check scan status for %s: %s", self._scan_id, exc
                )

            if status == "cancelled":
                self._logger.warning("Scan cancelled by user request")
                self._cancelled.set()
                if self._process.poll() is None:
                    self._process.terminate()
                    try:
                        self._process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        self._logger.error(
                            "Scan did not terminate gracefully after cancellation; killing"
                        )
                        self._process.kill()
                break

            if self._stop_event.wait(self._interval):
                break


class ScannerClient:
    """HTTP client wrapper with authentication and retry handling."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        logger: logging.Logger,
        scanner_version: str = "unknown",
        timeout: float = REQUEST_TIMEOUT_SECONDS,
        max_retries: int = MAX_RETRIES,
        backoff_base: float = BACKOFF_BASE_SECONDS,
        backoff_max: float = BACKOFF_MAX_SECONDS,
    ) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout)
        self._api_key = api_key
        self._logger = logger
        self._scanner_version = scanner_version
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._backoff_max = backoff_max
        self._http_lock = Lock()

    def close(self) -> None:
        self._client.close()

    def ensure_authenticated(self) -> None:
        if self._token is None or time.time() >= self._token_expires_at:
            self.authenticate()

    def authenticate(self) -> None:
        self._logger.info("Authenticating scanner with backend")
        response = self._request(
            "POST",
            "/api/scanner/auth",
            headers={"X-API-Key": self._api_key},
            json={"scanner_version": self._scanner_version},
            auth_required=False,
        )
        response.raise_for_status()
        payload = response.json()
        token = payload.get("access_token")
        expires_in = payload.get("expires_in")
        if not isinstance(token, str) or not isinstance(expires_in, int):
            raise RuntimeError("Invalid authentication response")
        self._token = token
        self._token_expires_at = time.time() + max(expires_in - 30, 0)
        self._logger.info("Authenticated scanner for site %s", payload.get("site_name"))

    def get_jobs(self) -> list[ScannerJob]:
        response = self._request("GET", "/api/scanner/jobs", auth_required=True)
        response.raise_for_status()
        payload = response.json()
        jobs: list[ScannerJob] = []
        for job in payload.get("jobs", []):
            try:
                scan_timeout = _parse_int(job.get("scan_timeout"))
                port_timeout = _parse_int(job.get("port_timeout"))
                jobs.append(
                    ScannerJob(
                        network_id=int(job["network_id"]),
                        cidr=str(job["cidr"]),
                        port_spec=str(job["port_spec"]),
                        rate=_parse_int(job.get("rate")),
                        scanner_type=str(job.get("scanner_type", "masscan")),
                        scan_timeout=scan_timeout if scan_timeout is not None else 3600,
                        port_timeout=port_timeout if port_timeout is not None else 1500,
                        scan_protocol=str(job.get("scan_protocol", "tcp")),
                        is_ipv6=bool(job.get("is_ipv6", False)),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                self._logger.warning("Skipping invalid job payload: %s", exc)
        return jobs

    def claim_job(self, network_id: int) -> int | None:
        response = self._request(
            "POST",
            f"/api/scanner/jobs/{network_id}/claim",
            auth_required=True,
        )
        if response.status_code in {404, 409}:
            self._logger.info(
                "Unable to claim job for network %s (status %s)",
                network_id,
                response.status_code,
            )
            return None
        response.raise_for_status()
        payload = response.json()
        scan_id = payload.get("scan_id")
        if not isinstance(scan_id, int):
            raise RuntimeError("Invalid claim response")
        return scan_id

    def submit_results(
        self,
        scan_id: int,
        status: str,
        open_ports: list[OpenPortResult],
        error_message: str | None = None,
    ) -> None:
        payload = {
            "scan_id": scan_id,
            "status": status,
            "open_ports": [entry.to_payload() for entry in open_ports],
            "error_message": error_message,
        }
        response = self._request("POST", "/api/scanner/results", json=payload, auth_required=True)
        response.raise_for_status()

    def submit_logs(self, scan_id: int, entries: list[LogEntry]) -> None:
        payload = {
            "scan_id": scan_id,
            "logs": [entry.to_payload() for entry in entries],
        }
        response = self._request("POST", "/api/scanner/logs", json=payload, auth_required=True)
        response.raise_for_status()

    def submit_progress(
        self, scan_id: int, progress_percent: float, progress_message: str | None = None
    ) -> None:
        payload: dict[str, Any] = {
            "scan_id": scan_id,
            "progress_percent": progress_percent,
        }
        if progress_message is not None:
            payload["progress_message"] = progress_message
        response = self._request(
            "POST", "/api/scanner/progress", json=payload, auth_required=True
        )
        response.raise_for_status()

    def get_scan_status(self, scan_id: int) -> str | None:
        response = self._request(
            "GET", f"/api/scanner/scans/{scan_id}/status", auth_required=True
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
        status_value = payload.get("status")
        if not isinstance(status_value, str):
            raise RuntimeError("Invalid scan status response")
        return status_value

    def get_host_discovery_jobs(self) -> list[HostDiscoveryJob]:
        """Get pending host discovery jobs for this scanner."""
        response = self._request("GET", "/api/scanner/host-discovery-jobs", auth_required=True)
        response.raise_for_status()
        payload = response.json()
        jobs: list[HostDiscoveryJob] = []
        for job in payload.get("jobs", []):
            try:
                jobs.append(
                    HostDiscoveryJob(
                        scan_id=int(job["scan_id"]),
                        network_id=int(job["network_id"]),
                        cidr=str(job["cidr"]),
                        is_ipv6=bool(job.get("is_ipv6", False)),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                self._logger.warning("Skipping invalid host discovery job payload: %s", exc)
        return jobs

    def claim_host_discovery_job(self, scan_id: int) -> HostDiscoveryJob | None:
        """Claim a host discovery job."""
        response = self._request(
            "POST",
            f"/api/scanner/host-discovery-jobs/{scan_id}/claim",
            auth_required=True,
        )
        if response.status_code in {404, 409}:
            self._logger.info(
                "Unable to claim host discovery job %s (status %s)",
                scan_id,
                response.status_code,
            )
            return None
        response.raise_for_status()
        payload = response.json()
        return HostDiscoveryJob(
            scan_id=int(payload["scan_id"]),
            network_id=int(payload["network_id"]),
            cidr=str(payload["cidr"]),
            is_ipv6=bool(payload.get("is_ipv6", False)),
        )

    def submit_host_discovery_results(
        self,
        scan_id: int,
        status: str,
        hosts: list[HostResult],
        error_message: str | None = None,
    ) -> None:
        """Submit host discovery results."""
        payload = {
            "scan_id": scan_id,
            "status": status,
            "hosts": [host.to_payload() for host in hosts],
            "error_message": error_message,
        }
        response = self._request(
            "POST", "/api/scanner/host-discovery-results", json=payload, auth_required=True
        )
        response.raise_for_status()

    def _request(
        self,
        method: str,
        url: str,
        *,
        json: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        auth_required: bool,
    ) -> httpx.Response:
        delay = self._backoff_base
        reauthed = False
        last_exc: Exception | None = None
        for attempt in range(1, self._max_retries + 1):
            if auth_required:
                self.ensure_authenticated()
            request_headers = headers.copy() if headers else {}
            if auth_required and self._token:
                request_headers["Authorization"] = f"Bearer {self._token}"
            try:
                with self._http_lock:
                    response = self._client.request(method, url, json=json, headers=request_headers)
            except httpx.RequestError as exc:
                last_exc = exc
                if attempt == self._max_retries:
                    raise
                self._logger.warning(
                    "Network error contacting backend (%s). Retrying in %.1fs",
                    exc,
                    delay,
                )
                time.sleep(delay)
                delay = min(delay * 2, self._backoff_max)
                continue

            if auth_required and response.status_code == 401 and not reauthed:
                self._logger.info("Scanner token expired; re-authenticating")
                self._token = None
                self.authenticate()
                reauthed = True
                continue

            if response.status_code in {429} or 500 <= response.status_code <= 599:
                if attempt == self._max_retries:
                    return response
                self._logger.warning(
                    "Backend returned %s. Retrying in %.1fs", response.status_code, delay
                )
                time.sleep(delay)
                delay = min(delay * 2, self._backoff_max)
                continue

            return response

        if last_exc:
            raise last_exc
        raise RuntimeError("Request failed after retries")


def _normalize_log_level(level_name: str) -> str:
    if level_name.lower() in {"warning", "warn"}:
        return "warning"
    if level_name.lower() in {"error", "critical"}:
        return "error"
    return "info"


def _parse_int(value: Any) -> int | None:
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _split_port_spec(port_spec: str) -> tuple[str, str | None]:
    includes: list[str] = []
    excludes: list[str] = []
    for raw_part in port_spec.split(","):
        part = raw_part.strip()
        if not part:
            continue
        if part.startswith("!"):
            exclude_value = part[1:].strip()
            if exclude_value:
                excludes.append(exclude_value)
        else:
            includes.append(part)
    include_spec = ",".join(includes) if includes else "1-65535"
    exclude_spec = ",".join(excludes) if excludes else None
    return include_spec, exclude_spec


def _check_ipv6_connectivity(logger: logging.Logger) -> bool:
    logger.info("Checking IPv6 connectivity before scan")
    for target in IPV6_CONNECTIVITY_TARGETS:
        try:
            with socket.create_connection(
                (target, 53),
                timeout=IPV6_CONNECTIVITY_TIMEOUT_SECONDS,
            ):
                logger.info("IPv6 connectivity check succeeded (%s)", target)
                return True
        except OSError as exc:
            logger.warning("IPv6 connectivity check failed for %s: %s", target, exc)
    logger.error("IPv6 connectivity not available")
    return False


# Regex patterns for progress parsing
MASSCAN_PROGRESS_PATTERN = re.compile(
    r"rate:\s*[\d,]+(?:\.\d+)?[^\d]*"  # rate prefix
    r"(\d+(?:\.\d+)?)\s*%"  # capture percentage
)
NMAP_PROGRESS_PATTERN = re.compile(
    r"(?:About\s+)?(\d+(?:\.\d+)?)\s*%\s*done",  # e.g., "About 45.23% done" or "45.23% done"
    re.IGNORECASE,
)


def _parse_masscan_progress(line: str) -> float | None:
    """Parse masscan stderr to extract progress percentage.

    Masscan outputs progress like:
    rate:  0.00-kpps, 0.00% done,   0:00:00 remaining, found=0
    """
    match = MASSCAN_PROGRESS_PATTERN.search(line)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, TypeError):
            pass
    return None


def _parse_nmap_progress(line: str) -> float | None:
    """Parse nmap stderr to extract progress percentage.

    Nmap with --stats-every outputs progress like:
    Stats: 0:00:05 elapsed; 0 hosts completed (1 up), 1 undergoing SYN Stealth Scan
    SYN Stealth Scan Timing: About 45.23% done; ETC: 12:34 (0:00:05 remaining)
    """
    match = NMAP_PROGRESS_PATTERN.search(line)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, TypeError):
            pass
    return None


def _parse_masscan_json(content: str, logger: logging.Logger) -> list[dict[str, Any]]:
    trimmed = content.strip()
    if not trimmed:
        return []
    try:
        data = json.loads(trimmed)
        if isinstance(data, list):
            return data
    except json.JSONDecodeError:
        logger.debug("Masscan JSON parsing failed; attempting line-by-line parsing")

    entries: list[dict[str, Any]] = []
    for line in trimmed.splitlines():
        line = line.strip().rstrip(",")
        if not line or line in {"[", "]"}:
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(entry, dict):
            entries.append(entry)
    return entries


def _extract_open_ports(entries: list[dict[str, Any]]) -> list[OpenPortResult]:
    results: list[OpenPortResult] = []
    for entry in entries:
        ip = entry.get("ip")
        if not isinstance(ip, str):
            continue
        mac_address = None
        mac_vendor = None
        if isinstance(entry.get("mac"), str):
            mac_address = entry.get("mac")
        if isinstance(entry.get("vendor"), str):
            mac_vendor = entry.get("vendor")
        ports = entry.get("ports", [])
        if not isinstance(ports, list):
            continue
        for port_entry in ports:
            if not isinstance(port_entry, dict):
                continue
            status = port_entry.get("status")
            if isinstance(status, str) and status.lower() != "open":
                continue
            port_value = _parse_int(port_entry.get("port"))
            if port_value is None:
                continue
            protocol_value = port_entry.get("proto") or port_entry.get("protocol") or "tcp"
            protocol = str(protocol_value)
            ttl = _parse_int(port_entry.get("ttl"))
            banner = port_entry.get("banner")
            if banner is not None and not isinstance(banner, str):
                banner = str(banner)
            port_mac = port_entry.get("mac")
            port_vendor = port_entry.get("vendor")
            results.append(
                OpenPortResult(
                    ip=ip,
                    port=port_value,
                    protocol=protocol,
                    ttl=ttl,
                    banner=banner,
                    service_guess=None,  # masscan doesn't detect services
                    mac_address=port_mac if isinstance(port_mac, str) else mac_address,
                    mac_vendor=port_vendor if isinstance(port_vendor, str) else mac_vendor,
                )
            )
    return results


def _build_masscan_port_spec(include_ports: str, scan_protocol: str) -> str:
    """Build masscan port specification based on scan protocol.

    Masscan port syntax:
    - TCP only: -p <ports> or -p T:<ports>
    - UDP only: -pU:<ports>
    - Both: -p T:<ports>,U:<ports>
    """
    if scan_protocol == "udp":
        return f"U:{include_ports}"
    elif scan_protocol == "both":
        return f"T:{include_ports},U:{include_ports}"
    else:
        # Default to TCP
        return include_ports


def _run_masscan(
    client: ScannerClient,
    scan_id: int,
    cidr: str,
    port_spec: str,
    rate: int | None,
    scan_timeout: int,
    port_timeout: int,
    scan_protocol: str,
    logger: logging.Logger,
    progress_reporter: ProgressReporter | None = None,
) -> ScanRunResult:
    include_ports, exclude_ports = _split_port_spec(port_spec)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".json") as output_file:
        output_path = output_file.name

    wait_seconds = max(1, int(math.ceil(port_timeout / 100.0)))

    # Build port specification based on protocol
    masscan_port_spec = _build_masscan_port_spec(include_ports, scan_protocol)

    command = [
        "masscan",
        cidr,
        f"-p{masscan_port_spec}",
        "--banners",
        "--wait",
        str(wait_seconds),
        "-oJ",
        output_path,
    ]
    if exclude_ports:
        command.extend(["--exclude-ports", exclude_ports])

    if rate:
        command.extend(["--rate", str(rate)])

    logger.info("Masscan command: %s", _format_command(command))
    protocol_label = scan_protocol.upper() if scan_protocol != "both" else "TCP+UDP"
    logger.info("Running masscan for %s with ports %s (%s)", cidr, include_ports, protocol_label)
    if exclude_ports:
        logger.info("Excluding ports: %s", exclude_ports)
    if rate:
        logger.info("Rate limit: %s pps", rate)
    logger.info("Port timeout (masscan --wait): %s seconds", wait_seconds)

    timeout_watcher: ProcessTimeoutWatcher | None = None
    cancel_watcher: ScanCancellationWatcher | None = None
    try:
        # Use Popen to capture stdout/stderr for progress monitoring
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        timeout_watcher = ProcessTimeoutWatcher(
            process=process,
            timeout_seconds=scan_timeout,
            logger=logger,
            label="Masscan",
        )
        timeout_watcher.start()
        cancel_watcher = ScanCancellationWatcher(
            client=client,
            scan_id=scan_id,
            process=process,
            logger=logger,
        )
        cancel_watcher.start()

        stderr_lines: list[str] = []
        # Read stdout (stderr is merged into stdout) line by line to extract progress
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                logger.info("Masscan: %s", line)
                stderr_lines.append(line)

                # Try to parse progress from stdout
                if progress_reporter:
                    progress = _parse_masscan_progress(line)
                    if progress is not None:
                        progress_reporter.update(progress, f"Scanning: {progress}% complete")

        # Wait for process to complete
        returncode = process.wait()
        timed_out = False
        cancelled = False
        if timeout_watcher:
            timeout_watcher.stop()
            timeout_watcher.join()
            timed_out = timeout_watcher.timed_out
            timeout_watcher = None
        if cancel_watcher:
            cancel_watcher.stop()
            cancel_watcher.join()
            cancelled = cancel_watcher.cancelled
            cancel_watcher = None

        if cancelled:
            with open(output_path, "r", encoding="utf-8") as handle:
                content = handle.read()
            entries = _parse_masscan_json(content, logger)
            return ScanRunResult(open_ports=_extract_open_ports(entries), cancelled=True)
        if timed_out:
            raise TimeoutError(f"Masscan exceeded timeout of {scan_timeout} seconds")
        if returncode != 0:
            stderr_output = "\n".join(stderr_lines)
            if stderr_output:
                logger.error("Masscan stderr: %s", stderr_output)
            raise RuntimeError(f"Masscan failed with exit code {returncode}")

        with open(output_path, "r", encoding="utf-8") as handle:
            content = handle.read()
    finally:
        if timeout_watcher:
            timeout_watcher.stop()
            timeout_watcher.join()
        if cancel_watcher:
            cancel_watcher.stop()
            cancel_watcher.join()
        try:
            os.remove(output_path)
        except OSError:
            pass

    entries = _parse_masscan_json(content, logger)
    return ScanRunResult(open_ports=_extract_open_ports(entries), cancelled=False)


def _run_nmap_service_detection(
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
            "--version-intensity", "5",  # Balanced intensity (0-9)
            "-T4",  # Aggressive timing
            "-p", port_list,
            "-oX", output_path,
            "--open",  # Only show open ports
            "-Pn",  # Skip host discovery (we know hosts are up from masscan)
            "--stats-every", "5s",  # Report progress every 5 seconds
            "-iL", targets_path,  # Read targets from file
        ]

        logger.info("Nmap service detection command: %s", _format_command(command))
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
                                if any(x in line for x in ["Stats:", "Timing:", "elapsed", "remaining", "done", "hosts completed"]):
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
    logger.info("Nmap %s command: %s", phase_name, _format_command(command))

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
                    logger.error("Nmap %s exceeded max runtime (%s seconds); terminating", phase_name, scan_timeout)
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
                            line, sep, buffer = buffer.partition("\n") if "\n" in buffer else buffer.partition("\r")
                            line = line.strip()
                            if line:
                                output_lines.append(line)
                                if any(x in line for x in ["Stats:", "Timing:", "elapsed", "remaining", "done"]):
                                    logger.info("Nmap: %s", line)

                                    # Parse host completion stats: "8 hosts completed (32 up), 24 undergoing"
                                    stats_match = re.search(
                                        r"(\d+)\s+hosts?\s+completed\s+\((\d+)\s+up\)(?:,\s+(\d+)\s+undergoing)?",
                                        line, re.IGNORECASE
                                    )
                                    if stats_match:
                                        hosts_completed = int(stats_match.group(1))
                                        total_hosts_up = int(stats_match.group(2))
                                        hosts_in_progress = int(stats_match.group(3)) if stats_match.group(3) else 0

                                        # When nmap discovers more hosts, reset max to completed work only
                                        if total_hosts_up > last_total_hosts and last_total_hosts > 0:
                                            # Recalculate max based on completed hosts (locked-in progress)
                                            completed_pct = (hosts_completed / total_hosts_up) * 100.0
                                            max_scaled_pct = progress_offset + (completed_pct * progress_scale)
                                            logger.info("Host count increased %d -> %d, reset progress to %.1f%% (completed hosts only)",
                                                       last_total_hosts, total_hosts_up, max_scaled_pct)
                                        last_total_hosts = total_hosts_up

                                    # Parse batch percentage: "About 26.91% done"
                                    pct_match = re.search(r"About\s+([\d.]+)%\s+done", line, re.IGNORECASE)
                                    if pct_match and progress_reporter and total_hosts_up > 0:
                                        try:
                                            batch_pct = float(pct_match.group(1))
                                            # Calculate true overall progress accounting for host batching
                                            # Formula: (completed_hosts + in_progress_hosts * batch_pct/100) / total_hosts * 100
                                            batch_progress = hosts_in_progress * batch_pct / 100.0
                                            overall_nmap_pct = ((hosts_completed + batch_progress) / total_hosts_up) * 100.0
                                            # Scale to phase range (0-50% for phase 1, 50-100% for phase 2)
                                            scaled_pct = progress_offset + (overall_nmap_pct * progress_scale)
                                            # Never let progress bar go backwards within the same host count
                                            # But always update the message so user sees activity
                                            display_pct = max(scaled_pct, max_scaled_pct)
                                            if scaled_pct > max_scaled_pct:
                                                max_scaled_pct = scaled_pct
                                            progress_msg = f"{phase_name}: {hosts_completed}/{total_hosts_up} hosts, batch {batch_pct:.0f}%"
                                            progress_reporter.update(display_pct, progress_msg)
                                            logger.info("Progress %.1f%% (overall: %.1f%%, batch: %.1f%%) - %d/%d hosts",
                                                       display_pct, overall_nmap_pct, batch_pct, hosts_completed, total_hosts_up)
                                        except (ValueError, ZeroDivisionError):
                                            pass
                                elif line.startswith("Nmap scan report") or "PORT" in line or "/tcp" in line or "/udp" in line:
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


def _run_nmap(
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
    include_ports, exclude_ports = _split_port_spec(port_spec)

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
    logger.info("Running nmap hybrid scan for %s with ports %s (%s)", cidr, include_ports, protocol_label)
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
        "--max-rtt-timeout", f"{int(port_timeout)}ms",
        "-oX", phase1_output,
        "--open",
        "-T4",
        "--stats-every", "5s",
        cidr,
    ]

    # Use 70% of timeout for phase 1
    phase1_timeout = int(scan_timeout * 0.7) if scan_timeout > 0 else 0

    xml_content, cancelled, timed_out, exit_status = _run_nmap_phase(
        client, scan_id, phase1_command, phase1_output,
        phase1_timeout, "Phase 1 - Port Discovery", logger, progress_reporter,
        progress_offset=0.0, progress_scale=0.5,  # Maps to 0-50%
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
    logger.info("Phase 1 complete: found %d open ports on %d hosts", total_open, len(open_port_targets))

    # ========== PHASE 2: Service detection on open ports only ==========
    logger.info("=== Phase 2: Service detection on %d open ports ===", total_open)
    if progress_reporter:
        progress_reporter.update(50.0, f"Starting Phase 2 - detecting services on {total_open} ports")

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
        "--version-intensity", "5",  # Balanced intensity
        f"-p{port_list}",
        "--max-rtt-timeout", f"{int(port_timeout)}ms",
        "-oX", phase2_output,
        "--open",
        "-T4",
        "--stats-every", "5s",
        "-iL", phase2_targets_file,  # Read targets from file
    ]

    # Use remaining 30% of timeout for phase 2
    phase2_timeout = int(scan_timeout * 0.3) if scan_timeout > 0 else 0

    try:
        xml_content2, cancelled2, timed_out2, exit_status2 = _run_nmap_phase(
            client, scan_id, phase2_command, phase2_output,
            phase2_timeout, "Phase 2 - Service Detection", logger, progress_reporter,
            progress_offset=50.0, progress_scale=0.5,  # Maps to 50-100%
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
            progress_reporter.update(100.0, f"Complete - {len(phase2_ports)} open ports with service info")

        return ScanRunResult(open_ports=phase2_ports, cancelled=False)
    finally:
        # Clean up targets file
        try:
            os.unlink(phase2_targets_file)
        except OSError:
            pass


def _parse_nmap_host_discovery_xml(xml_content: str, logger: logging.Logger) -> list[HostResult]:
    """Parse nmap XML output from host discovery scan and extract host info."""
    results: list[HostResult] = []

    try:
        root = ET.fromstring(xml_content)
    except ET.ParseError as exc:
        logger.error("Failed to parse nmap XML output: %s", exc)
        return results

    for host in root.findall(".//host"):
        # Check if host is up (pingable)
        status_elem = host.find("status")
        is_pingable = status_elem is not None and status_elem.get("state") == "up"

        # Get IP address
        ip_addr: str | None = None
        mac_address: str | None = None
        mac_vendor: str | None = None

        for addr_elem in host.findall("address"):
            addr_type = addr_elem.get("addrtype", "")
            if addr_type in ("ipv4", "ipv6"):
                ip_addr = addr_elem.get("addr")
            elif addr_type == "mac":
                mac_address = addr_elem.get("addr")
                mac_vendor = addr_elem.get("vendor")

        if not ip_addr:
            continue

        # Get hostname from reverse DNS
        hostname: str | None = None
        hostnames_elem = host.find("hostnames")
        if hostnames_elem is not None:
            hostname_elem = hostnames_elem.find("hostname")
            if hostname_elem is not None:
                hostname = hostname_elem.get("name")

        results.append(
            HostResult(
                ip=ip_addr,
                hostname=hostname,
                is_pingable=is_pingable,
                mac_address=mac_address,
                mac_vendor=mac_vendor,
            )
        )

    return results


def _run_host_discovery(
    cidr: str,
    is_ipv6: bool,
    logger: logging.Logger,
    timeout: int = 300,
) -> list[HostResult]:
    """
    Run host discovery using nmap ping scan with reverse DNS.
    Only returns hosts that responded to the scan (is_pingable=True).

    Command: nmap -sn -R [-6] --host-timeout {timeout}s -oX {output} {cidr}

    -sn: Ping scan (no port scan)
    -R: Always do reverse DNS lookup
    """
    with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as output_file:
        output_path = output_file.name

    command = [
        "nmap",
        "-sn",  # Ping scan only
        "-PE",  # ICMP echo only (no TCP/ARP probes)
        "--disable-arp-ping",  # Don't use ARP (which finds all hosts on local network)
        "-R",  # Always do reverse DNS
        *(["-6"] if is_ipv6 else []),
        "--host-timeout", f"{timeout}s",
        "-oX", output_path,
        cidr,
    ]

    logger.info("Running host discovery for %s", cidr)
    logger.info("Host discovery command: %s", _format_command(command))
    if is_ipv6:
        logger.info("Host discovery IPv6 mode enabled (-6)")

    try:
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )

        # Read output for logging
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if line:
                    logger.info("Nmap: %s", line)

        returncode = process.wait()
        if returncode != 0:
            raise RuntimeError(f"Nmap host discovery failed with exit code {returncode}")

        # Read results
        with open(output_path, "r", encoding="utf-8") as handle:
            content = handle.read()

        return _parse_nmap_host_discovery_xml(content, logger)

    finally:
        try:
            os.remove(output_path)
        except OSError:
            pass


def _process_host_discovery_job(
    job: HostDiscoveryJob,
    client: ScannerClient,
    logger: logging.Logger,
) -> None:
    """Process a host discovery job."""
    logger.info("Claiming host discovery job for network %s (scan_id=%s)", job.network_id, job.scan_id)

    claimed_job = client.claim_host_discovery_job(job.scan_id)
    if claimed_job is None:
        return

    logger.info("Claimed host discovery job for network %s", claimed_job.network_id)

    try:
        if claimed_job.is_ipv6:
            if not _check_ipv6_connectivity(logger):
                raise RuntimeError("IPv6 connectivity not available")

        hosts = _run_host_discovery(
            claimed_job.cidr,
            claimed_job.is_ipv6,
            logger,
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
            logger.exception("Failed to submit failure results for host discovery scan %s", claimed_job.scan_id)


def _load_config() -> ScannerConfig:
    backend_url = os.environ.get("BACKEND_URL")
    api_key = os.environ.get("API_KEY")
    if not backend_url or not api_key:
        raise SystemExit("BACKEND_URL and API_KEY must be set")

    poll_interval_raw = os.environ.get("POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL))
    log_level = os.environ.get("LOG_LEVEL", "INFO")

    try:
        poll_interval = int(poll_interval_raw)
    except ValueError:
        poll_interval = DEFAULT_POLL_INTERVAL

    if poll_interval < 5:
        poll_interval = 5

    return ScannerConfig(
        backend_url=backend_url.rstrip("/"),
        api_key=api_key,
        poll_interval=poll_interval,
        log_level=log_level,
    )


def _configure_logging(level: str, buffer_handler: LogBufferHandler) -> logging.Logger:
    logger = logging.getLogger("scanner")
    root = logging.getLogger()
    root.handlers.clear()
    if isinstance(level, str):
        normalized_level = getattr(logging, level.upper(), logging.INFO)
    else:
        normalized_level = logging.INFO
    root.setLevel(normalized_level)

    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)

    root.addHandler(stream_handler)
    root.addHandler(buffer_handler)

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    return logger


def _process_job(
    job: ScannerJob,
    client: ScannerClient,
    logger: logging.Logger,
    log_buffer: LogBufferHandler,
) -> None:
    log_buffer.reset()
    logger.info("Claiming job for network %s", job.network_id)

    scan_id = client.claim_job(job.network_id)
    if scan_id is None:
        log_buffer.reset()
        return

    logger.info("Claimed job for network %s with scan ID %s", job.network_id, scan_id)
    logger.info("Scanner type: %s", job.scanner_type)
    logger.info("Scan protocol: %s", job.scan_protocol)

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
            if not _check_ipv6_connectivity(logger):
                raise RuntimeError("IPv6 connectivity not available")

        # Dispatch to appropriate scanner based on scanner_type
        if job.scanner_type == "nmap":
            result = _run_nmap(
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
            result = _run_masscan(
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
                updated_ports = _run_nmap_service_detection(
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

        if result.cancelled:
            try:
                client.submit_results(
                    scan_id,
                    "failed",
                    result.open_ports,
                    error_message="Scan cancelled by user request",
                )
                logger.info("Submitted cancelled scan results for scan %s", scan_id)
            except Exception:
                logger.exception("Failed to submit cancelled scan results for scan %s", scan_id)
            return

        # Report 100% at completion
        progress_reporter.update(100, "Scan complete")

        client.submit_results(scan_id, "success", result.open_ports)
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


def _check_dependencies(logger: logging.Logger) -> None:
    """Check if required external tools are available."""
    for tool in ["masscan", "nmap"]:
        if not shutil.which(tool):
            logger.warning(
                "Required tool '%s' not found in PATH. Scans using this tool will fail.", tool
            )


def get_version() -> str:
    """Get scanner version from VERSION file or APP_VERSION environment variable.
    
    Checks /app/VERSION file first, then falls back to APP_VERSION env var, then 'unknown'.
    """
    from pathlib import Path
    
    # Try reading from VERSION file first (for dev mode with mounted file)
    version_file = Path("/app/VERSION")
    if version_file.exists():
        try:
            version = version_file.read_text().strip()
            if version:
                return version
        except Exception:
            pass
    
    # Fall back to environment variable (for production builds)
    return os.environ.get("APP_VERSION", "unknown")


def main() -> None:
    """Main entry point for the scanner agent."""
    config = _load_config()
    log_buffer = LogBufferHandler()
    logger = _configure_logging(config.log_level, log_buffer)

    _check_dependencies(logger)

    version = get_version()
    logger.info("Open Port Monitor Scanner v%s starting...", version)
    logger.info("Polling interval set to %s seconds", config.poll_interval)

    client = ScannerClient(config.backend_url, config.api_key, logger, scanner_version=version)

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
                        _process_job(job, client, logger, log_buffer)
            except Exception:
                logger.exception("Failed to fetch port scan jobs")

            # Check for host discovery jobs
            try:
                host_discovery_jobs = client.get_host_discovery_jobs()
                if host_discovery_jobs:
                    has_work = True
                    logger.info("Found %s pending host discovery job(s)", len(host_discovery_jobs))
                    for job in host_discovery_jobs:
                        _process_host_discovery_job(job, client, logger)
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
