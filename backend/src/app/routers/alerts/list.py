"""Alert list and export endpoints."""

from collections import Counter
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Spacer
from sqlalchemy import and_
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DbSession, Pagination
from app.lib.export import (
    build_pdf,
    csv_response,
    export_timestamp,
    make_pdf_table,
    new_pdf_buffer,
    pdf_response,
)
from app.models.alert import Alert, AlertType
from app.models.host import Host
from app.models.network import Network
from app.schemas.alert import (
    AlertListResponse,
    AlertResponse,
    AlertSSHSummary,
    DismissSuggestionsResponse,
)
from app.schemas.host import PortRuleMatch
from app.services import alert_comments as alert_comments_service
from app.services import alert_policy as alert_policy_service
from app.services import alert_rules as alert_rules_service
from app.services import alerts as alerts_service
from app.services import hosts as hosts_service
from app.services import networks as networks_service
from app.services import ssh_results as ssh_service
from app.services import users as users_service
from app.services.alert_queries import _build_alert_filters, count_alerts
from app.services.alert_rules import (
    FINDING_SOURCES,
    finding_identifier_from_key,
    finding_rule_matches_alert,
    port_rule_matches_alert,
    ssh_rule_matches_alert,
)
from app.services.alert_severity import TYPE_SEVERITY, lightweight_severity

from .detail import _severity_override_value, compute_alert_severity

router = APIRouter()

# Lightweight severity mapping by alert_type (no async rule checks) —
# shared with the executive overview via services/alert_severity.
_TYPE_SEVERITY = TYPE_SEVERITY


