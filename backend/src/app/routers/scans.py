"""Scan detail and diff endpoints."""

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Spacer

from app.core.deps import CurrentUser, DbSession, OperatorUser, Pagination
from app.lib.export import (
    build_pdf,
    csv_response,
    export_timestamp,
    make_pdf_table,
    new_pdf_buffer,
    pdf_response,
)
from app.models.open_port import OpenPort
from app.models.scan import ScanStatus
from app.schemas.scan import (
    AllScansListResponse,
    LatestScanByNetwork,
    LatestScansByNetworkResponse,
    OpenPortResponse,
    ScanCancelResponse,
    ScanDetailResponse,
    ScanDiffResponse,
    ScanLogListResponse,
    ScanLogResponse,
    ScanResponse,
    ScanSummaryResponse,
    ScanVisibilityRequest,
    ScanWithNamesResponse,
)
from app.schemas.vulnerability import VulnerabilityListResponse, VulnerabilitySeverityLabel
from app.services import scans as scans_service
from app.services.vulnerability_results import get_vulnerabilities_by_scan

router = APIRouter(prefix="/api/scans", tags=["scans"])


@router.get("/latest-by-network", response_model=LatestScansByNetworkResponse)
async def get_latest_scans_by_network(
    user: CurrentUser,
    db: DbSession,
) -> LatestScansByNetworkResponse:
    """Get the latest completed scan for each network in a single request."""
    from app.services.networks import get_all_networks

    networks = await get_all_networks(db)
    network_ids = [n.id for n in networks]

    latest_scans_map = await scans_service.get_latest_scans_by_network(db)

    latest_scans = []
    for network_id in network_ids:
        scan_data = latest_scans_map.get(network_id)
        if scan_data:
            scan, port_count = scan_data
            latest_scans.append(
                LatestScanByNetwork(
                    network_id=network_id,
                    scan=ScanSummaryResponse(
                        id=scan.id,
                        network_id=scan.network_id,
                        scanner_id=scan.scanner_id,
                        status=scan.status.value,
                        started_at=scan.started_at,
                        completed_at=scan.completed_at,
                        cancelled_at=scan.cancelled_at,
                        cancelled_by=scan.cancelled_by,
                        error_message=scan.error_message,
                        trigger_type=scan.trigger_type.value,
                        hidden=scan.hidden,
                        progress_percent=scan.progress_percent,
                        progress_message=scan.progress_message,
                        port_count=port_count,
                    ),
                )
            )
        else:
            latest_scans.append(LatestScanByNetwork(network_id=network_id, scan=None))

    return LatestScansByNetworkResponse(latest_scans=latest_scans)


