"""SSH security scan result endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.ssh import (
    SSHHostHistoryEntry,
    SSHHostHistoryResponse,
    SSHHostListResponse,
    SSHHostSummary,
    SSHScanResultListResponse,
    SSHScanResultResponse,
)
from app.services import scans as scans_service
from app.services import ssh_results as ssh_service

router = APIRouter(prefix="/api", tags=["ssh"])


@router.get("/scans/{scan_id}/ssh", response_model=SSHScanResultListResponse)
async def get_scan_ssh_results(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
) -> SSHScanResultListResponse:
    """Get SSH security scan results for a specific scan."""
    # Verify scan exists
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    ssh_results = await ssh_service.get_ssh_results_for_scan(db, scan_id)
    return SSHScanResultListResponse(
        ssh_results=[SSHScanResultResponse.model_validate(r) for r in ssh_results]
    )


@router.get("/ssh/hosts", response_model=SSHHostListResponse)
async def list_ssh_hosts(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1, description="Filter by network ID"),
    password_enabled: bool | None = Query(
        None, description="Filter by password auth status"
    ),
    keyboard_interactive_enabled: bool | None = Query(
        None, description="Filter by keyboard-interactive auth status"
    ),
    ssh_version: str | None = Query(None, description="Filter by SSH version (partial match)"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Number of results (max 200)"),
) -> SSHHostListResponse:
    """
    List all hosts with SSH data, showing the latest scan result for each host/port.

    Supports filtering by network, authentication methods, and SSH version.
    Returns paginated results with security status indicators.
    """
    hosts, total = await ssh_service.get_ssh_hosts(
        db,
        network_id=network_id,
        password_enabled=password_enabled,
        keyboard_interactive_enabled=keyboard_interactive_enabled,
        ssh_version=ssh_version,
        offset=offset,
        limit=limit,
    )

    return SSHHostListResponse(
        hosts=[SSHHostSummary(**h) for h in hosts],
        total=total,
    )


@router.get("/ssh/hosts/{host_ip}", response_model=SSHHostHistoryResponse)
async def get_ssh_host_history(
    user: CurrentUser,
    db: DbSession,
    host_ip: str,
    port: int = Query(22, ge=1, le=65535, description="SSH port number"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    limit: int = Query(50, ge=1, le=200, description="Number of results (max 200)"),
) -> SSHHostHistoryResponse:
    """
    Get SSH scan history for a specific host/port combination.

    Returns historical SSH scan results ordered by most recent first,
    allowing tracking of configuration changes over time.
    """
    history, total = await ssh_service.get_ssh_host_history(
        db,
        host_ip=host_ip,
        port=port,
        offset=offset,
        limit=limit,
    )

    if total == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No SSH scan results found for host {host_ip}:{port}",
        )

    return SSHHostHistoryResponse(
        host_ip=host_ip,
        port=port,
        history=[SSHHostHistoryEntry(**h) for h in history],
        total=total,
    )
