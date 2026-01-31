"""HTTP client for communicating with the backend."""

from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Any

import httpx

from src.models import HostDiscoveryJob, HostResult, LogEntry, OpenPortResult, ScannerJob
from src.ssh_probe import SSHProbeResult
from src.utils import parse_int

# Constants
REQUEST_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 5
BACKOFF_BASE_SECONDS = 1.0
BACKOFF_MAX_SECONDS = 30.0


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
        """Close the HTTP client."""
        self._client.close()

    def wait_for_backend(self, max_attempts: int = 30, initial_delay: float = 2.0) -> None:
        """Wait for the backend to be reachable before starting.

        Retries with exponential backoff until the backend responds successfully.

        Args:
            max_attempts: Maximum number of attempts before giving up
            initial_delay: Initial delay between attempts in seconds
        """
        delay = initial_delay
        for attempt in range(1, max_attempts + 1):
            try:
                # Try to hit the health endpoint (no auth required)
                response = self._client.get("/health")
                if response.status_code == 200:
                    self._logger.info("Backend is ready")
                    return
                self._logger.warning(
                    "Backend returned %s (attempt %d/%d), retrying in %.1fs...",
                    response.status_code, attempt, max_attempts, delay
                )
            except httpx.RequestError as e:
                self._logger.warning(
                    "Backend not reachable: %s (attempt %d/%d), retrying in %.1fs...",
                    type(e).__name__, attempt, max_attempts, delay
                )

            if attempt < max_attempts:
                time.sleep(delay)
                delay = min(delay * 1.5, 30.0)  # Cap at 30 seconds

        raise RuntimeError(f"Backend not reachable after {max_attempts} attempts")

    def ensure_authenticated(self) -> None:
        """Ensure the client has a valid authentication token."""
        if self._token is None or time.time() >= self._token_expires_at:
            self.authenticate()

    def authenticate(self) -> None:
        """Authenticate the scanner with the backend."""
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
        """Get pending port scan jobs."""
        response = self._request("GET", "/api/scanner/jobs", auth_required=True)
        response.raise_for_status()
        payload = response.json()
        jobs: list[ScannerJob] = []
        for job in payload.get("jobs", []):
            try:
                scan_timeout = parse_int(job.get("scan_timeout"))
                port_timeout = parse_int(job.get("port_timeout"))
                jobs.append(
                    ScannerJob(
                        network_id=int(job["network_id"]),
                        cidr=str(job["cidr"]),
                        port_spec=str(job["port_spec"]),
                        rate=parse_int(job.get("rate")),
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
        """Claim a port scan job.
        
        Args:
            network_id: The network ID to claim
            
        Returns:
            Scan ID if successful, None otherwise
        """
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
        ssh_results: list[SSHProbeResult] | None = None,
        error_message: str | None = None,
    ) -> None:
        """Submit scan results to the backend.
        
        Args:
            scan_id: The scan ID
            status: Scan status (success, failed, etc.)
            open_ports: List of discovered open ports
            ssh_results: Optional list of SSH probe results
            error_message: Optional error message
        """
        payload: dict[str, Any] = {
            "scan_id": scan_id,
            "status": status,
            "open_ports": [entry.to_payload() for entry in open_ports],
            "error_message": error_message,
        }
        if ssh_results:
            payload["ssh_results"] = [result.to_dict() for result in ssh_results]
        response = self._request("POST", "/api/scanner/results", json=payload, auth_required=True)
        response.raise_for_status()

    def submit_logs(self, scan_id: int, entries: list[LogEntry]) -> None:
        """Submit log entries to the backend.
        
        Args:
            scan_id: The scan ID
            entries: List of log entries
        """
        payload = {
            "scan_id": scan_id,
            "logs": [entry.to_payload() for entry in entries],
        }
        response = self._request("POST", "/api/scanner/logs", json=payload, auth_required=True)
        response.raise_for_status()

    def submit_progress(
        self, scan_id: int, progress_percent: float, progress_message: str | None = None
    ) -> None:
        """Submit progress update to the backend.
        
        Args:
            scan_id: The scan ID
            progress_percent: Progress percentage (0-100)
            progress_message: Optional progress message
        """
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
        """Get the current status of a scan.
        
        Args:
            scan_id: The scan ID
            
        Returns:
            Scan status or None if not found
        """
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
        """Claim a host discovery job.
        
        Args:
            scan_id: The scan ID to claim
            
        Returns:
            HostDiscoveryJob if successful, None otherwise
        """
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
        """Submit host discovery results.
        
        Args:
            scan_id: The scan ID
            status: Scan status (success, failed, etc.)
            hosts: List of discovered hosts
            error_message: Optional error message
        """
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
        """Make an HTTP request with retries and authentication.
        
        Args:
            method: HTTP method
            url: URL path
            json: Optional JSON payload
            headers: Optional headers
            auth_required: Whether authentication is required
            
        Returns:
            HTTP response
        """
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
