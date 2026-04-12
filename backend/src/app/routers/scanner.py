"""Scanner API router for authentication and communication."""

import time
from collections import defaultdict
from threading import Lock

from fastapi import APIRouter, Header, HTTPException, Request, status
from fastapi.responses import Response

from app.core.deps import CurrentScanner, DbSession
from app.schemas.gvm_library import (
    GvmMetadataSnapshotRequest,
    GvmMetadataSnapshotResponse,
)
from app.schemas.hostname_lookup import (
    HostnameLookupBudgetEntry,
    HostnameLookupBudgetResponse,
    HostnameLookupQueueCompleteRequest,
    HostnameLookupQueueEntryResponse,
    HostnameLookupQueueListResponse,
    HostnameLookupResultsRequest,
    HostnameLookupResultsResponse,
)
from app.schemas.scanner import (
    HostDiscoveryJobClaimResponse,
    HostDiscoveryJobListResponse,
    HostDiscoveryJobResponse,
    HostDiscoveryResultRequest,
    HostDiscoveryResultResponse,
    ScannerAuthRequest,
    ScannerAuthResponse,
    ScannerHostnamesResponse,
    ScannerJobClaimResponse,
    ScannerJobListResponse,
    ScannerLogsRequest,
    ScannerLogsResponse,
    ScannerProgressRequest,
    ScannerProgressResponse,
    ScannerResultRequest,
    ScannerResultResponse,
    ScannerScanStatusResponse,
    has_gvm_capability,
)
from app.schemas.vulnerability import (
    VulnerabilityResultRequest,
    VulnerabilityResultResponse,
)
from app.services import gvm_library as gvm_library_service
from app.services import gvm_metadata as gvm_metadata_service
from app.services import host_discovery as host_discovery_service
from app.services import hosts as hosts_service
from app.services.hostname_lookup import (
    apply_scanner_hostname_results,
    claim_pending_lookup_jobs,
    get_hostnames_for_ips,
    get_scanner_budget_snapshot,
    mark_queue_entry_completed,
)
from app.services.scanner_auth import authenticate_scanner
from app.services.scanner_jobs import claim_job, get_pending_jobs_for_scanner, is_job_running
from app.services.scanner_logs import submit_scan_logs
from app.services.scanner_progress import update_scan_progress
from app.services.scanner_results import submit_scan_results
from app.services.scanner_status import get_scan_status
from app.services.vulnerability_results import submit_vulnerability_results

router = APIRouter(prefix="/api/scanner", tags=["scanner"])

# Rate limiting configuration
RATE_LIMIT_MAX_ATTEMPTS = 10
RATE_LIMIT_WINDOW_SECONDS = 60

# In-memory rate limiting store: {ip: [(timestamp, ...], ...}
# Using a simple sliding window approach
_rate_limit_store: dict[str, list[float]] = defaultdict(list)
_rate_limit_lock = Lock()


def _get_client_ip(request: Request) -> str:
    """Extract client IP from request, handling proxies."""
    # Check X-Forwarded-For header for proxied requests
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        # Take the first IP in the chain (original client)
        return forwarded_for.split(",")[0].strip()

    # Check X-Real-IP header
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # Fall back to direct client IP
    client = request.client
    if client:
        return client.host

    return "unknown"


def _check_rate_limit(client_ip: str) -> bool:
    """
    Check if client IP is within rate limit.

    Returns True if request is allowed, False if rate limited.
    """
    current_time = time.time()
    window_start = current_time - RATE_LIMIT_WINDOW_SECONDS

    with _rate_limit_lock:
        # Clean up old entries outside the window
        _rate_limit_store[client_ip] = [
            ts for ts in _rate_limit_store[client_ip] if ts > window_start
        ]

        # Check if under limit
        if len(_rate_limit_store[client_ip]) >= RATE_LIMIT_MAX_ATTEMPTS:
            return False

        # Record this attempt
        _rate_limit_store[client_ip].append(current_time)
        return True


@router.post("/auth", response_model=ScannerAuthResponse)
async def scanner_authenticate(
    request: Request,
    db: DbSession,
    x_api_key: str = Header(..., description="Scanner API key"),
    body: ScannerAuthRequest | None = None,
) -> ScannerAuthResponse:
    """
    Authenticate a scanner using its API key.

    Returns a short-lived JWT token (15 min expiration) with scanner scope.
    Rate limited to 10 attempts per minute per IP address.

    Optionally accepts a request body with scanner_version to track the
    scanner's version.
    """
    # Check rate limit
    client_ip = _get_client_ip(request)
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 10 attempts per minute.",
        )

    # Extract scanner_version + scanner_kind from body if provided
    scanner_version = body.scanner_version if body else None
    scanner_kind = body.scanner_kind if body else None

    # Authenticate with API key
    result = await authenticate_scanner(
        db, x_api_key, scanner_version, scanner_kind
    )

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    scanner, response = result

    # Commit the last_seen_at, scanner_version and kind updates
    await db.commit()

    return response


