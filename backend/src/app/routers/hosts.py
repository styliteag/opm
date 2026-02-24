"""Hosts API endpoint."""

import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO
from ipaddress import ip_address, ip_network

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.schemas.host import (
    BulkDeleteHostsRequest,
    BulkDeleteHostsResponse,
    HostAlertSummary,
    HostListResponse,
    HostNetworkInfo,
    HostOpenPortListResponse,
    HostOpenPortResponse,
    HostOverviewResponse,
    HostResponse,
    HostScanEntry,
    HostSSHSummary,
    HostUpdateRequest,
)
from app.schemas.scan import ScanTriggerResponse
from app.services import hosts as hosts_service

router = APIRouter(prefix="/api/hosts", tags=["hosts"])

IPRange = hosts_service.IPRange


def parse_ip_range(value: str) -> IPRange:
    """Parse ip_range value into a normalized range."""
    raw_value = value.strip()
    if not raw_value:
        raise ValueError("ip_range cannot be empty")

    try:
        if "-" in raw_value:
            start_raw, end_raw = [part.strip() for part in raw_value.split("-", 1)]
            if not start_raw or not end_raw:
                raise ValueError("Invalid ip_range format")
            start_ip = ip_address(start_raw)
            end_ip = ip_address(end_raw)
            if start_ip.version != end_ip.version:
                raise ValueError("IP range must use the same IP version")
        else:
            network = ip_network(raw_value, strict=False)
            start_ip = network.network_address
            end_ip = network.broadcast_address

        if int(start_ip) > int(end_ip):
            raise ValueError("IP range start must be before end")
    except ValueError as exc:
        raise ValueError(
            "Invalid ip_range; expected CIDR (e.g., 192.168.1.0/24) "
            "or range (e.g., 192.168.1.10-192.168.1.50)"
        ) from exc

    return (start_ip.version, start_ip, end_ip)


