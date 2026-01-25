"""Scanner API router for authentication and communication."""

import time
from collections import defaultdict
from datetime import datetime, timezone
from threading import Lock

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.core.deps import CurrentScanner, DbSession
from app.schemas.scanner import (
    ScannerAuthRequest,
    ScannerAuthResponse,
    ScannerJobClaimResponse,
    ScannerJobListResponse,
    ScannerLogsRequest,
    ScannerLogsResponse,
    ScannerProgressRequest,
    ScannerProgressResponse,
    ScannerResultRequest,
    ScannerResultResponse,
    ScannerScanStatusResponse,
)
from app.services.scanner_auth import authenticate_scanner
from app.services.scanner_jobs import claim_job, get_pending_jobs_for_scanner, is_job_running
from app.services.scanner_logs import submit_scan_logs
from app.services.scanner_progress import update_scan_progress
from app.services.scanner_results import submit_scan_results
from app.services.scanner_status import get_scan_status

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

    # Extract scanner_version from body if provided
    scanner_version = body.scanner_version if body else None

    # Authenticate with API key
    result = await authenticate_scanner(db, x_api_key, scanner_version)

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API key",
        )

    scanner, response = result

    # Commit the last_seen_at and scanner_version update
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

    Also updates the site's last_seen_at timestamp (heartbeat).

    Requires valid scanner JWT token.
    """
    # Update last_seen_at as heartbeat
    scanner.last_seen_at = datetime.now(timezone.utc)
    await db.commit()

    jobs = await get_pending_jobs_for_scanner(db, scanner)
    return ScannerJobListResponse(jobs=jobs)


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
    Filters out excluded ports before storing.

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