async def _count_by_severity(
    db: AsyncSession,
    *,
    alert_type: AlertType | None = None,
    source: str | None = None,
    network_id: int | None = None,
    dismissed: bool | None = None,
    ip: str | None = None,
    port: int | None = None,
    search: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> dict[str, int]:
    """Count alerts grouped by computed severity (lightweight, no rule checks)."""
    query = (
        sa_select(Alert.alert_type, Alert.severity_override)
        .outerjoin(Network, Alert.network_id == Network.id)
    )
    if search:
        query = query.outerjoin(Host, Alert.ip == Host.ip)

    filters = _build_alert_filters(
        alert_type=alert_type,
        source=source,
        network_id=network_id,
        dismissed=dismissed,
        ip=ip,
        port=port,
        search=search,
        start_date=start_date,
        end_date=end_date,
    )
    if filters:
        query = query.where(and_(*filters))

    result = await db.execute(query)
    counts: Counter[str] = Counter()
    for at, override in result.all():
        counts[_lightweight_severity(at.value, override)] += 1

    return dict(counts)


def _lightweight_severity(alert_type_value: str, override: str | None) -> str:
    return lightweight_severity(alert_type_value, override)


def _severity_counts_from_alerts(alerts: list[Alert]) -> dict[str, int]:
    """Severity counts for an in-memory alert set (policy-filtered path)."""
    counts: Counter[str] = Counter()
    for alert in alerts:
        counts[_lightweight_severity(alert.alert_type.value, alert.severity_override)] += 1
    return dict(counts)


@router.get("/", response_model=AlertListResponse)
async def list_alerts(
    user: CurrentUser,
    db: DbSession,
    pagination: Pagination,
    alert_type: AlertType | None = Query(None, alias="type"),
    source: str | None = Query(None, max_length=10),
    network_id: int | None = Query(None, ge=1),
    dismissed: bool | None = Query(None),
    queue_state: str | None = Query(None, pattern="^(inbox|out_of_inbox)$"),
    policy_state: str | None = Query(
        None, pattern="^(none|allowed|allowed_network|allowed_global)$"
    ),
    ip: str | None = Query(None),
    port: int | None = Query(None, ge=1, le=65535),
    search: str | None = Query(None, max_length=200),
    sort_by: str | None = Query(None, max_length=50),
    sort_dir: str | None = Query(None, pattern="^(asc|desc)$"),
    start_date: datetime | None = Query(None),
    end_date: datetime | None = Query(None),
) -> AlertListResponse:
    """List alerts with optional filters."""
    if start_date is not None and end_date is not None and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="start_date cannot be after end_date",
        )

    if queue_state is not None:
        queue_dismissed = queue_state == alert_policy_service.QUEUE_OUT_OF_INBOX
        if dismissed is not None and dismissed != queue_dismissed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="queue_state conflicts with dismissed",
            )
        dismissed = queue_dismissed

    policy_filtered: list[tuple[Alert, str | None]] | None = None
    if policy_state is not None:
        # Rule criteria are JSON (port ranges), so the policy dimension is
        # matched in Python over the full candidate set before pagination —
        # per-page matching would break totals and page boundaries.
        candidates = await alerts_service.get_alerts(
            db,
            alert_type=alert_type,
            source=source,
            network_id=network_id,
            dismissed=dismissed,
            ip=ip,
            port=port,
            search=search,
            sort_by=sort_by,
            sort_dir=sort_dir,
            start_date=start_date,
            end_date=end_date,
            offset=0,
            limit=None,
        )
        policy_by_id = await alert_policy_service.compute_policy_states(
            db, [alert for alert, _ in candidates]
        )
        policy_filtered = [
            (alert, name)
            for alert, name in candidates
            if alert_policy_service.policy_filter_matches(
                policy_by_id[alert.id], policy_state
            )
        ]
        total = len(policy_filtered)
        alerts = policy_filtered[
            pagination.offset : pagination.offset + pagination.limit
        ]
    else:
        total = await count_alerts(
            db,
            alert_type=alert_type,
            source=source,
            network_id=network_id,
            dismissed=dismissed,
            ip=ip,
            port=port,
            search=search,
            start_date=start_date,
            end_date=end_date,
        )

        alerts = await alerts_service.get_alerts(
            db,
            alert_type=alert_type,
            source=source,
            network_id=network_id,
            dismissed=dismissed,
            ip=ip,
            port=port,
            search=search,
            sort_by=sort_by,
            sort_dir=sort_dir,
            start_date=start_date,
            end_date=end_date,
            offset=pagination.offset,
            limit=pagination.limit,
        )
        policy_by_id = await alert_policy_service.compute_policy_states(
            db, [alert for alert, _ in alerts]
        )

    # Build a cache of hosts by IP to avoid N+1 queries.
    # Loop variable must NOT be named `ip` — that shadows the router query
    # param, which is passed to _count_by_severity below (caused severity
    # counts to be silently filtered to the last IP on the page).
    unique_ips = set(alert.ip for alert, _ in alerts)
    host_cache: dict[str, tuple[int, str | None, str | None]] = {}
    for host_ip in unique_ips:
        host = await hosts_service.get_host_by_ip(db, host_ip)
        if host:
            host_cache[host_ip] = (host.id, host.hostname, host.user_comment)

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
            db, alert.alert_type, alert.ip, alert.port or 0, alert.severity_override
        )
        # Get host info from cache
        host_info = host_cache.get(alert.ip)
        host_id = host_info[0] if host_info else None
        hostname = host_info[1] if host_info else None
        user_comment = host_info[2] if host_info else None

        assigned_to_email = (
            user_email_cache.get(alert.assigned_to_user_id) if alert.assigned_to_user_id else None
        )

        # Get latest comment from cache
        comment_info = latest_comments.get(alert.id)
        last_comment = comment_info[0] if comment_info else None
        last_comment_by = comment_info[1] if comment_info else None
        last_comment_at = comment_info[2] if comment_info else None

        alert_policy = policy_by_id.get(alert.id, alert_policy_service.NO_POLICY)
        alert_responses.append(
            AlertResponse(
                id=alert.id,
                type=alert.alert_type,
                source=alert.source,
                source_key=alert.source_key,
                network_id=alert.network_id,
                network_name=network_name,
                global_open_port_id=alert.global_open_port_id,
                ip=alert.ip,
                port=alert.port,
                message=alert.message,
                dismissed=alert.dismissed,
                assigned_to_user_id=alert.assigned_to_user_id,
                assigned_to_email=assigned_to_email,
                created_at=alert.created_at,
                severity=severity,
                severity_override=_severity_override_value(alert),
                host_id=host_id,
                hostname=hostname,
                user_comment=user_comment,
                last_comment=last_comment,
                last_comment_by=last_comment_by,
                last_comment_at=last_comment_at,
                queue_state=alert_policy_service.queue_state_for(alert.dismissed),
                policy_state=alert_policy.policy_state,
                allow_rule_id=alert_policy.allow_rule_id,
                allow_scope=alert_policy.allow_scope,
            )
        )

    # Enrich with SSH context: batch-fetch SSH data and SSH alert counts
    unique_ips = set(a.ip for a in alert_responses)
    ssh_data_cache = await ssh_service.get_latest_ssh_results_for_ips(db, unique_ips)
    ssh_alert_cache = await alerts_service.get_ssh_alert_summary_for_ips(db, unique_ips)

    for resp in alert_responses:
        port_key = resp.port or 0
        ssh_data = ssh_data_cache.get((resp.ip, port_key))
        if ssh_data:
            resp.ssh_summary = AlertSSHSummary(**ssh_data)
        ssh_alert_info = ssh_alert_cache.get((resp.ip, port_key))
        if ssh_alert_info:
            resp.related_ssh_alert_count = ssh_alert_info[0]
            resp.related_ssh_alerts_dismissed = ssh_alert_info[1]

    # Enrich with matching alert rules (unified)
    all_global_rules = await alert_rules_service.get_global_rules(db)
    # Collect unique network IDs for network-scoped rules
    alert_network_ids = set(r.network_id for r in alert_responses if r.network_id is not None)
    network_alert_rules_by_nid: dict[int, list[Any]] = {}
    for nid in alert_network_ids:
        network_alert_rules_by_nid[nid] = await alert_rules_service.get_rules_by_network_id(db, nid)
    # Fetch network names
    network_name_cache: dict[int, str] = {}
    for nid in alert_network_ids:
        net = await networks_service.get_network_by_id(db, nid)
        if net:
            network_name_cache[nid] = net.name

    for resp in alert_responses:
        matches: list[PortRuleMatch] = []
        resp_oid = finding_identifier_from_key(
            resp.source, resp.network_id, resp.ip, resp.port, resp.source_key
        )
        for rule in all_global_rules:
            if rule.source != resp.source:
                continue
            if resp.source == "port" and resp.port is not None:
                if not port_rule_matches_alert(rule, resp.ip, resp.port):
                    continue
            elif resp.source == "ssh":
                if not ssh_rule_matches_alert(rule, resp.ip, resp.port, resp.type.value):
                    continue
            elif resp.source in FINDING_SOURCES:
                if not finding_rule_matches_alert(rule, resp.ip, resp.port, resp_oid):
                    continue
            else:
                continue
            criteria_ip = rule.match_criteria.get("ip")
            matches.append(
                PortRuleMatch(
                    id=rule.id,
                    scope="global",
                    network_id=None,
                    network_name=None,
                    rule_type=rule.rule_type.value,
                    description=rule.description,
                    ip=criteria_ip,
                )
            )
        if resp.network_id and resp.network_id in network_alert_rules_by_nid:
            for rule in network_alert_rules_by_nid[resp.network_id]:
                if rule.source != resp.source:
                    continue
                if resp.source == "port" and resp.port is not None:
                    if not port_rule_matches_alert(rule, resp.ip, resp.port):
                        continue
                elif resp.source == "ssh":
                    if not ssh_rule_matches_alert(rule, resp.ip, resp.port, resp.type.value):
                        continue
                elif resp.source in FINDING_SOURCES:
                    if not finding_rule_matches_alert(rule, resp.ip, resp.port, resp_oid):
                        continue
                else:
                    continue
                criteria_ip = rule.match_criteria.get("ip")
                matches.append(
                    PortRuleMatch(
                        id=rule.id,
                        scope="network",
                        network_id=resp.network_id,
                        network_name=network_name_cache.get(resp.network_id),
                        rule_type=rule.rule_type.value,
                        description=rule.description,
                        ip=criteria_ip,
                    )
                )
        resp.matching_rules = matches

    # Compute severity counts across all matching alerts (not just current page)
    if policy_filtered is not None:
        severity_counts = _severity_counts_from_alerts(
            [alert for alert, _ in policy_filtered]
        )
    else:
        severity_counts = await _count_by_severity(
            db,
            alert_type=alert_type,
            source=source,
            network_id=network_id,
            dismissed=dismissed,
            ip=ip,
            port=port,
            search=search,
            start_date=start_date,
            end_date=end_date,
        )

    return AlertListResponse(alerts=alert_responses, total=total, severity_counts=severity_counts)


