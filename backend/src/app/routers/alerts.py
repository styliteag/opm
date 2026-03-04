"""Alerts management endpoints."""

import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO

from fastapi import APIRouter, Body, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Flowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.alert import Alert, AlertType
from app.models.global_port_rule import GlobalRuleType
from app.models.port_rule import RuleType
from app.models.user import UserRole
from app.schemas.alert import (
    AckSuggestionsResponse,
    AcknowledgeRequest,
    AlertAssignRequest,
    AlertBulkAcknowledgeResponse,
    AlertBulkWhitelistRequest,
    AlertBulkWhitelistResponse,
    AlertListResponse,
    AlertResponse,
    AlertSSHSummary,
    AlertStatusRequest,
    BulkAcknowledgeRequest,
    Severity,
)
from app.schemas.host import PortRuleMatch
from app.schemas.alert_comment import (
    AlertCommentCreate,
    AlertCommentListResponse,
    AlertCommentResponse,
    AlertCommentUpdate,
)
from app.services import alert_comments as alert_comments_service
from app.services import alerts as alerts_service
from app.services import global_port_rules as global_rules_service
from app.services import hosts as hosts_service
from app.services import networks as networks_service
from app.services import port_rules as port_rules_service
from app.services import ssh_results as ssh_service
from app.services import users as users_service
from app.services.global_port_rules import is_port_blocked

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