@router.get("", response_model=HostListResponse)
async def list_hosts(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    is_pingable: bool | None = Query(None),
    ip_range: str | None = Query(None),
    ip_search: str | None = Query(None, min_length=1),
    sort_by: str = Query("last_seen_at"),
    sort_dir: str = Query("desc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
) -> HostListResponse:
    """List hosts with filters (network, pingable, IP range/search)."""
    parsed_ip_range = None
    if ip_range:
        try:
            parsed_ip_range = parse_ip_range(ip_range)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    try:
        hosts = await hosts_service.get_hosts(
            db,
            network_id=network_id,
            is_pingable=is_pingable,
            ip_range=parsed_ip_range,
            ip_search=ip_search,
            sort_by=sort_by.lower(),
            sort_dir=sort_dir.lower(),
            offset=offset,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Get total counts (with same filters but without pagination)
    total_count, pingable_count = await hosts_service.get_host_counts(
        db,
        network_id=network_id,
        ip_range=parsed_ip_range,
        ip_search=ip_search,
    )

    # Build response with open port counts
    host_responses = []
    for host in hosts:
        port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
        response = HostResponse.model_validate(host)
        response.open_port_count = port_count
        host_responses.append(response)

    return HostListResponse(
        hosts=host_responses,
        total_count=total_count,
        pingable_count=pingable_count,
    )


@router.get("/{host_id}", response_model=HostResponse)
async def get_host(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostResponse:
    """Get a specific host by ID."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
    response = HostResponse.model_validate(host)
    response.open_port_count = port_count
    return response


@router.get("/{host_id}/ports", response_model=HostOpenPortListResponse)
async def get_host_ports(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostOpenPortListResponse:
    """Get open ports for a specific host."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    ports = await hosts_service.get_host_open_ports(db, host_id)
    return HostOpenPortListResponse(
        ports=[HostOpenPortResponse.model_validate(port) for port in ports]
    )


@router.get("/{host_id}/overview", response_model=HostOverviewResponse)
async def get_host_overview(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostOverviewResponse:
    """Get aggregated overview dashboard data for a specific host."""
    from app.models.alert import AlertType
    from app.services import alerts as alerts_service
    from app.services import networks as networks_service
    from app.services import scans as scans_service
    from app.services import ssh_results as ssh_service
    from app.services.global_port_rules import is_port_blocked

    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )

    # Host info
    port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
    host_response = HostResponse.model_validate(host)
    host_response.open_port_count = port_count

    # Open ports
    ports = await hosts_service.get_host_open_ports(db, host_id)
    port_responses = [HostOpenPortResponse.model_validate(p) for p in ports]

    # Networks
    network_infos = []
    for nid in (host.seen_by_networks or []):
        net = await networks_service.get_network_by_id(db, nid)
        if net:
            network_infos.append(HostNetworkInfo(id=net.id, name=net.name, cidr=net.cidr))

    # Alerts (unacknowledged)
    active_alerts_raw = await alerts_service.get_alerts(
        db, ip=host.ip, acknowledged=False, limit=100,
    )
    alert_summaries = []
    for alert, _network_name in active_alerts_raw:
        severity = "medium"
        if alert.acknowledged:
            severity = "info"
        elif await is_port_blocked(db, alert.ip, alert.port):
            severity = "critical"
        elif alert.alert_type in (AlertType.NEW_PORT,):
            severity = "high"
        elif alert.alert_type in (
            AlertType.SSH_INSECURE_AUTH, AlertType.SSH_WEAK_CIPHER,
            AlertType.SSH_WEAK_KEX, AlertType.SSH_OUTDATED_VERSION,
            AlertType.SSH_CONFIG_REGRESSION,
        ):
            severity = "high"
        alert_summaries.append(HostAlertSummary(
            id=alert.id,
            type=alert.alert_type.value,
            port=alert.port,
            message=alert.message,
            severity=severity,
            acknowledged=alert.acknowledged,
            resolution_status=alert.resolution_status.value,
            created_at=alert.created_at,
        ))

    # Acknowledged alert count
    acked_alerts = await alerts_service.get_alerts(
        db, ip=host.ip, acknowledged=True, limit=1,
    )
    # We need the count, but the service returns a list. Let's get a rough count.
    acked_all = await alerts_service.get_alerts(
        db, ip=host.ip, acknowledged=True, limit=10000,
    )
    acknowledged_count = len(acked_all)

    # SSH summary (latest)
    ssh_summary = None
    try:
        ssh_hosts_data, ssh_total = await ssh_service.get_ssh_hosts(
            db, offset=0, limit=200,
        )
        for ssh_host in ssh_hosts_data:
            if ssh_host["host_ip"] == host.ip:
                ssh_summary = HostSSHSummary(
                    port=ssh_host["port"],
                    ssh_version=ssh_host.get("ssh_version"),
                    publickey_enabled=ssh_host["publickey_enabled"],
                    password_enabled=ssh_host["password_enabled"],
                    keyboard_interactive_enabled=ssh_host["keyboard_interactive_enabled"],
                    has_weak_ciphers=ssh_host["has_weak_ciphers"],
                    has_weak_kex=ssh_host["has_weak_kex"],
                    last_scanned=ssh_host["last_scanned"],
                )
                break
    except Exception:
        pass

    # Recent scans (from networks this host belongs to)
    scan_entries = []
    for nid in (host.seen_by_networks or []):
        net = await networks_service.get_network_by_id(db, nid)
        if not net:
            continue
        scans = await scans_service.get_scans_by_network_id(db, nid, offset=0, limit=5)
        for scan, scan_port_count in scans:
            scan_entries.append(HostScanEntry(
                id=scan.id,
                network_id=nid,
                network_name=net.name,
                status=scan.status.value if hasattr(scan.status, 'value') else str(scan.status),
                started_at=scan.started_at,
                completed_at=scan.completed_at,
                trigger_type=scan.trigger_type.value if hasattr(scan.trigger_type, 'value') else str(scan.trigger_type),
                port_count=scan_port_count,
            ))
    # Sort by most recent first and limit to 10
    scan_entries.sort(key=lambda s: s.started_at or datetime.min, reverse=True)
    scan_entries = scan_entries[:10]

    return HostOverviewResponse(
        host=host_response,
        ports=port_responses,
        networks=network_infos,
        alerts=alert_summaries,
        acknowledged_alert_count=acknowledged_count,
        ssh=ssh_summary,
        recent_scans=scan_entries,
    )


@router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    admin: AdminUser,
    db: DbSession,
    host_id: int,
    request: HostUpdateRequest,
) -> HostResponse:
    """Update a host (admin only). Supports user_comment and hostname."""
    fields = {}
    if "user_comment" in request.model_fields_set:
        fields["user_comment"] = request.user_comment
    if "hostname" in request.model_fields_set:
        fields["hostname"] = request.hostname

    if not fields:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update",
        )

    host = await hosts_service.update_host_fields(db, host_id, fields)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    await db.commit()
    port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
    response = HostResponse.model_validate(host)
    response.open_port_count = port_count
    return response


@router.delete("/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_host(
    admin: AdminUser,
    db: DbSession,
    host_id: int,
) -> None:
    """Delete a single host (admin only)."""
    deleted = await hosts_service.delete_host(db, host_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    await db.commit()


@router.post("/bulk-delete", response_model=BulkDeleteHostsResponse)
async def bulk_delete_hosts(
    admin: AdminUser,
    db: DbSession,
    request: BulkDeleteHostsRequest,
) -> BulkDeleteHostsResponse:
    """Delete multiple hosts by ID (admin only)."""
    deleted_ids = await hosts_service.delete_hosts_bulk(db, request.host_ids)
    await db.commit()
    return BulkDeleteHostsResponse(
        deleted_ids=deleted_ids,
        deleted_count=len(deleted_ids),
    )


@router.get("/export/csv")
async def export_hosts_csv(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    is_pingable: bool | None = Query(None, alias="status"),
) -> StreamingResponse:
    """Export hosts as CSV."""
    # Fetch all hosts with the given filters (using a large limit to get all)
    hosts = await hosts_service.get_hosts(
        db,
        network_id=network_id,
        is_pingable=is_pingable,
        sort_by="ip",
        sort_dir="asc",
        offset=0,
        limit=10000,
    )

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)

    # Write headers
    writer.writerow([
        "IP",
        "Hostname",
        "Status",
        "OS Guess",
        "First Seen",
        "Last Seen",
        "Open Ports Count",
    ])

    # Write data rows
    for host in hosts:
        # Determine status from is_pingable field
        if host.is_pingable is None:
            status_value = "Unknown"
        elif host.is_pingable:
            status_value = "Up"
        else:
            status_value = "Down"

        # Get open port count for this host
        port_count = await hosts_service.get_open_port_count_for_host(db, host.id)

        writer.writerow([
            host.ip,
            host.hostname or "",
            status_value,
            "",  # OS Guess - not available in current Host model
            host.first_seen_at.isoformat() if host.first_seen_at else "",
            host.last_seen_at.isoformat() if host.last_seen_at else "",
            port_count,
        ])

    # Get CSV content
    csv_content = output.getvalue()
    output.close()

    # Generate filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"hosts_{timestamp}.csv"

    # Return as streaming response
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/pdf")
async def export_hosts_pdf(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    is_pingable: bool | None = Query(None, alias="status"),
) -> StreamingResponse:
    """Export hosts as PDF report."""
    # Fetch all hosts with the given filters (using a large limit to get all)
    hosts = await hosts_service.get_hosts(
        db,
        network_id=network_id,
        is_pingable=is_pingable,
        sort_by="ip",
        sort_dir="asc",
        offset=0,
        limit=10000,
    )

    # Calculate summary statistics
    total_hosts = len(hosts)
    status_counts = {"Up": 0, "Down": 0, "Unknown": 0}
    for host in hosts:
        if host.is_pingable is None:
            status_counts["Unknown"] += 1
        elif host.is_pingable:
            status_counts["Up"] += 1
        else:
            status_counts["Down"] += 1

    # Create PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements: list[Flowable] = []
    styles = getSampleStyleSheet()

    # Report header
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    title = Paragraph("<b>Host Inventory Report</b>", styles["Title"])
    elements.append(title)
    elements.append(Spacer(1, 0.2 * inch))

    subtitle = Paragraph(f"Generated: {timestamp}", styles["Normal"])
    elements.append(subtitle)
    elements.append(Spacer(1, 0.3 * inch))

    # Summary statistics
    summary_text = (
        f"<b>Summary Statistics:</b><br/>"
        f"Total Hosts: {total_hosts}<br/>"
        f"Up: {status_counts['Up']}<br/>"
        f"Down: {status_counts['Down']}<br/>"
        f"Unknown: {status_counts['Unknown']}"
    )
    summary = Paragraph(summary_text, styles["Normal"])
    elements.append(summary)
    elements.append(Spacer(1, 0.3 * inch))

    # Detailed hosts table
    table_data = [[
        "IP",
        "Hostname",
        "Status",
        "First Seen",
        "Last Seen",
        "Open Ports",
    ]]

    for host in hosts:
        # Determine status from is_pingable field
        if host.is_pingable is None:
            status_value = "Unknown"
        elif host.is_pingable:
            status_value = "Up"
        else:
            status_value = "Down"

        # Get open port count for this host
        port_count = await hosts_service.get_open_port_count_for_host(db, host.id)

        # Format datetimes
        first_seen = (
            host.first_seen_at.strftime("%Y-%m-%d %H:%M")
            if host.first_seen_at
            else "N/A"
        )
        last_seen = (
            host.last_seen_at.strftime("%Y-%m-%d %H:%M")
            if host.last_seen_at
            else "N/A"
        )

        table_data.append([
            host.ip,
            host.hostname or "",
            status_value,
            first_seen,
            last_seen,
            str(port_count),
        ])

    # Create table with style
    col_widths = [1.2 * inch, 1.5 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch, 0.8 * inch]
    table = Table(table_data, colWidths=col_widths)
    table_style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.whitesmoke),
        ("ALIGN", (0, 0), (-1, -1), "LEFT"),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("BOTTOMPADDING", (0, 0), (-1, 0), 12),
        ("BACKGROUND", (0, 1), (-1, -1), colors.beige),
        ("GRID", (0, 0), (-1, -1), 1, colors.black),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
    ])
    table.setStyle(table_style)
    elements.append(table)

    # Build PDF
    doc.build(elements)

    # Get PDF content
    pdf_content = buffer.getvalue()
    buffer.close()

    # Generate filename with timestamp
    filename_timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"hosts_{filename_timestamp}.pdf"

    # Return as streaming response
    return StreamingResponse(
        iter([pdf_content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.post("/{host_ip}/rescan", response_model=ScanTriggerResponse)
async def trigger_host_rescan(
    admin: AdminUser,
    db: DbSession,
    host_ip: str,
) -> ScanTriggerResponse:
    """Trigger a single-host rescan for a specific IP address.
    
    This will create a targeted scan for just this IP using the same scanner
    and configuration as the network it belongs to. The scan will use nmap
    for detailed host scanning and service detection.
    """
    from ipaddress import ip_address
    from app.services import networks as networks_service
    from app.services import scans as scans_service
    
    # Validate IP address format
    try:
        parsed_ip = ip_address(host_ip)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid IP address: {host_ip}",
        ) from exc
    
    # Find the host to get its network
    host = await hosts_service.get_host_by_ip(db, host_ip)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Host {host_ip} not found",
        )
    
    # Get the most specific network for this host (largest prefix = smallest subnet)
    # Similar to Linux routing table - prefer more specific routes
    if not host.seen_by_networks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No network found for host {host_ip}",
        )

    # Fetch all existing networks and find the most specific one
    candidate_networks = []
    for network_id in host.seen_by_networks:
        net = await networks_service.get_network_by_id(db, network_id)
        if net is not None:
            try:
                prefix_len = ip_network(net.cidr, strict=False).prefixlen
                candidate_networks.append((prefix_len, net))
            except ValueError:
                # Skip networks with invalid CIDR
                continue

    if not candidate_networks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No valid network found for host {host_ip}",
        )

    # Sort by prefix length descending (most specific first) and pick the first
    candidate_networks.sort(key=lambda x: x[0], reverse=True)
    network = candidate_networks[0][1]
    
    # Create a single-host scan
    scan = await scans_service.create_single_host_scan(db, network, host_ip)
    await db.commit()
    
    return ScanTriggerResponse(
        scan_id=scan.id,
        network_id=network.id,
        status="planned",
        trigger_type="manual",
        message=f"Single-host scan triggered for {host_ip}",
    )