@router.get("/jobs", response_model=ScannerJobListResponse)
async def get_scanner_jobs(
    db: DbSession,
    scanner: CurrentScanner,
) -> ScannerJobListResponse:
    """
    Get pending scan jobs for this scanner's site.

    Returns networks assigned to this site that need scanning based on:
    - Manual scan triggers
    - Scheduled scan triggers

    Includes a ``gvm_refresh`` flag when an admin has requested an
    on-demand metadata snapshot from this GVM scanner. The scanner's
    ``last_seen_at`` heartbeat is updated globally in the
    ``CurrentScanner`` dependency, not in this handler.

    Requires valid scanner JWT token.
    """
    jobs = await get_pending_jobs_for_scanner(db, scanner)
    gvm_refresh = has_gvm_capability(scanner.kind) and scanner.gvm_refresh_requested
    return ScannerJobListResponse(jobs=jobs, gvm_refresh=gvm_refresh)


@router.post("/jobs/{network_id}/claim", response_model=ScannerJobClaimResponse)
async def claim_scanner_job(
    network_id: int,
    db: DbSession,
    scanner: CurrentScanner,
) -> ScannerJobClaimResponse:
    """
    Claim a scan job for a network.

    Marks the job as in-progress and creates/updates the scan record.

    Returns 404 if network doesn't exist or isn't assigned to this site.
    Returns 409 Conflict if job is already claimed/running.

    Requires valid scanner JWT token.
    """
    # Check if there's already a running scan
    if await is_job_running(db, network_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Job already claimed or running",
        )

    result = await claim_job(db, scanner, network_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending job found for this network or network not assigned to this site",
        )

    await db.commit()
    return result


@router.post("/results", response_model=ScannerResultResponse)
async def submit_scanner_results(
    request: ScannerResultRequest,
    db: DbSession,
    scanner: CurrentScanner,
) -> ScannerResultResponse:
    """
    Submit scan results from a scanner.

    Accepts scan_id, status (success/failed), open_ports list, and optional error_message.

    Each open_port includes: ip, port, protocol, ttl, banner, mac_address, mac_vendor.

    Updates scan record with status and completed_at timestamp.
    Creates open_ports records, updating first_seen_at (if new) and last_seen_at.

    Returns 404 if scan doesn't exist or is not assigned to this scanner's site.
    Returns 400 if scan is not in RUNNING or CANCELLED status.

    Requires valid scanner JWT token.
    """
    result = await submit_scan_results(db, scanner, request)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found, not assigned to this site, or not in running status",
        )

    await db.commit()
    return result


@router.post("/logs", response_model=ScannerLogsResponse)
async def submit_scanner_logs(
    request: ScannerLogsRequest,
    db: DbSession,
    scanner: CurrentScanner,
) -> ScannerLogsResponse:
    """
    Submit scan logs from a scanner.

    Accepts scan_id and logs array. Each log entry has: timestamp,
    level (info/warning/error), message.

    Stores logs in scan_logs table.

    Returns 404 if scan doesn't exist or is not assigned to this scanner's site.

    Requires valid scanner JWT token.
    """
    result = await submit_scan_logs(db, scanner, request)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found or not assigned to this site",
        )

    await db.commit()
    return result


@router.post("/progress", response_model=ScannerProgressResponse)
async def submit_scanner_progress(
    request: ScannerProgressRequest,
    db: DbSession,
    scanner: CurrentScanner,
) -> ScannerProgressResponse:
    """
    Update scan progress from a scanner.

    Accepts scan_id, progress_percent (0-100), and optional progress_message.

    Updates the scan record with new progress values.

    Returns 404 if scan doesn't exist, is not assigned to this scanner's site,
    or is not in RUNNING status.

    Requires valid scanner JWT token.
    """
    result = await update_scan_progress(db, scanner, request)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found, not assigned to this site, or not in running status",
        )

    await db.commit()
    return result