async def compute_alert_severity(
    db: DbSession, alert_type: AlertType, ip: str, port: int, acknowledged: bool
) -> Severity:
    """Compute alert severity based on rules and status."""
    # Acknowledged alerts are always INFO
    if acknowledged:
        return Severity.INFO

    # Check if port is blocked (CRITICAL)
    if await is_port_blocked(db, ip, port):
        return Severity.CRITICAL

    # Map alert types to severity
    if alert_type == AlertType.BLOCKED:
        return Severity.CRITICAL
    elif alert_type == AlertType.NEW_PORT:
        return Severity.HIGH
    elif alert_type == AlertType.NOT_ALLOWED:
        return Severity.MEDIUM
    # SSH security alert types
    elif alert_type == AlertType.SSH_INSECURE_AUTH:
        return Severity.HIGH
    elif alert_type == AlertType.SSH_WEAK_CIPHER:
        return Severity.MEDIUM
    elif alert_type == AlertType.SSH_WEAK_KEX:
        return Severity.MEDIUM
    elif alert_type == AlertType.SSH_OUTDATED_VERSION:
        return Severity.MEDIUM
    elif alert_type == AlertType.SSH_CONFIG_REGRESSION:
        return Severity.HIGH

    return Severity.MEDIUM


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    user: CurrentUser,
    db: DbSession,
    alert_type: AlertType | None = Query(None, alias="type"),
    network_id: int | None = Query(None, ge=1),
    acknowledged: bool | None = Query(None),
    ip: str | None = Query(None),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> AlertListResponse:
    """List alerts with optional filters."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )

    alerts = await alerts_service.get_alerts(
        db,
        alert_type=alert_type,
        network_id=network_id,
        acknowledged=acknowledged,
        ip=ip,
        start_date=start_date,
        end_date=end_date,
        offset=offset,
        limit=limit,
    )

    # Build a cache of hosts by IP to avoid N+1 queries
    unique_ips = set(alert.ip for alert, _ in alerts)
    host_cache: dict[str, tuple[int, str | None, str | None]] = {}
    for ip in unique_ips:
        host = await hosts_service.get_host_by_ip(db, ip)
        if host:
            host_cache[ip] = (host.id, host.hostname, host.user_comment)

    # Build a cache of assigned user emails to avoid N+1 queries
    unique_user_ids = set(
        alert.assigned_to_user_id for alert, _ in alerts if alert.assigned_to_user_id is not None
    )
    user_email_cache: dict[int, str] = {}
    for uid in unique_user_ids:
        u = await users_service.get_user_by_id(db, uid)
        if u is not None:
            user_email_cache[uid] = u.email

    # Build a cache of latest comments per alert
    alert_ids = [alert.id for alert, _ in alerts]
    latest_comments = await alert_comments_service.get_latest_comments_for_alerts(db, alert_ids)

    # Compute severity for each alert
    alert_responses = []
    for alert, network_name in alerts:
        severity = await compute_alert_severity(
            db, alert.alert_type, alert.ip, alert.port, alert.acknowledged
        )
        # Get host info from cache
        host_info = host_cache.get(alert.ip)
        host_id = host_info[0] if host_info else None
        hostname = host_info[1] if host_info else None
        user_comment = host_info[2] if host_info else None

        assigned_to_email = user_email_cache.get(alert.assigned_to_user_id) if alert.assigned_to_user_id else None

        # Get latest comment from cache
        comment_info = latest_comments.get(alert.id)
        last_comment = comment_info[0] if comment_info else None
        last_comment_by = comment_info[1] if comment_info else None
        last_comment_at = comment_info[2] if comment_info else None

        alert_responses.append(
            AlertResponse(
                id=alert.id,
                type=alert.alert_type,
                network_id=alert.network_id,
                network_name=network_name,
                global_open_port_id=alert.global_open_port_id,
                ip=alert.ip,
                port=alert.port,
                message=alert.message,
                acknowledged=alert.acknowledged,
                assigned_to_user_id=alert.assigned_to_user_id,
                assigned_to_email=assigned_to_email,
                resolution_status=alert.resolution_status,
                created_at=alert.created_at,
                severity=severity,
                host_id=host_id,
                hostname=hostname,
                user_comment=user_comment,
                last_comment=last_comment,
                last_comment_by=last_comment_by,
                last_comment_at=last_comment_at,
            )
        )

    # Enrich with SSH context: batch-fetch SSH data and SSH alert counts
    unique_ips = set(a.ip for a in alert_responses)
    ssh_data_cache = await ssh_service.get_latest_ssh_results_for_ips(db, unique_ips)
    ssh_alert_cache = await alerts_service.get_ssh_alert_summary_for_ips(db, unique_ips)

    for resp in alert_responses:
        ssh_data = ssh_data_cache.get((resp.ip, resp.port))
        if ssh_data:
            resp.ssh_summary = AlertSSHSummary(**ssh_data)
        ssh_alert_info = ssh_alert_cache.get((resp.ip, resp.port))
        if ssh_alert_info:
            resp.related_ssh_alert_count = ssh_alert_info[0]
            resp.related_ssh_alerts_acknowledged = ssh_alert_info[1]

    # Enrich with matching port rules
    from app.services.global_port_rules import _parse_port_range

    global_rules = await global_rules_service.get_all_global_rules(db)
    # Collect unique network IDs from alerts for network-scoped rules
    alert_network_ids = set(r.network_id for r in alert_responses if r.network_id is not None)
    network_rules_by_nid: dict[int, list] = {}
    for nid in alert_network_ids:
        network_rules_by_nid[nid] = await port_rules_service.get_rules_by_network_id(db, nid)
    # Fetch network names
    network_name_cache: dict[int, str] = {}
    for nid in alert_network_ids:
        net = await networks_service.get_network_by_id(db, nid)
        if net:
            network_name_cache[nid] = net.name

    for resp in alert_responses:
        matches: list[PortRuleMatch] = []
        for gr in global_rules:
            parsed = _parse_port_range(gr.port)
            if parsed is None:
                continue
            start, end = parsed
            if not (start <= resp.port <= end):
                continue
            if gr.ip is not None and gr.ip != resp.ip:
                continue
            matches.append(PortRuleMatch(
                id=gr.id, scope="global", network_id=None, network_name=None,
                rule_type=gr.rule_type.value, description=gr.description,
            ))
        if resp.network_id and resp.network_id in network_rules_by_nid:
            for nr in network_rules_by_nid[resp.network_id]:
                parsed = _parse_port_range(nr.port)
                if parsed is None:
                    continue
                start, end = parsed
                if not (start <= resp.port <= end):
                    continue
                if nr.ip is not None and nr.ip != resp.ip:
                    continue
                matches.append(PortRuleMatch(
                    id=nr.id, scope="network", network_id=resp.network_id,
                    network_name=network_name_cache.get(resp.network_id),
                    rule_type=nr.rule_type.value, description=nr.description,
                ))
        resp.matching_rules = matches

    # Sort by severity (critical first), then by created_at (newest first)
    severity_order = {
        Severity.CRITICAL: 0,
        Severity.HIGH: 1,
        Severity.MEDIUM: 2,
        Severity.INFO: 3,
    }
    alert_responses.sort(
        key=lambda a: (severity_order.get(a.severity, 999), -a.created_at.timestamp())
    )

    # Deduplicate: keep only the highest-severity alert per (ip, port)
    seen: set[tuple[str, int]] = set()
    deduped: list[AlertResponse] = []
    for a in alert_responses:
        key = (a.ip, a.port)
        if key not in seen:
            seen.add(key)
            deduped.append(a)
    alert_responses = deduped

    return AlertListResponse(alerts=alert_responses)


@router.get("/export/csv")
async def export_alerts_csv(
    user: CurrentUser,
    db: DbSession,
    alert_type: AlertType | None = Query(None, alias="type"),
    acknowledged: bool | None = Query(None),
) -> StreamingResponse:
    """Export alerts as CSV with optional filters."""
    # Get all alerts with filters (no pagination for export)
    alerts = await alerts_service.get_alerts(
        db,
        alert_type=alert_type,
        network_id=None,
        acknowledged=acknowledged,
        start_date=None,
        end_date=None,
        offset=0,
        limit=10000,  # Large limit for export
    )

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)

    # Write headers: Alert Type, IP, Port, Network, Status, Created At
    writer.writerow([
        "Alert Type",
        "IP",
        "Port",
        "Network",
        "Status",
        "Created At",
    ])

    # Write data rows
    for alert, network_name in alerts:
        writer.writerow([
            alert.alert_type.value,
            alert.ip,
            alert.port,
            network_name or "",
            "Acknowledged" if alert.acknowledged else "Open",
            alert.created_at.isoformat(),
        ])

    # Get CSV content
    csv_content = output.getvalue()
    output.close()

    # Generate filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"alerts_{timestamp}.csv"

    # Return as streaming response
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/pdf")
async def export_alerts_pdf(
    user: CurrentUser,
    db: DbSession,
    alert_type: AlertType | None = Query(None, alias="type"),
    acknowledged: bool | None = Query(None),
) -> StreamingResponse:
    """Export alerts as PDF with optional filters."""
    # Get all alerts with filters (no pagination for export)
    alerts = await alerts_service.get_alerts(
        db,
        alert_type=alert_type,
        network_id=None,
        acknowledged=acknowledged,
        start_date=None,
        end_date=None,
        offset=0,
        limit=10000,  # Large limit for export
    )

    # Create PDF in memory
    buffer = BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=letter)
    elements: list[Flowable] = []
    styles = getSampleStyleSheet()

    # Add title
    title = Paragraph("<b>Alerts Report</b>", styles["Title"])
    elements.append(title)
    elements.append(Spacer(1, 0.2 * inch))

    # Add report metadata
    report_date = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')
    metadata_text = f"<b>Generated:</b> {report_date}"
    metadata = Paragraph(metadata_text, styles["Normal"])
    elements.append(metadata)
    elements.append(Spacer(1, 0.3 * inch))

    # Calculate summary statistics
    total_alerts = len(alerts)
    by_type: dict[str, int] = {}
    acknowledged_count = 0
    for alert, _ in alerts:
        by_type[alert.alert_type.value] = by_type.get(alert.alert_type.value, 0) + 1
        if alert.acknowledged:
            acknowledged_count += 1

    open_count = total_alerts - acknowledged_count

    # Add summary statistics
    summary_lines = [
        f"<b>Total alerts:</b> {total_alerts}",
        f"<b>Open:</b> {open_count}",
        f"<b>Acknowledged:</b> {acknowledged_count}",
    ]
    if by_type:
        summary_lines.append("<b>By type:</b>")
        for alert_type_name, count in sorted(by_type.items()):
            summary_lines.append(f"  • {alert_type_name}: {count}")

    summary_text = "<b>Summary Statistics</b><br/>" + "<br/>".join(summary_lines)
    summary = Paragraph(summary_text, styles["Heading2"])
    elements.append(summary)
    elements.append(Spacer(1, 0.3 * inch))

    # Add detailed table of alerts
    if alerts:
        headers = ["Alert Type", "IP", "Port", "Network", "Status", "Created At"]
        table_data = [headers]
        for alert, network_name in alerts:
            table_data.append([
                alert.alert_type.value,
                alert.ip,
                str(alert.port),
                network_name or "",
                "Acknowledged" if alert.acknowledged else "Open",
                alert.created_at.strftime('%Y-%m-%d %H:%M'),
            ])

        col_widths = [1.3 * inch, 1.2 * inch, 0.7 * inch, 1.3 * inch, 1.2 * inch, 1.3 * inch]
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
        no_alerts = Paragraph("No alerts found matching the filters.", styles["Normal"])
        elements.append(no_alerts)

    # Build PDF
    doc.build(elements)
    pdf_content = buffer.getvalue()
    buffer.close()

    # Generate filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"alerts_{timestamp}.pdf"

    # Return as streaming response
    return StreamingResponse(
        iter([pdf_content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/ack-suggestions", response_model=AckSuggestionsResponse)
async def get_ack_suggestions(
    user: CurrentUser,
    db: DbSession,
    port: int | None = Query(None, ge=1, le=65535),
    search: str | None = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=50),
) -> AckSuggestionsResponse:
    """Get previously used ACK reasons as suggestions, ranked by port affinity."""
    suggestions = await alerts_service.get_ack_suggestions(
        db, port=port, search=search, limit=limit
    )
    return AckSuggestionsResponse(suggestions=suggestions)


@router.put("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    admin: AdminUser,
    db: DbSession,
    alert_id: int,
    request: AcknowledgeRequest | None = None,
) -> AlertResponse:
    """Acknowledge a single alert (admin only).

    When include_ssh_findings=True, also acknowledges related SSH security
    alerts for the same ip:port (creating them on-the-fly if needed).
    """
    from app.services.alerts import _extract_weak_algorithms, _is_version_outdated, DEFAULT_SSH_VERSION_THRESHOLD
    from sqlalchemy import select as sa_select, update as sa_update

    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    reason = request.reason if request else None
    include_ssh = request.include_ssh_findings if request else False
    alert = await alerts_service.acknowledge_alert(db, alert, ack_reason=reason)

    # Auto-create comment if reason provided
    if reason:
        await alert_comments_service.create_comment(
            db, alert_id=alert.id, user_id=admin.id, comment=reason
        )

        # Propagate reason to GlobalOpenPort and Host
        await alerts_service.propagate_ack_reason_to_port_and_host(db, alert, reason)

    # Unified ACK: also acknowledge SSH findings for the same ip:port
    ssh_alert_count = 0
    ssh_all_acked = True
    if include_ssh:
        ssh_result = await ssh_service.get_latest_ssh_result(db, alert.ip, alert.port)
        if ssh_result:
            ssh_types = [
                AlertType.SSH_INSECURE_AUTH,
                AlertType.SSH_WEAK_CIPHER,
                AlertType.SSH_WEAK_KEX,
                AlertType.SSH_OUTDATED_VERSION,
            ]
            # Find existing SSH alerts
            existing = await db.execute(
                sa_select(Alert.id, Alert.alert_type).where(
                    Alert.ip == alert.ip,
                    Alert.port == alert.port,
                    Alert.alert_type.in_(ssh_types),
                )
            )
            existing_rows = existing.all()
            existing_types = {row[1] for row in existing_rows}
            ssh_alert_ids = [row[0] for row in existing_rows]

            # Create missing SSH alerts
            if (ssh_result.password_enabled or ssh_result.keyboard_interactive_enabled) and AlertType.SSH_INSECURE_AUTH not in existing_types:
                auth_methods = []
                if ssh_result.password_enabled:
                    auth_methods.append("password")
                if ssh_result.keyboard_interactive_enabled:
                    auth_methods.append("keyboard-interactive")
                new_alert = Alert(
                    scan_id=ssh_result.scan_id, network_id=alert.network_id,
                    alert_type=AlertType.SSH_INSECURE_AUTH, ip=alert.ip, port=alert.port,
                    message=f"SSH server allows insecure authentication methods: {', '.join(auth_methods)} on {alert.ip}:{alert.port}",
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            weak_ciphers = _extract_weak_algorithms(ssh_result.supported_ciphers)
            if weak_ciphers and AlertType.SSH_WEAK_CIPHER not in existing_types:
                new_alert = Alert(
                    scan_id=ssh_result.scan_id, network_id=alert.network_id,
                    alert_type=AlertType.SSH_WEAK_CIPHER, ip=alert.ip, port=alert.port,
                    message=f"SSH server supports weak ciphers: {', '.join(weak_ciphers)} on {alert.ip}:{alert.port}",
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            weak_kex = _extract_weak_algorithms(ssh_result.kex_algorithms)
            if weak_kex and AlertType.SSH_WEAK_KEX not in existing_types:
                new_alert = Alert(
                    scan_id=ssh_result.scan_id, network_id=alert.network_id,
                    alert_type=AlertType.SSH_WEAK_KEX, ip=alert.ip, port=alert.port,
                    message=f"SSH server supports weak key exchange algorithms: {', '.join(weak_kex)} on {alert.ip}:{alert.port}",
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            if _is_version_outdated(ssh_result.ssh_version, DEFAULT_SSH_VERSION_THRESHOLD) and AlertType.SSH_OUTDATED_VERSION not in existing_types:
                new_alert = Alert(
                    scan_id=ssh_result.scan_id, network_id=alert.network_id,
                    alert_type=AlertType.SSH_OUTDATED_VERSION, ip=alert.ip, port=alert.port,
                    message=f"SSH server running outdated version: {ssh_result.ssh_version or 'unknown'} on {alert.ip}:{alert.port}",
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            # Acknowledge all SSH alerts
            if ssh_alert_ids:
                ack_values: dict[str, object] = {"acknowledged": True}
                if reason:
                    ack_values["ack_reason"] = reason
                await db.execute(
                    sa_update(Alert).where(Alert.id.in_(ssh_alert_ids)).values(**ack_values)
                )
                ssh_alert_count = len(ssh_alert_ids)
                ssh_all_acked = True

    await db.commit()

    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port, alert.acknowledged
    )

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        network_id=alert.network_id,
        network_name=network_name,
        global_open_port_id=alert.global_open_port_id,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        acknowledged=alert.acknowledged,
        ack_reason=alert.ack_reason,
        created_at=alert.created_at,
        severity=severity,
        related_ssh_alert_count=ssh_alert_count,
        related_ssh_alerts_acknowledged=ssh_all_acked,
    )


@router.put(
    "/acknowledge-bulk",
    response_model=AlertBulkAcknowledgeResponse,
)
async def acknowledge_alerts_bulk(
    admin: AdminUser,
    db: DbSession,
    request: BulkAcknowledgeRequest = Body(...),
) -> AlertBulkAcknowledgeResponse:
    """Acknowledge multiple alerts (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    unique_ids = sorted(set(request.alert_ids))
    alerts = await alerts_service.get_alerts_by_ids(db, unique_ids)
    reason = request.reason.strip() if request.reason else None

    # Set ack_reason on each alert and acknowledge
    for alert in alerts:
        if reason:
            alert.ack_reason = reason
    await alerts_service.acknowledge_alerts(db, alerts)

    # Auto-create comments and propagate reason to GlobalOpenPort/Host
    if reason:
        for alert in alerts:
            await alert_comments_service.create_comment(
                db, alert_id=alert.id, user_id=admin.id, comment=reason
            )
            await alerts_service.propagate_ack_reason_to_port_and_host(db, alert, reason)

    await db.commit()

    acknowledged_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(acknowledged_ids))

    return AlertBulkAcknowledgeResponse(
        acknowledged_ids=acknowledged_ids,
        missing_ids=missing_ids,
    )


