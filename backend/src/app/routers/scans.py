"""Scan detail and diff endpoints."""

import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)

    # Write headers
    writer.writerow(["IP", "Port", "Protocol", "Service", "First Seen", "Last Seen"])

    # Write data rows
    for port in scan.open_ports:
        writer.writerow([
            port.ip,
            port.port,
            port.protocol,
            port.service_guess or "",
            port.first_seen_at.isoformat() if port.first_seen_at else "",
            port.last_seen_at.isoformat() if port.last_seen_at else "",
        ])

    # Get CSV content
    csv_content = output.getvalue()
    output.close()

    # Generate filename with scan ID and timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"scan_{scan_id}_{timestamp}.csv"

    # Return as streaming response
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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

    # Create PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements: list[Flowable] = []
    styles = getSampleStyleSheet()

    # Add title
    title = Paragraph(f"<b>Scan Report - ID: {scan.id}</b>", styles["Title"])
    elements.append(title)
    elements.append(Spacer(1, 0.2 * inch))

    # Add scan metadata
    scan_date = (
        scan.started_at.strftime('%Y-%m-%d %H:%M:%S UTC') if scan.started_at else 'N/A'
    )
    completed_date = (
        scan.completed_at.strftime('%Y-%m-%d %H:%M:%S UTC') if scan.completed_at else 'N/A'
    )
    metadata_text = f"""
    <b>Network:</b> {scan.network.name}<br/>
    <b>Scan Date:</b> {scan_date}<br/>
    <b>Status:</b> {scan.status.value}<br/>
    <b>Completed:</b> {completed_date}
    """
    metadata = Paragraph(metadata_text, styles["Normal"])
    elements.append(metadata)
    elements.append(Spacer(1, 0.3 * inch))

    # Add summary statistics
    total_ports = len(scan.open_ports)
    summary_text = f"<b>Summary Statistics</b><br/>Total open ports found: {total_ports}"
    summary = Paragraph(summary_text, styles["Heading2"])
    elements.append(summary)
    elements.append(Spacer(1, 0.2 * inch))

    # Add detailed table of open ports
    if scan.open_ports:
        table_data = [["IP", "Port", "Protocol", "Service", "First Seen", "Last Seen"]]
        for port in scan.open_ports:
            table_data.append([
                port.ip,
                str(port.port),
                port.protocol,
                port.service_guess or "",
                port.first_seen_at.strftime('%Y-%m-%d %H:%M') if port.first_seen_at else "",
                port.last_seen_at.strftime('%Y-%m-%d %H:%M') if port.last_seen_at else "",
            ])

        col_widths = [1.2 * inch, 0.7 * inch, 0.8 * inch, 1.2 * inch, 1.3 * inch, 1.3 * inch]
        table = Table(table_data, colWidths=col_widths)
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
            ('GRID', (0, 0), (-1, -1), 1, colors.black),
            ('FONTSIZE', (0, 1), (-1, -1), 8),
        ]))
        elements.append(table)
    else:
        no_ports = Paragraph("No open ports found in this scan.", styles["Normal"])
        elements.append(no_ports)

    # Build PDF
    doc.build(elements)
    pdf_content = buffer.getvalue()
    buffer.close()

    # Generate filename with scan ID and timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"scan_{scan_id}_{timestamp}.pdf"

    # Return as streaming response
    return StreamingResponse(
        iter([pdf_content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


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
