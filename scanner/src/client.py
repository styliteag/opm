"""HTTP client for communicating with the backend."""

from __future__ import annotations

import logging
import time
from threading import Lock
from typing import Any

import httpx

from src.models import (
    ClaimedJob,
    HostDiscoveryJob,
    HostnameCacheStatus,
    HostnameLookupJob,
    HostResult,
    LogEntry,
    NseScriptResult,
    OpenPortResult,
    ScannerJob,
    ScannerJobsResult,
    ScanPhase,
    VulnerabilityResult,
)
from src.ssh_probe import SSHProbeResult
from src.utils import parse_int

# Constants
REQUEST_TIMEOUT_SECONDS = 15.0
MAX_RETRIES = 5
BACKOFF_BASE_SECONDS = 1.0
BACKOFF_MAX_SECONDS = 30.0


def _parse_phases(raw: list[dict[str, Any]] | None) -> list[ScanPhase] | None:
    """Parse phases JSON into ScanPhase dataclass list."""
    if not raw:
        return None
    return [
        ScanPhase(
            name=p["name"],
            enabled=p.get("enabled", True),
            tool=p["tool"],
            config=p.get("config", {}),
        )
        for p in raw
    ]


class ScannerClient:
    """HTTP client wrapper with authentication and retry handling."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        logger: logging.Logger,
        scanner_version: str = "unknown",
        scanner_kind: str = "standard",
        timeout: float = REQUEST_TIMEOUT_SECONDS,
        max_retries: int = MAX_RETRIES,
        backoff_base: float = BACKOFF_BASE_SECONDS,
        backoff_max: float = BACKOFF_MAX_SECONDS,
    ) -> None:
        self._client = httpx.Client(base_url=base_url, timeout=timeout)
        self._api_key = api_key
        self._logger = logger
        self._scanner_version = scanner_version
        self._scanner_kind = scanner_kind
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
                    response.status_code,
                    attempt,
                    max_attempts,
                    delay,
                )
            except httpx.RequestError as e:
                self._logger.warning(
                    "Backend not reachable: %s (attempt %d/%d), retrying in %.1fs...",
                    type(e).__name__,
                    attempt,
                    max_attempts,
                    delay,
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
            json={
                "scanner_version": self._scanner_version,
                "scanner_kind": self._scanner_kind,
            },
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

    def get_jobs(self) -> ScannerJobsResult:
        """Get pending port scan jobs + GVM control-plane flags."""
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
                        target_ip=job.get("target_ip"),
                        nse_scripts=job.get("nse_scripts"),
                        nse_script_args=job.get("nse_script_args"),
                        custom_script_hashes=job.get("custom_script_hashes"),
                        phases=_parse_phases(job.get("phases")),
                        gvm_scan_config=job.get("gvm_scan_config"),
                        gvm_port_list=job.get("gvm_port_list"),
                        gvm_keep_reports=bool(job.get("gvm_keep_reports", True)),
                        ssh_probe_enabled=bool(job.get("ssh_probe_enabled", True)),
                        nuclei_enabled=bool(job.get("nuclei_enabled", False)),
                        nuclei_tags=job.get("nuclei_tags"),
                        nuclei_exclude_tags=job.get("nuclei_exclude_tags"),
                        nuclei_severity=job.get("nuclei_severity"),
                        nuclei_timeout=parse_int(job.get("nuclei_timeout")),
                        nuclei_sni_enabled=bool(
                            job.get("nuclei_sni_enabled", False)
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                self._logger.warning("Skipping invalid job payload: %s", exc)
        return ScannerJobsResult(
            jobs=jobs,
            gvm_refresh=bool(payload.get("gvm_refresh", False)),
        )

    def claim_job(self, network_id: int) -> ClaimedJob | None:
        """Claim a port scan job.

        Args:
            network_id: The network ID to claim

        Returns:
            ClaimedJob with scan_id and required_library_entries, or None.
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
        required_raw = payload.get("required_library_entries") or []
        required: list[dict[str, str]] = []
        for item in required_raw:
            if not isinstance(item, dict):
                continue
            kind = item.get("kind")
            name = item.get("name")
            xml_hash = item.get("xml_hash")
            if not (isinstance(kind, str) and isinstance(name, str) and isinstance(xml_hash, str)):
                continue
            required.append({"kind": kind, "name": name, "xml_hash": xml_hash})
        return ClaimedJob(scan_id=scan_id, required_library_entries=required)

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

    def submit_nse_results(
        self,
        scan_id: int,
        nse_results: list[NseScriptResult],
        status: str = "success",
        error_message: str | None = None,
    ) -> None:
        """Submit NSE vulnerability scan results to the backend.

        Args:
            scan_id: The scan ID
            nse_results: List of NSE script findings
            status: Scan status (success, failed)
            error_message: Optional error message
        """
        payload: dict[str, Any] = {
            "scan_id": scan_id,
            "nse_results": [r.to_payload() for r in nse_results],
            "status": status,
            "error_message": error_message,
        }
        response = self._request(
            "POST", "/api/nse/scanner/results", json=payload, auth_required=True
        )
        response.raise_for_status()

    def post_gvm_metadata(self, entries: list[dict[str, Any]]) -> None:
        """Post a full GVM metadata snapshot to the backend."""
        payload = {"entries": entries}
        response = self._request(
            "POST",
            "/api/scanner/gvm-metadata",
            json=payload,
            auth_required=True,
        )
        response.raise_for_status()
        self._logger.info("Posted GVM metadata snapshot: %d entries", len(entries))

    def get_gvm_library_xml(self, kind: str, name: str) -> bytes:
        """Fetch a library entry's raw XML from the backend for import."""
        response = self._request(
            "GET",
            "/api/scanner/gvm-library",
            params={"kind": kind, "name": name},
            auth_required=True,
        )
        response.raise_for_status()
        return response.content

    def submit_vulnerability_results(
        self,
        scan_id: int,
        vulnerabilities: list[VulnerabilityResult],
        status: str = "success",
        error_message: str | None = None,
    ) -> None:
        """Submit GVM/Nuclei vulnerability results to the backend.

        Uses an extended timeout (120s) because large batches (1000+ findings)
        trigger bulk DB inserts and alert deduplication on the backend.
        """
        payload: dict[str, Any] = {
            "scan_id": scan_id,
            "vulnerabilities": [v.to_payload() for v in vulnerabilities],
            "status": status,
            "error_message": error_message,
        }
        response = self._request(
            "POST", "/api/scanner/vulnerability-results", json=payload,
            auth_required=True, timeout=120.0,
        )
        response.raise_for_status()

    def download_script(self, name: str) -> tuple[str, str]:
        """Download a custom NSE script from the backend.

        Args:
            name: The script name (e.g., custom_my-check)

        Returns:
            Tuple of (content, content_hash)
        """
        response = self._request(
            "GET",
            f"/api/nse/scripts/{name}/download",
            auth_required=True,
        )
        response.raise_for_status()
        payload = response.json()
        content = payload.get("content")
        content_hash = payload.get("content_hash")
        if not isinstance(content, str) or not isinstance(content_hash, str):
            raise RuntimeError("Invalid script download response")
        return content, content_hash

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
        self,
        scan_id: int,
        progress_percent: float,
        progress_message: str | None = None,
        actual_rate: float | None = None,
    ) -> None:
        """Submit progress update to the backend.

        Args:
            scan_id: The scan ID
            progress_percent: Progress percentage (0-100)
            progress_message: Optional progress message
            actual_rate: Optional actual scan rate in packets per second
        """
        payload: dict[str, Any] = {
            "scan_id": scan_id,
            "progress_percent": progress_percent,
        }
        if progress_message is not None:
            payload["progress_message"] = progress_message
        if actual_rate is not None:
            payload["actual_rate"] = actual_rate
        response = self._request("POST", "/api/scanner/progress", json=payload, auth_required=True)
        response.raise_for_status()

    def get_scan_status(self, scan_id: int) -> str | None:
        """Get the current status of a scan.

        Args:
            scan_id: The scan ID

        Returns:
            Scan status or None if not found
        """
        response = self._request("GET", f"/api/scanner/scans/{scan_id}/status", auth_required=True)
        if response.status_code == 404:
            return None
        response.raise_for_status()
        payload = response.json()
        status_value = payload.get("status")
        if not isinstance(status_value, str):
            raise RuntimeError("Invalid scan status response")
        return status_value

    def get_hostnames_for_ips(self, ips: list[str]) -> dict[str, list[str]]:
        """Bulk-read cached hostnames for the given IPs.

        Called between the port_scan phase and the nuclei phase when
        the network has ``nuclei_sni_enabled=true``. IPs without cached
        hostnames are omitted from the returned dict; the caller falls
        back to ``IP:PORT`` for those.

        Returns an empty dict on empty input, non-200 responses, or
        malformed payloads — nuclei SNI fan-out is best-effort, never
        fatal to the surrounding scan.
        """
        if not ips:
            return {}
        ip_param = ",".join(ip for ip in ips if ip)
        try:
            response = self._request(
                "GET",
                f"/api/scanner/hostnames?ips={ip_param}",
                auth_required=True,
            )
        except Exception as exc:  # pragma: no cover — transport error is non-fatal
            self._logger.warning("hostname lookup request failed: %s", exc)
            return {}
        if response.status_code != 200:
            self._logger.warning(
                "hostname lookup returned HTTP %s — falling back to IP-only targets",
                response.status_code,
            )
            return {}
        try:
            payload = response.json()
            mapping = payload.get("hostnames") or {}
        except (ValueError, AttributeError):
            return {}
        # Shape-check: dict[str, list[str]]
        result: dict[str, list[str]] = {}
        for ip, names in mapping.items():
            if not isinstance(ip, str) or not isinstance(names, list):
                continue
            valid = [n for n in names if isinstance(n, str) and n]
            if valid:
                result[ip] = valid
        return result

    def get_hostname_cache_status(
        self, ips: list[str]
    ) -> HostnameCacheStatus | None:
        """Pre-flight cache check for hostname enrichment.

        Returns fresh hostnames + expired IP set so enrichment can skip
        already-cached IPs and log why each remaining IP is queried.

        Returns ``None`` on transport errors or non-200 responses so the
        caller can fall back to full enrichment (same as before this
        pre-flight existed).
        """
        if not ips:
            return HostnameCacheStatus(fresh={}, expired_ips=frozenset())

        ip_param = ",".join(ip for ip in ips if ip)
        try:
            response = self._request(
                "GET",
                f"/api/scanner/hostnames?ips={ip_param}&include_expired=true",
                auth_required=True,
            )
        except Exception as exc:
            self._logger.warning("hostname cache status request failed: %s", exc)
            return None

        if response.status_code != 200:
            self._logger.warning(
                "hostname cache status returned HTTP %s", response.status_code
            )
            return None

        try:
            payload = response.json()
            mapping = payload.get("hostnames") or {}
            expired_raw = payload.get("expired_ips") or []
        except (ValueError, AttributeError):
            return None

        fresh: dict[str, list[str]] = {}
        for ip, names in mapping.items():
            if not isinstance(ip, str) or not isinstance(names, list):
                continue
            # Keep empty lists — they represent fresh no_results cache
            # entries (the IP was looked up recently, nothing found).
            # The scanner must skip these too to avoid wasting budget.
            fresh[ip] = [n for n in names if isinstance(n, str) and n]

        expired_ips = frozenset(
            e for e in expired_raw if isinstance(e, str) and e
        )
        return HostnameCacheStatus(fresh=fresh, expired_ips=expired_ips)

    def get_hostname_budget(self) -> dict[str, int]:
        """Pre-flight read of today's per-source daily budget remaining.

        Returns ``{source: remaining}`` for every reverse-IP source the
        backend tracks (currently hackertarget + rapiddns). Used by the
        enrichment orchestrator to skip sources whose budget has been
        exhausted before burning a request slot.

        Best-effort: a transport error or non-200 response returns
        ``{}`` so the caller falls through to "no budget info, assume
        available". Network failures here should never block a scan.
        """
        try:
            response = self._request(
                "GET", "/api/scanner/hostname-budget", auth_required=True
            )
        except Exception as exc:  # pragma: no cover — transport error is non-fatal
            self._logger.warning("hostname budget request failed: %s", exc)
            return {}
        if response.status_code != 200:
            self._logger.warning(
                "hostname budget returned HTTP %s", response.status_code
            )
            return {}
        try:
            payload = response.json()
        except ValueError:
            return {}
        budgets = payload.get("budgets") or []
        result: dict[str, int] = {}
        for entry in budgets:
            if not isinstance(entry, dict):
                continue
            source = entry.get("source")
            remaining = entry.get("remaining")
            if isinstance(source, str) and isinstance(remaining, int):
                result[source] = remaining
        return result

    def post_hostname_results(self, results: list[dict[str, Any]]) -> None:
        """Submit a batch of reverse-IP enrichment outcomes to the backend.

        ``results`` is a list of dicts shaped per
        ``HostnameLookupResultSubmission`` on the backend:
        ``{ip, source, status, hostnames, error_message}``. The backend
        upserts cache rows, post-fact-increments the per-source
        budget counter, backfills ``host.hostname`` for empty hosts,
        and pins the budget when an error message contains
        ``"api count exceeded"``.

        Empty input short-circuits without a request. Transport errors
        and non-2xx responses are logged and swallowed — enrichment is
        best-effort and must never fail the surrounding scan.
        """
        if not results:
            return
        try:
            response = self._request(
                "POST",
                "/api/scanner/hostname-results",
                json={"results": results},
                auth_required=True,
            )
        except Exception as exc:  # pragma: no cover — transport error is non-fatal
            self._logger.warning("hostname results post failed: %s", exc)
            return
        if response.status_code != 200:
            self._logger.warning(
                "hostname results returned HTTP %s: %s",
                response.status_code,
                response.text[:200],
            )
            return
        try:
            payload = response.json()
            self._logger.info(
                "hostname-results: accepted=%s rejected=%s pinned=%s",
                payload.get("accepted"),
                payload.get("rejected"),
                payload.get("budget_pinned_sources"),
            )
        except ValueError:
            pass

    def get_hostname_lookup_jobs(
        self, limit: int = 10
    ) -> list[HostnameLookupJob]:
        """Atomically claim pending manual hostname lookup jobs.

        Calls ``GET /api/scanner/hostname-lookup-jobs?limit=N``. The
        backend transitions matching ``pending`` rows to ``claimed``
        in a single transaction and returns them; this method then
        decodes the response into ``HostnameLookupJob`` instances so
        the queue poller can dispatch them per IP.

        Best-effort: a transport error or non-200 response returns an
        empty list so a flaky network or backend restart never throws
        out of the main poll loop.
        """
        try:
            response = self._request(
                "GET",
                "/api/scanner/hostname-lookup-jobs",
                params={"limit": str(limit)},
                auth_required=True,
            )
        except Exception as exc:  # pragma: no cover — non-fatal
            self._logger.warning("hostname-lookup-jobs request failed: %s", exc)
            return []
        if response.status_code != 200:
            self._logger.warning(
                "hostname-lookup-jobs returned HTTP %s", response.status_code
            )
            return []
        try:
            payload = response.json()
        except ValueError:
            return []
        jobs: list[HostnameLookupJob] = []
        for entry in payload.get("jobs", []) or []:
            if not isinstance(entry, dict):
                continue
            try:
                jobs.append(
                    HostnameLookupJob(
                        id=int(entry["id"]),
                        ip=str(entry["ip"]),
                        requested_by_user_id=(
                            int(entry["requested_by_user_id"])
                            if entry.get("requested_by_user_id") is not None
                            else None
                        ),
                    )
                )
            except (KeyError, TypeError, ValueError) as exc:
                self._logger.warning(
                    "Skipping invalid hostname-lookup-job payload: %s", exc
                )
        return jobs

    def complete_hostname_lookup_job(
        self,
        job_id: int,
        *,
        status: str = "completed",
        error: str | None = None,
    ) -> None:
        """Mark a claimed hostname lookup job as terminal.

        Calls ``POST /api/scanner/hostname-lookup-jobs/{id}/complete``
        with ``{status, error?}``. Used by the queue poller after the
        per-IP enrichment chain finishes — successful enrichments
        report ``completed``, transport errors report ``failed`` with
        a short error message (server bounds it to 500 chars).

        Best-effort: never raises. A failed ``/complete`` leaves the
        row in ``claimed`` state, which the backend's lazy stuck-claim
        sweep will recover after 1 hour.
        """
        body: dict[str, Any] = {"status": status}
        if error:
            body["error"] = error[:500]
        try:
            response = self._request(
                "POST",
                f"/api/scanner/hostname-lookup-jobs/{job_id}/complete",
                json=body,
                auth_required=True,
            )
        except Exception as exc:  # pragma: no cover — non-fatal
            self._logger.warning(
                "hostname-lookup-job %s complete failed: %s", job_id, exc
            )
            return
        if response.status_code != 200:
            self._logger.warning(
                "hostname-lookup-job %s complete returned HTTP %s",
                job_id,
                response.status_code,
            )

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
            known_hostnames=payload.get("known_hostnames") or {},
            ips_with_open_ports=payload.get("ips_with_open_ports") or [],
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
        params: dict[str, str] | None = None,
        auth_required: bool,
        timeout: float | None = None,
    ) -> httpx.Response:
        """Make an HTTP request with retries and authentication.

        Args:
            method: HTTP method
            url: URL path
            json: Optional JSON payload
            headers: Optional headers
            params: Optional query string parameters
            auth_required: Whether authentication is required
            timeout: Per-request timeout override (uses client default if None)

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
                    response = self._client.request(
                        method,
                        url,
                        json=json,
                        headers=request_headers,
                        params=params,
                        timeout=timeout,
                    )
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