@router.put("/{alert_id}/unacknowledge", response_model=AlertResponse)
async def unacknowledge_alert(
    admin: AdminUser,
    db: DbSession,
    alert_id: int,
) -> AlertResponse:
    """Unacknowledge (reopen) a single alert (admin only)."""
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    alert = await alerts_service.unacknowledge_alert(db, alert)
    await db.commit()

    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port, alert.acknowledged
    )

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        network_id=alert.network_id,
        network_name=network_name,
        global_open_port_id=alert.global_open_port_id,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        acknowledged=alert.acknowledged,
        ack_reason=alert.ack_reason,
        created_at=alert.created_at,
        severity=severity,
    )


@router.post(
    "/bulk-whitelist-global",
    response_model=AlertBulkWhitelistResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_whitelist_global(
    admin: AdminUser,
    db: DbSession,
    request: AlertBulkWhitelistRequest = Body(...),
) -> AlertBulkWhitelistResponse:
    """Add multiple alerts to global whitelist with single reason (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    if not request.reason or not request.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason is required for whitelisting",
        )

    unique_ids = sorted(set(request.alert_ids))
    alerts = await alerts_service.get_alerts_by_ids(db, unique_ids)

    # Track unique IP:port combinations to whitelist
    ports_to_whitelist: set[tuple[str | None, str]] = set()
    errors: list[str] = []

    for alert in alerts:
        # Add to whitelist set (ip can be None for global rules)
        ports_to_whitelist.add((alert.ip, str(alert.port)))

    # Create global whitelist rules
    whitelisted_count = 0
    for ip, port in ports_to_whitelist:
        try:
            await global_rules_service.create_global_rule(
                db=db,
                port=port,
                rule_type=GlobalRuleType.ACCEPTED,
                ip=ip,
                description=request.reason.strip(),
                created_by=admin.id,
            )
            whitelisted_count += 1
        except Exception as e:
            errors.append(f"Failed to whitelist {ip}:{port}: {str(e)}")

    # Acknowledge all alerts and create comments
    reason = request.reason.strip()
    for alert in alerts:
        alert.ack_reason = reason
    await alerts_service.acknowledge_alerts(db, alerts)
    for alert in alerts:
        await alert_comments_service.create_comment(
            db, alert_id=alert.id, user_id=admin.id, comment=reason
        )
        await alerts_service.propagate_ack_reason_to_port_and_host(db, alert, reason)
    await db.commit()

    acknowledged_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(acknowledged_ids))

    return AlertBulkWhitelistResponse(
        whitelisted_count=whitelisted_count,
        acknowledged_ids=acknowledged_ids,
        missing_ids=missing_ids,
        errors=errors,
    )


@router.post(
    "/bulk-whitelist-network",
    response_model=AlertBulkWhitelistResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_whitelist_network(
    admin: AdminUser,
    db: DbSession,
    request: AlertBulkWhitelistRequest = Body(...),
) -> AlertBulkWhitelistResponse:
    """Add multiple alerts to network-specific whitelist with single reason (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    if not request.reason or not request.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason is required for whitelisting",
        )

    unique_ids = sorted(set(request.alert_ids))
    alerts = await alerts_service.get_alerts_by_ids(db, unique_ids)

    # Group by network_id
    alerts_by_network: dict[int, list[Alert]] = {}
    errors: list[str] = []

    for alert in alerts:
        if alert.network_id is None:
            errors.append(
                f"Alert {alert.id} has no network_id, cannot create network-specific rule"
            )
            continue
        if alert.network_id not in alerts_by_network:
            alerts_by_network[alert.network_id] = []
        alerts_by_network[alert.network_id].append(alert)

    # Create network-specific whitelist rules
    whitelisted_count = 0
    for network_id, network_alerts in alerts_by_network.items():
        # Verify network exists
        network = await networks_service.get_network_by_id(db, network_id)
        if network is None:
            errors.append(f"Network {network_id} not found")
            continue

        # Track unique IP:port combinations per network
        ports_to_whitelist: set[tuple[str | None, str]] = set()
        for alert in network_alerts:
            ports_to_whitelist.add((alert.ip, str(alert.port)))

        # Create rules for this network
        for ip, port in ports_to_whitelist:
            try:
                await port_rules_service.create_rule(
                    db=db,
                    network_id=network_id,
                    port=port,
                    rule_type=RuleType.ACCEPTED,
                    ip=ip,
                    description=request.reason.strip(),
                )
                whitelisted_count += 1
            except Exception as e:
                errors.append(f"Failed to whitelist {ip}:{port} on network {network_id}: {str(e)}")

    # Acknowledge all alerts and create comments
    reason = request.reason.strip()
    for alert in alerts:
        alert.ack_reason = reason
    await alerts_service.acknowledge_alerts(db, alerts)
    for alert in alerts:
        await alert_comments_service.create_comment(
            db, alert_id=alert.id, user_id=admin.id, comment=reason
        )
        await alerts_service.propagate_ack_reason_to_port_and_host(db, alert, reason)
    await db.commit()

    acknowledged_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(acknowledged_ids))

    return AlertBulkWhitelistResponse(
        whitelisted_count=whitelisted_count,
        acknowledged_ids=acknowledged_ids,
        missing_ids=missing_ids,
        errors=errors,
    )