@router.get("/scans/{scan_id}/status", response_model=ScannerScanStatusResponse)
async def get_scanner_scan_status(
    scan_id: int,
    db: DbSession,
    scanner: CurrentScanner,
) -> ScannerScanStatusResponse:
    """
    Get current scan status for the scanner.

    Returns 404 if scan doesn't exist or is not assigned to this site.

    Requires valid scanner JWT token.
    """
    result = await get_scan_status(db, scanner, scan_id)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found or not assigned to this site",
        )

    return result


@router.get("/hostnames", response_model=ScannerHostnamesResponse)
async def get_scanner_hostnames(
    db: DbSession,
    scanner: CurrentScanner,  # noqa: ARG001 — DI gate for scanner JWT
    ips: str = "",
) -> ScannerHostnamesResponse:
    """Bulk-return cached hostnames for the given IPs.

    Called by the scanner between the port_scan phase and the nuclei
    phase when the network has ``nuclei_sni_enabled=true``. The
    scanner hands in the comma-separated list of IPs that had open
    web ports; the backend replies with the hostname map from
    ``hostname_lookup_cache`` so nuclei can fan out per-vhost via SNI.

    IPs without fresh cached hostnames are silently omitted from the
    response dict; the scanner falls back to ``IP:PORT`` for those.
    """
    ip_list = [ip.strip() for ip in ips.split(",") if ip.strip()]
    if not ip_list:
        return ScannerHostnamesResponse(hostnames={})

    # Defensive cap — a 1000-IP query string would be suspicious and
    # we don't want to build an unbounded IN-clause. Scanners should
    # never need more than the hosts discovered in a single scan.
    if len(ip_list) > 500:
        ip_list = ip_list[:500]

    mapping = await get_hostnames_for_ips(db, ip_list)
    return ScannerHostnamesResponse(hostnames=mapping)


@router.get(
    "/hostname-budget",
    response_model=HostnameLookupBudgetResponse,
)
async def get_hostname_budget(
    db: DbSession,
    scanner: CurrentScanner,  # noqa: ARG001 — DI gate for scanner JWT
) -> HostnameLookupBudgetResponse:
    """Return today's per-source daily budget for the scanner pre-flight.

    The scanner consults this before calling HackerTarget / RapidDNS so
    it can skip a source whose ``remaining`` is zero. Limits are
    sourced from the backend's settings during the 2.3.0 transition;
    after Commit 10 deletes the legacy filler, the source-of-truth for
    HT API key + RapidDNS toggle moves scanner-side and this endpoint
    falls back to anonymous defaults.
    """
    snapshot = await get_scanner_budget_snapshot(db)
    return HostnameLookupBudgetResponse(
        budgets=[
            HostnameLookupBudgetEntry(
                source=entry.source,
                used=entry.used,
                limit=entry.limit,
                remaining=entry.remaining,
            )
            for entry in snapshot
        ]
    )


@router.post(
    "/hostname-results",
    response_model=HostnameLookupResultsResponse,
)
async def submit_hostname_results(
    request: HostnameLookupResultsRequest,
    db: DbSession,
    scanner: CurrentScanner,  # noqa: ARG001 — DI gate for scanner JWT
) -> HostnameLookupResultsResponse:
    """Persist a batch of scanner-side enrichment outcomes.

    Each entry is processed independently:

    - The per-source daily budget counter is incremented post-fact
      (the scanner has already called the upstream API).
    - The cache row is upserted via the standard service path with
      the per-status TTL (30d / 7d / 3d).
    - On ``success`` with non-empty hostnames, the host's
      ``hostname`` column is backfilled to the first vhost iff the
      host exists and does not already have a hostname (existing
      manual / discovery hostnames are preserved).
    - If a result carries the well-known ``"api count exceeded"``
      error marker, today's budget for that source is pinned so the
      scanner stops calling for the rest of the day.

    Unknown source names land in ``rejected`` and are skipped — the
    backend never accepts data from sources outside the configured
    allow-list (HackerTarget, RapidDNS for now).
    """
    outcome = await apply_scanner_hostname_results(
        db,
        results=[
            (
                entry.ip,
                entry.source,
                entry.status,
                entry.hostnames,
                entry.error_message,
            )
            for entry in request.results
        ],
    )
    await db.commit()
    return HostnameLookupResultsResponse(
        accepted=outcome.accepted,
        rejected=outcome.rejected,
        cache_rows_written=outcome.cache_rows_written,
        hosts_synced=outcome.hosts_synced,
        budget_pinned_sources=outcome.budget_pinned_sources,
    )


