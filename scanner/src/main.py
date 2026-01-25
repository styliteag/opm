"""Open Port Monitor Scanner Agent - Main entry point."""

from __future__ import annotations

import json
import logging
import math
import os
import re
import shlex
import shutil
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
        self._current_percent: int = 0
        self._current_message: str | None = None
        self._last_reported_percent: int = -1

    def stop(self) -> None:
        self._stop_event.set()

    def update(self, percent: int, message: str | None = None) -> None:
        """Update the current progress values (thread-safe)."""
        with self._lock:
            self._current_percent = max(0, min(100, percent))
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
        if percent == self._last_reported_percent:
            return

        try:
            self._client.submit_progress(self._scan_id, percent, message)
            self._last_reported_percent = percent
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
        self, scan_id: int, progress_percent: int, progress_message: str | None = None
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
    r"(\d+(?:\.\d+)?)\s*%\s*done"  # e.g., "45.23% done"
)


def _parse_masscan_progress(line: str) -> int | None:
    """Parse masscan stderr to extract progress percentage.

    Masscan outputs progress like:
    rate:  0.00-kpps, 0.00% done,   0:00:00 remaining, found=0
    """
    match = MASSCAN_PROGRESS_PATTERN.search(line)
    if match:
        try:
            return int(float(match.group(1)))
        except (ValueError, TypeError):
            pass
    return None


def _parse_nmap_progress(line: str) -> int | None:
    """Parse nmap stderr to extract progress percentage.

    Nmap with --stats-every outputs progress like:
    Stats: 0:00:05 elapsed; 0 hosts completed (1 up), 1 undergoing SYN Stealth Scan
    SYN Stealth Scan Timing: About 45.23% done; ETC: 12:34 (0:00:05 remaining)
    """
    match = NMAP_PROGRESS_PATTERN.search(line)
    if match:
        try:
            return int(float(match.group(1)))
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
        # Read stderr line by line to extract progress
        if process.stderr:
            for line in process.stderr:
                line = line.strip()
                if not line:
                    continue
                logger.info("Masscan: %s", line)
                stderr_lines.append(line)

                # Try to parse progress from stderr
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

            # Get service info for banner
            banner: str | None = None
            service_elem = port_elem.find("service")
            if service_elem is not None:
                service_parts: list[str] = []
                service_name = service_elem.get("name")
                if service_name:
                    service_parts.append(service_name)
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
                    mac_address=mac_address,
                    mac_vendor=mac_vendor,
                )
            )

    return results


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
    """Run nmap scan and return list of open ports."""
    include_ports, exclude_ports = _split_port_spec(port_spec)

    # Build port specification for nmap
    # Nmap doesn't have direct port exclusion, so we only scan included ports
    # If there are exclusions, log a warning since nmap handles this differently
    if exclude_ports:
        logger.warning(
            "Nmap does not support port exclusions in the same way as masscan. "
            "Excluded ports (%s) will not be scanned if included in the port spec.",
            exclude_ports,
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".xml") as output_file:
        output_path = output_file.name

    # Build scan type flags based on protocol
    # -sS: TCP SYN scan (requires root/cap_net_raw)
    # -sU: UDP scan (requires root)
    scan_flags: list[str] = []
    if scan_protocol == "tcp":
        scan_flags = ["-sS"]
    elif scan_protocol == "udp":
        scan_flags = ["-sU"]
    else:  # both
        scan_flags = ["-sS", "-sU"]

    command = [
        "nmap",
        *(["-6"] if is_ipv6 else []),
        *scan_flags,
        "-sV",  # Service/version detection for banner info
        f"-p{include_ports}",
        "--host-timeout",
        f"{int(scan_timeout) * 1000}ms",
        "--max-rtt-timeout",
        f"{int(port_timeout)}ms",
        "-oX", output_path,  # XML output
        "--open",  # Only show open ports
        "-T4",  # Aggressive timing (faster scan)
        "--stats-every", "5s",  # Print stats every 5 seconds for progress monitoring
        cidr,
    ]

    protocol_label = scan_protocol.upper() if scan_protocol != "both" else "TCP+UDP"
    logger.info("Running nmap for %s with ports %s (%s)", cidr, include_ports, protocol_label)
    logger.info("Nmap command: %s", _format_command(command))
    if is_ipv6:
        logger.info("Nmap IPv6 mode enabled (-6)")

    timeout_watcher: ProcessTimeoutWatcher | None = None
    cancel_watcher: ScanCancellationWatcher | None = None
    try:
        # Use Popen to capture stderr for progress monitoring
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        timeout_watcher = ProcessTimeoutWatcher(
            process=process,
            timeout_seconds=scan_timeout,
            logger=logger,
            label="Nmap",
        )
        timeout_watcher.start()
        cancel_watcher = ScanCancellationWatcher(
            client=client,
            scan_id=scan_id,
            process=process,
            logger=logger,
        )
        cancel_watcher.start()

        stdout_lines: list[str] = []
        # Read stdout (stderr is merged into stdout) line by line to extract progress
        if process.stdout:
            for line in process.stdout:
                line = line.strip()
                if not line:
                    continue
                stdout_lines.append(line)

                uppercase_line = line.upper()
                if "WARNING" in uppercase_line or "RTTVAR" in uppercase_line:
                    logger.warning("Nmap: %s", line)
                elif "ERROR" in uppercase_line or "FAILED" in uppercase_line:
                    logger.error("Nmap: %s", line)
                else:
                    logger.info("Nmap: %s", line)

                # Try to parse progress from stdout
                if progress_reporter:
                    progress = _parse_nmap_progress(line)
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
            return ScanRunResult(open_ports=_parse_nmap_xml(content, logger), cancelled=True)
        if timed_out:
            raise TimeoutError(f"Nmap exceeded timeout of {scan_timeout} seconds")
        if returncode != 0:
            stdout_output = "\n".join(stdout_lines)
            if stdout_output:
                logger.error("Nmap output: %s", stdout_output)
            raise RuntimeError(f"Nmap failed with exit code {returncode}")

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

    return ScanRunResult(open_ports=_parse_nmap_xml(content, logger), cancelled=False)


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
            try:
                jobs = client.get_jobs()
            except Exception:
                logger.exception("Failed to fetch scanner jobs")
                time.sleep(config.poll_interval)
                continue

            if not jobs:
                logger.debug("No pending jobs; sleeping")
                time.sleep(config.poll_interval)
                continue

            logger.info("Found %s pending job(s)", len(jobs))
            for job in jobs:
                _process_job(job, client, logger, log_buffer)

            time.sleep(config.poll_interval)
    except KeyboardInterrupt:
        logger.info("Scanner agent shutting down...")
    finally:
        client.close()


if __name__ == "__main__":
    main()