# =============================================================================
# Alert Comments CRUD Endpoints
# =============================================================================


@router.post(
    "/{alert_id}/comments",
    response_model=AlertCommentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_comment(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
    request: AlertCommentCreate = Body(...),
) -> AlertCommentResponse:
    """Create a new comment on an alert."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Create the comment
    comment = await alert_comments_service.create_comment(
        db, alert_id=alert_id, user_id=user.id, comment=request.comment
    )
    await db.commit()
    await db.refresh(comment)

    return AlertCommentResponse(
        id=comment.id,
        alert_id=comment.alert_id,
        user_id=comment.user_id,
        user_email=user.email,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.get("/{alert_id}/comments", response_model=AlertCommentListResponse)
async def list_comments(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
) -> AlertCommentListResponse:
    """List all comments for an alert."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Get all comments for the alert
    comments_with_email = await alert_comments_service.get_comments_for_alert(db, alert_id)

    return AlertCommentListResponse(
        comments=[
            AlertCommentResponse(
                id=comment.id,
                alert_id=comment.alert_id,
                user_id=comment.user_id,
                user_email=email,
                comment=comment.comment,
                created_at=comment.created_at,
                updated_at=comment.updated_at,
            )
            for comment, email in comments_with_email
        ]
    )


@router.patch("/{alert_id}/comments/{comment_id}", response_model=AlertCommentResponse)
async def update_comment(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
    comment_id: int,
    request: AlertCommentUpdate = Body(...),
) -> AlertCommentResponse:
    """Update a comment. Only the comment author or an admin can update."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Get the comment
    comment_with_email = await alert_comments_service.get_comment_by_id(db, comment_id)
    if comment_with_email is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    comment, email = comment_with_email

    # Verify comment belongs to this alert
    if comment.alert_id != alert_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Check permission: only author or admin can update
    if comment.user_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only edit your own comments",
        )

    # Update the comment
    comment = await alert_comments_service.update_comment(db, comment, request.comment)
    await db.commit()
    await db.refresh(comment)

    return AlertCommentResponse(
        id=comment.id,
        alert_id=comment.alert_id,
        user_id=comment.user_id,
        user_email=email,
        comment=comment.comment,
        created_at=comment.created_at,
        updated_at=comment.updated_at,
    )


@router.delete(
    "/{alert_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_comment(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
    comment_id: int,
) -> None:
    """Delete a comment. Only the comment author or an admin can delete."""
    # Verify alert exists
    alert = await alert_comments_service.get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    # Get the comment
    comment_with_email = await alert_comments_service.get_comment_by_id(db, comment_id)
    if comment_with_email is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    comment, _ = comment_with_email

    # Verify comment belongs to this alert
    if comment.alert_id != alert_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Comment not found",
        )

    # Check permission: only author or admin can delete
    if comment.user_id != user.id and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own comments",
        )

    # Delete the comment
    await alert_comments_service.delete_comment(db, comment)
    await db.commit()


# =============================================================================
# Alert Assignment and Status Endpoints
# =============================================================================


@router.patch("/{alert_id}/assign", response_model=AlertResponse)
async def assign_alert(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
    request: AlertAssignRequest = Body(...),
) -> AlertResponse:
    """Assign an alert to a user. Pass null user_id to unassign."""
    # Verify alert exists
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network

    # If user_id is provided, validate the user exists
    assigned_to_email: str | None = None
    if request.user_id is not None:
        assigned_user = await users_service.get_user_by_id(db, request.user_id)
        if assigned_user is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User not found",
            )
        assigned_to_email = assigned_user.email

    # Update the alert assignment
    alert.assigned_to_user_id = request.user_id
    await db.commit()
    await db.refresh(alert)

    # Compute severity for response
    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port, alert.acknowledged
    )

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        network_id=alert.network_id,
        network_name=network_name,
        global_open_port_id=alert.global_open_port_id,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        acknowledged=alert.acknowledged,
        assigned_to_user_id=alert.assigned_to_user_id,
        assigned_to_email=assigned_to_email,
        resolution_status=alert.resolution_status,
        created_at=alert.created_at,
        severity=severity,
    )


@router.patch("/{alert_id}/status", response_model=AlertResponse)
async def update_alert_status(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
    request: AlertStatusRequest = Body(...),
) -> AlertResponse:
    """Update the resolution status of an alert."""
    # Verify alert exists
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network

    # Validate status is a valid enum value (Pydantic already does this via the schema)
    # Update the resolution status
    alert.resolution_status = request.resolution_status
    await db.commit()
    await db.refresh(alert)

    # Get assigned user email if assigned
    assigned_to_email: str | None = None
    if alert.assigned_to_user_id is not None:
        assigned_user = await users_service.get_user_by_id(db, alert.assigned_to_user_id)
        if assigned_user is not None:
            assigned_to_email = assigned_user.email

    # Compute severity for response
    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port, alert.acknowledged
    )

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        network_id=alert.network_id,
        network_name=network_name,
        global_open_port_id=alert.global_open_port_id,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        acknowledged=alert.acknowledged,
        assigned_to_user_id=alert.assigned_to_user_id,
        assigned_to_email=assigned_to_email,
        resolution_status=alert.resolution_status,
        created_at=alert.created_at,
        severity=severity,
    )