@router.get(
    "/hostname-lookup-jobs",
    response_model=HostnameLookupQueueListResponse,
)
async def claim_hostname_lookup_jobs(
    db: DbSession,
    scanner: CurrentScanner,  # noqa: ARG001 — DI gate for scanner JWT
    limit: int = 10,
) -> HostnameLookupQueueListResponse:
    """Claim pending manual hostname lookup jobs for this scanner.

    Atomically transitions up to ``limit`` rows from ``pending`` to
    ``claimed`` and returns them. Also runs the lazy stuck-claim sweep
    (>1h ``claimed`` → ``pending``) and the terminal-row GC (>7d
    ``completed`` / ``failed`` → deleted) so the queue table stays
    bounded without a scheduled job.

    Scanner is expected to call this every poll cycle alongside the
    existing scan-job poll. Each claimed entry must be terminated via
    ``POST /hostname-lookup-jobs/{id}/complete`` once the enrichment
    chain finishes.
    """
    safe_limit = max(1, min(limit, 50))
    entries = await claim_pending_lookup_jobs(db, limit=safe_limit)
    await db.commit()
    return HostnameLookupQueueListResponse(
        jobs=[
            HostnameLookupQueueEntryResponse.model_validate(entry)
            for entry in entries
        ]
    )


@router.post(
    "/hostname-lookup-jobs/{job_id}/complete",
    response_model=HostnameLookupQueueEntryResponse,
)
async def complete_hostname_lookup_job(
    job_id: int,
    request: HostnameLookupQueueCompleteRequest,
    db: DbSession,
    scanner: CurrentScanner,  # noqa: ARG001 — DI gate for scanner JWT
) -> HostnameLookupQueueEntryResponse:
    """Mark a claimed hostname lookup job as terminal.

    Called by the scanner after running the enrichment chain against
    the queued IP and posting the results to the cache. Accepts
    ``status='completed'`` for success / no_results outcomes and
    ``status='failed'`` for transport / parser failures. The error
    field is bounded to 500 chars and only stored when status='failed'.

    Returns 404 if no job with that id exists.
    """
    entry = await mark_queue_entry_completed(
        db,
        job_id,
        status=request.status,
        error=request.error,
    )
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Hostname lookup job {job_id} not found",
        )
    await db.commit()
    return HostnameLookupQueueEntryResponse.model_validate(entry)


# --- Host Discovery Endpoints ---


@router.get("/host-discovery-jobs", response_model=HostDiscoveryJobListResponse)
async def get_host_discovery_jobs(
    db: DbSession,
    scanner: CurrentScanner,
) -> HostDiscoveryJobListResponse:
    """
    Get pending host discovery jobs for this scanner.

    Returns host discovery scans with status 'planned' for this scanner.

    Requires valid scanner JWT token.
    """
    scans = await host_discovery_service.get_pending_host_discovery_jobs(db, scanner.id)

    jobs = [
        HostDiscoveryJobResponse(
            scan_id=scan.id,
            network_id=scan.network_id,
            cidr=scan.network.cidr,
            is_ipv6=scan.network.is_ipv6,
        )
        for scan in scans
    ]

    return HostDiscoveryJobListResponse(jobs=jobs)


@router.post(
    "/host-discovery-jobs/{scan_id}/claim",
    response_model=HostDiscoveryJobClaimResponse,
)
async def claim_host_discovery_job(
    scan_id: int,
    db: DbSession,
    scanner: CurrentScanner,
) -> HostDiscoveryJobClaimResponse:
    """
    Claim a host discovery job.

    Marks the job as in-progress and records the start time.

    Returns 404 if scan doesn't exist or isn't assigned to this scanner.
    Returns 409 Conflict if job is already claimed/running.

    Requires valid scanner JWT token.
    """
    scan = await host_discovery_service.claim_host_discovery_job(db, scan_id, scanner.id)

    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host discovery job not found or not assigned to this scanner",
        )

    known_hostnames = await host_discovery_service.get_known_hostnames(db, scan.network_id)
    ips_with_open_ports = await host_discovery_service.get_ips_with_open_ports(db, scan.network_id)

    await db.commit()
    return HostDiscoveryJobClaimResponse(
        scan_id=scan.id,
        network_id=scan.network_id,
        cidr=scan.network.cidr,
        is_ipv6=scan.network.is_ipv6,
        known_hostnames=known_hostnames,
        ips_with_open_ports=ips_with_open_ports,
    )