@router.get("", response_model=AllScansListResponse)
async def get_all_scans(
    user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    network_id: int | None = Query(None, ge=1),
    include_hidden: bool = Query(False),
) -> AllScansListResponse:
    """Get all scans with optional network filter."""
    scan_results = await scans_service.get_all_scans(
        db,
        network_id=network_id,
        include_hidden=include_hidden,
        offset=pagination.offset,
        limit=pagination.limit,
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
            progress_percent=scan.progress_percent,
            progress_message=scan.progress_message,
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


@router.get("/{scan_id}/vulnerabilities", response_model=VulnerabilityListResponse)
async def get_scan_vulnerabilities(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
    severity_label: VulnerabilitySeverityLabel | None = Query(None),
    ip: str | None = Query(None),
) -> VulnerabilityListResponse:
    """Get vulnerability results for a scan with optional filters."""
    return await get_vulnerabilities_by_scan(db, scan_id, severity_label, ip)


@router.get("/{scan_id}/diff", response_model=ScanDiffResponse)
async def get_scan_diff(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
    compare_to: int | None = Query(None, ge=1),
) -> ScanDiffResponse:
    """Get diff between two scans.

    If compare_to is not provided, automatically compares against the previous
    completed scan for the same network.
    """
    scan = await scans_service.get_scan_with_ports(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    if compare_to is None:
        # Auto-find the previous completed scan for the same network
        compare_to = await scans_service.get_previous_scan_id(db, scan.network_id, scan_id)
        if compare_to is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No previous scan found to compare against",
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
    pagination: Pagination,
    scan_id: int,
) -> ScanLogListResponse:
    """Get paginated scan logs for a scan."""
    scan = await scans_service.get_scan_by_id(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    logs = await scans_service.get_scan_logs(
        db, scan_id, offset=pagination.offset, limit=pagination.limit
    )
    return ScanLogListResponse(logs=[ScanLogResponse.model_validate(log) for log in logs])


@router.post("/{scan_id}/cancel", response_model=ScanCancelResponse)
async def cancel_scan(
    admin: OperatorUser,
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
    admin: OperatorUser,
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


@router.get("/{scan_id}/export/csv")
async def export_scan_csv(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
) -> StreamingResponse:
    """Export scan results as CSV."""
    scan = await scans_service.get_scan_with_ports(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    headers = ["IP", "Port", "Protocol", "Service", "First Seen", "Last Seen"]
    rows = [
        [
            port.ip,
            port.port,
            port.protocol,
            port.service_guess or "",
            port.first_seen_at.isoformat() if port.first_seen_at else "",
            port.last_seen_at.isoformat() if port.last_seen_at else "",
        ]
        for port in scan.open_ports
    ]
    return csv_response(rows, headers, f"scan_{scan_id}_{export_timestamp()}.csv")


@router.get("/{scan_id}/export/pdf")
async def export_scan_pdf(
    user: CurrentUser,
    db: DbSession,
    scan_id: int,
) -> StreamingResponse:
    """Export scan results as PDF."""
    scan = await scans_service.get_scan_with_ports(db, scan_id)
    if scan is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scan not found",
        )

    scan_date = scan.started_at.strftime("%Y-%m-%d %H:%M:%S UTC") if scan.started_at else "N/A"
    completed_date = (
        scan.completed_at.strftime("%Y-%m-%d %H:%M:%S UTC") if scan.completed_at else "N/A"
    )
    buffer, doc = new_pdf_buffer()
    with build_pdf(f"Scan Report - ID: {scan.id}") as (elements, styles):
        elements.append(
            Paragraph(
                f"<b>Network:</b> {scan.network.name}<br/>"
                f"<b>Scan Date:</b> {scan_date}<br/>"
                f"<b>Status:</b> {scan.status.value}<br/>"
                f"<b>Completed:</b> {completed_date}",
                styles["Normal"],
            )
        )
        elements.append(Spacer(1, 0.3 * inch))
        elements.append(
            Paragraph(
                f"<b>Summary Statistics</b><br/>Total open ports found: {len(scan.open_ports)}",
                styles["Heading2"],
            )
        )
        elements.append(Spacer(1, 0.2 * inch))

        table_rows = [
            [
                port.ip,
                str(port.port),
                port.protocol,
                port.service_guess or "",
                port.first_seen_at.strftime("%Y-%m-%d %H:%M") if port.first_seen_at else "",
                port.last_seen_at.strftime("%Y-%m-%d %H:%M") if port.last_seen_at else "",
            ]
            for port in scan.open_ports
        ]
        col_widths = [1.2 * inch, 0.7 * inch, 0.8 * inch, 1.2 * inch, 1.3 * inch, 1.3 * inch]
        elements.append(
            make_pdf_table(
                ["IP", "Port", "Protocol", "Service", "First Seen", "Last Seen"],
                table_rows,
                col_widths,
                "No open ports found in this scan.",
            )
        )

    doc.build(elements)
    return pdf_response(buffer, f"scan_{scan_id}_{export_timestamp()}.pdf")


@router.delete("/{scan_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scan(
    admin: OperatorUser,
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