@router.get("/export/csv")
async def export_alerts_csv(
    user: CurrentUser,
    db: DbSession,
    alert_type: AlertType | None = Query(None, alias="type"),
    source: str | None = Query(None, max_length=10),
    network_id: int | None = Query(None, ge=1),
    dismissed: bool | None = Query(None),
    ip: str | None = Query(None),
    port: int | None = Query(None, ge=1, le=65535),
    search: str | None = Query(None, max_length=200),
) -> StreamingResponse:
    """Export alerts as CSV with optional filters."""
    # Get all alerts with filters (no pagination for export)
    alerts = await alerts_service.get_alerts(
        db,
        alert_type=alert_type,
        source=source,
        network_id=network_id,
        dismissed=dismissed,
        ip=ip,
        port=port,
        search=search,
        start_date=None,
        end_date=None,
        offset=0,
        limit=10000,  # Large limit for export
    )

    headers = ["Alert Type", "IP", "Port", "Network", "Status", "Created At"]
    rows = [
        [
            alert.alert_type.value,
            alert.ip,
            alert.port,
            network_name or "",
            "Dismissed" if alert.dismissed else "Open",
            alert.created_at.isoformat(),
        ]
        for alert, network_name in alerts
    ]
    return csv_response(rows, headers, f"alerts_{export_timestamp()}.csv")


