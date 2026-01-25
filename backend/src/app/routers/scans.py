"""Scan detail and diff endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.open_port import OpenPort
from app.models.scan import ScanStatus
from app.schemas.scan import (
    AllScansListResponse,
    OpenPortResponse,
    ScanCancelResponse,
    ScanDetailResponse,
    ScanDiffResponse,
    ScanLogListResponse,
    ScanLogResponse,
    ScanResponse,
    ScanVisibilityRequest,
    ScanWithNamesResponse,
)
from app.services import scans as scans_service

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("", response_model=AllScansListResponse)
async def get_all_scans(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    include_hidden: bool = Query(False),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AllScansListResponse:
    """Get all scans with optional network filter."""
    scan_results = await scans_service.get_all_scans(
        db,
        network_id=network_id,
        include_hidden=include_hidden,
        offset=offset,
        limit=limit,
    )

    scans = [
        ScanWithNamesResponse(
            id=scan.id,
            network_id=scan.network_id,
            network_name=scan.network.name,
            scanner_id=scan.scanner_id,
            scanner_name=scan.scanner.name,
            status=scan.status.value,
            started_at=scan.started_at,
            completed_at=scan.completed_at,
            cancelled_at=scan.cancelled_at,
            cancelled_by=scan.cancelled_by,
            cancelled_by_email=scan.cancelled_by_email,
            error_message=scan.error_message,
            trigger_type=scan.trigger_type.value,
            port_count=port_count,
            hidden=scan.hidden,
        )
        for scan, port_count in scan_results
    ]

    return AllScansListResponse(scans=scans)


def _build_port_map(ports: list[OpenPort]) -> dict[tuple[str, int, str], OpenPort]:
    """Build a unique map of ports keyed by (ip, port, protocol)."""
    port_map: dict[tuple[str, int, str], OpenPort] = {}
    for port in ports:
        key = (port.ip, port.port, port.protocol)
        if key not in port_map:
            port_map[key] = port
    return port_map


@router.get("/{scan_id}", response_model=ScanDetailResponse)
async def get_scan_detail(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
) -> ScanDetailResponse:
    """Get scan details with all open ports."""
    scan = await scans_service.get_scan_with_ports(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    return ScanDetailResponse.model_validate(scan)


@router.get("/{scan_id}/diff", response_model=ScanDiffResponse)
async def get_scan_diff(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
    compare_to: int = Query(..., ge=1),
) -> ScanDiffResponse:
    """Get diff between two scans."""
    scan = await scans_service.get_scan_with_ports(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    compare_scan = await scans_service.get_scan_with_ports(db, compare_to)
    if compare_scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Compare scan not found",
        )

    if scan.network_id != compare_scan.network_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scans must belong to the same network",
        )

    scan_ports = _build_port_map(scan.open_ports)
    compare_ports = _build_port_map(compare_scan.open_ports)

    scan_keys = set(scan_ports.keys())
    compare_keys = set(compare_ports.keys())

    added_keys = sorted(scan_keys - compare_keys)
    removed_keys = sorted(compare_keys - scan_keys)
    unchanged_keys = sorted(scan_keys & compare_keys)

    added_ports = [OpenPortResponse.model_validate(scan_ports[key]) for key in added_keys]
    removed_ports = [OpenPortResponse.model_validate(compare_ports[key]) for key in removed_keys]
    unchanged_ports = [OpenPortResponse.model_validate(scan_ports[key]) for key in unchanged_keys]

    return ScanDiffResponse(
        scan_id=scan.id,
        compare_to_id=compare_scan.id,
        added_ports=added_ports,
        removed_ports=removed_ports,
        unchanged_ports=unchanged_ports,
    )


@router.get("/{scan_id}/logs", response_model=ScanLogListResponse)
async def get_scan_logs(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> ScanLogListResponse:
    """Get paginated scan logs for a scan."""
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    logs = await scans_service.get_scan_logs(db, scan_id, offset=offset, limit=limit)
    return ScanLogListResponse(logs=[ScanLogResponse.model_validate(log) for log in logs])


@router.post("/{scan_id}/cancel", response_model=ScanCancelResponse)
async def cancel_scan(
    admin: AdminUser,
    db: DbSession,
    scan_id: int,
) -> ScanCancelResponse:
    """Cancel a running scan (admin only)."""
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    if scan.status != ScanStatus.RUNNING:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Scan is not running",
        )

    scan = await scans_service.cancel_scan(db, scan, admin.id)
    await db.commit()

    if scan.cancelled_at is None or scan.cancelled_by is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Scan cancellation failed",
        )

    return ScanCancelResponse(
        scan_id=scan.id,
        cancelled_at=scan.cancelled_at,
        cancelled_by=scan.cancelled_by,
    )


@router.patch("/{scan_id}/visibility", response_model=ScanResponse)
async def update_scan_visibility(
    admin: AdminUser,
    db: DbSession,
    scan_id: int,
    request: ScanVisibilityRequest,
) -> ScanResponse:
    """Show or hide a scan from the listing."""
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    scan = await scans_service.set_scan_hidden(db, scan, request.hidden)
    await db.commit()

    return ScanResponse.model_validate(scan)


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    admin: AdminUser,
    db: DbSession,
    scan_id: int,
) -> None:
    """Delete a scan and all related data."""
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    await scans_service.delete_scan(db, scan)
    await db.commit()