@router.post("/host-discovery-results", response_model=HostDiscoveryResultResponse)
async def submit_host_discovery_results(
    request: HostDiscoveryResultRequest,
    db: DbSession,
    scanner: CurrentScanner,
) -> HostDiscoveryResultResponse:
    """
    Submit host discovery results from a scanner.

    Accepts scan_id, status (success/failed), hosts list, and optional error_message.

    Each host includes: ip, hostname, is_pingable, mac_address, mac_vendor.

    Updates scan record with status and completed_at timestamp.
    Creates/updates host records.

    Returns 404 if scan doesn't exist or is not assigned to this scanner.

    Requires valid scanner JWT token.
    """
    # Get the scan to verify ownership and status
    scan = await host_discovery_service.get_host_discovery_scan_by_id(db, request.scan_id)
    if scan is None or scan.scanner_id != scanner.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host discovery scan not found or not assigned to this scanner",
        )

    if request.status == "failed":
        await host_discovery_service.fail_host_discovery_scan(
            db, request.scan_id, request.error_message or "Unknown error"
        )
        await db.commit()
        return HostDiscoveryResultResponse(
            scan_id=request.scan_id,
            status="failed",
            hosts_recorded=0,
        )

    # Process host results
    hosts_recorded = 0
    for host_data in request.hosts:
        await hosts_service.upsert_host(
            db,
            ip=host_data.ip,
            hostname=host_data.hostname,
            is_pingable=host_data.is_pingable,
            mac_address=host_data.mac_address,
            mac_vendor=host_data.mac_vendor,
            network_id=scan.network_id,
        )
        hosts_recorded += 1

    # Mark scan as completed
    await host_discovery_service.complete_host_discovery_scan(
        db, request.scan_id, hosts_recorded
    )

    await db.commit()
    return HostDiscoveryResultResponse(
        scan_id=request.scan_id,
        status="success",
        hosts_recorded=hosts_recorded,
    )


# --- GVM Metadata + Library Endpoints (scanner-facing) ---------------


@router.post("/gvm-metadata", response_model=GvmMetadataSnapshotResponse)
async def ingest_gvm_metadata_snapshot(
    request: GvmMetadataSnapshotRequest,
    db: DbSession,
    scanner: CurrentScanner,
) -> GvmMetadataSnapshotResponse:
    """Ingest a full GVM metadata snapshot posted by the scanner agent.

    Called on scanner startup, every ~5 min while idle, and when the scanner
    observes the ``gvm_refresh`` flag in the ``/jobs`` response. Replaces
    all existing mirror rows for this scanner in a single transaction and
    clears the refresh flag.
    """
    if not has_gvm_capability(scanner.kind):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="gvm-metadata can only be posted by GVM or unified scanners",
        )

    count = await gvm_metadata_service.ingest_snapshot(db, scanner, request.entries)
    await db.commit()
    return GvmMetadataSnapshotResponse(
        scanner_id=scanner.id, entries_stored=count
    )


@router.get("/gvm-library")
async def fetch_gvm_library_xml(
    db: DbSession,
    scanner: CurrentScanner,
    kind: str,
    name: str,
) -> Response:
    """Fetch a library entry's raw XML for import into the scanner's GVM.

    Called by the scanner agent during auto-push (Flow C) when a claimed
    scan references a library entry that is missing or drifted.
    """
    if not has_gvm_capability(scanner.kind):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="gvm-library is only available to GVM or unified scanners",
        )

    if kind not in {"scan_config", "port_list"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="kind must be 'scan_config' or 'port_list'",
        )

    entry = await gvm_library_service.get_entry_by_name(
        db,
        kind,  # type: ignore[arg-type]
        name,
    )
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Library entry not found: kind={kind} name={name!r}",
        )

    return Response(
        content=entry.xml_blob.encode("utf-8"),
        media_type="application/xml",
        headers={"X-OPM-XML-Hash": entry.xml_hash},
    )


@router.post("/vulnerability-results", response_model=VulnerabilityResultResponse)
async def submit_scanner_vulnerability_results(
    request: VulnerabilityResultRequest,
    db: DbSession,
    scanner: CurrentScanner,
) -> VulnerabilityResultResponse:
    """Submit vulnerability results from a GVM scanner.

    Accepts scan_id, status, vulnerabilities list, and optional error_message.

    Each vulnerability includes: ip, port, protocol, oid, name, description,
    severity, severity_label, cvss_base_vector, cve_ids, solution,
    solution_type, qod.

    Requires valid scanner JWT token.
    """
    result = await submit_vulnerability_results(db, scanner, request)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found, not assigned to this scanner, or not in running status",
        )

    await db.commit()
    return result