@router.get("/export/pdf")
async def export_alerts_pdf(
    user: CurrentUser,
    db: DbSession,
    alert_type: AlertType | None = Query(None, alias="type"),
    source: str | None = Query(None, max_length=10),
    network_id: int | None = Query(None, ge=1),
    dismissed: bool | None = Query(None),
    ip: str | None = Query(None),
    port: int | None = Query(None, ge=1, le=65535),
    search: str | None = Query(None, max_length=200),
) -> StreamingResponse:
    """Export alerts as PDF with optional filters."""
    # Get all alerts with filters (no pagination for export)
    alerts = await alerts_service.get_alerts(
        db,
        alert_type=alert_type,
        source=source,
        network_id=network_id,
        dismissed=dismissed,
        ip=ip,
        port=port,
        search=search,
        start_date=None,
        end_date=None,
        offset=0,
        limit=10000,  # Large limit for export
    )

    total_alerts = len(alerts)
    by_type: dict[str, int] = {}
    dismissed_count = 0
    for alert, _ in alerts:
        by_type[alert.alert_type.value] = by_type.get(alert.alert_type.value, 0) + 1
        if alert.dismissed:
            dismissed_count += 1
    open_count = total_alerts - dismissed_count

    buffer, doc = new_pdf_buffer()
    with build_pdf("Alerts Report") as (elements, styles):
        summary_lines = [
            f"<b>Total alerts:</b> {total_alerts}",
            f"<b>Open:</b> {open_count}",
            f"<b>Dismissed:</b> {dismissed_count}",
        ]
        if by_type:
            summary_lines.append("<b>By type:</b>")
            for alert_type_name, count in sorted(by_type.items()):
                summary_lines.append(f"  \u2022 {alert_type_name}: {count}")

        elements.append(
            Paragraph(
                "<b>Summary Statistics</b><br/>" + "<br/>".join(summary_lines), styles["Heading2"]
            )
        )
        elements.append(Spacer(1, 0.3 * inch))

        table_rows = [
            [
                alert.alert_type.value,
                alert.ip,
                str(alert.port),
                network_name or "",
                "Dismissed" if alert.dismissed else "Open",
                alert.created_at.strftime("%Y-%m-%d %H:%M"),
            ]
            for alert, network_name in alerts
        ]
        col_widths = [1.3 * inch, 1.2 * inch, 0.7 * inch, 1.3 * inch, 1.2 * inch, 1.3 * inch]
        elements.append(
            make_pdf_table(
                ["Alert Type", "IP", "Port", "Network", "Status", "Created At"],
                table_rows,
                col_widths,
                "No alerts found matching the filters.",
            )
        )

    doc.build(elements)
    return pdf_response(buffer, f"alerts_{export_timestamp()}.pdf")


@router.get("/dismiss-suggestions", response_model=DismissSuggestionsResponse)
async def get_dismiss_suggestions(
    user: CurrentUser,
    db: DbSession,
    port: int | None = Query(None, ge=1, le=65535),
    search: str | None = Query(None, max_length=200),
    limit: int = Query(20, ge=1, le=50),
) -> DismissSuggestionsResponse:
    """Get previously used dismiss reasons as suggestions, ranked by port affinity."""
    suggestions = await alerts_service.get_dismiss_reason_suggestions(
        db, port=port, search=search, limit=limit
    )
    return DismissSuggestionsResponse(suggestions=suggestions)
