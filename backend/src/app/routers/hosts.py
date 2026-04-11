"""Hosts API endpoint."""

from datetime import datetime
from ipaddress import ip_network

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, Spacer

from app.core.deps import AnalystUser, CurrentUser, DbSession, OperatorUser
from app.lib.export import (
    build_pdf,
    csv_response,
    export_timestamp,
    make_pdf_table,
    new_pdf_buffer,
    pdf_response,
)
from app.lib.ip_utils import parse_ip_range
from app.schemas.host import (
    BulkDeleteHostsRequest,
    BulkDeleteHostsResponse,
    EnrichedHostPort,
    HostAlertSummary,
    HostListResponse,
    HostNetworkInfo,
    HostOpenPortListResponse,
    HostOpenPortResponse,
    HostOverviewResponse,
    HostResponse,
    HostRiskTrendResponse,
    HostScanEntry,
    HostSSHSummary,
    HostUpdateRequest,
    PortRuleMatch,
)
from app.schemas.hostname_lookup import CacheEntryHostnamesResponse
from app.schemas.scan import HostRescanRequest, ScanTriggerResponse
from app.schemas.vulnerability import VulnerabilityListResponse, VulnerabilitySeverityLabel
from app.services import global_open_ports as global_ports_service
from app.services import hosts as hosts_service
from app.services.hostname_lookup import get_cache_row_for_ip
from app.services.vulnerability_results import get_vulnerabilities_for_host

router = APIRouter(prefix="/api/hosts", tags=["hosts"])


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

    # Build response with open port counts (single batch query)
    port_counts = await hosts_service.get_open_port_counts_for_hosts(
        db, [host.id for host in hosts],
    )
    host_responses = []
    for host in hosts:
        response = HostResponse.model_validate(host)
        response.open_port_count = port_counts.get(host.id, 0)
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


@router.get(
    "/{host_id}/hostnames",
    response_model=CacheEntryHostnamesResponse,
)
async def get_host_hostnames(
    user: CurrentUser,  # noqa: ARG001 — auth gate, any user can read
    db: DbSession,
    host_id: int,
) -> CacheEntryHostnamesResponse:
    """Return cached vhost list for a host's IP.

    Reads the ``hostname_lookup_cache`` row for this host's IP and
    returns the stored hostname list plus row metadata (source,
    queried_at, expires_at). The host detail page uses this to render
    the "Known Hostnames" panel — shows the vhosts nuclei will fan
    out over if SNI fan-out is enabled on the network.

    Returns an empty list (not 404) when the host has no cache row
    yet — the filler hasn't reached it — so the UI can distinguish
    "not enriched yet" from "no such host".
    """
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )

    row = await get_cache_row_for_ip(db, host.ip)
    if row is None:
        return CacheEntryHostnamesResponse(
            ip=host.ip,
            hostnames=[],
            source=None,
            queried_at=None,
            expires_at=None,
        )
    return CacheEntryHostnamesResponse(
        ip=host.ip,
        hostnames=list(row.hostnames_json or []),
        source=row.source,
        queried_at=row.queried_at,
        expires_at=row.expires_at,
    )


@router.get("/{host_id}/ports", response_model=HostOpenPortListResponse)
async def get_host_ports(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
    staleness: str = Query("all", pattern="^(all|active|stale)$"),
) -> HostOpenPortListResponse:
    """Get open ports for a specific host."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    ports = await hosts_service.get_host_open_ports(db, host_id)
    latest_scan_times = await global_ports_service.get_latest_scan_times_by_network(db)

    result_ports: list[HostOpenPortResponse] = []
    for port in ports:
        port_networks = port.seen_by_networks or []
        is_stale = global_ports_service.compute_port_staleness(
            port.last_seen_at,
            port_networks,
            latest_scan_times,
        )
        if staleness == "active" and is_stale:
            continue
        if staleness == "stale" and not is_stale:
            continue
        port_response = HostOpenPortResponse.model_validate(port)
        port_response.is_stale = is_stale
        result_ports.append(port_response)

    return HostOpenPortListResponse(ports=result_ports)


def _resolve_effective_rule(rules: list[PortRuleMatch]) -> str | None:
    """Pick the winning rule type by specificity. IP-specific > port-only.

    At the same specificity level, 'accepted' wins over 'critical'
    because it represents an explicit user override.
    """
    if not rules:
        return None
    best_score = 0
    best_type: str | None = None
    for r in rules:
        score = 2 if r.ip else 1
        if score > best_score or (score == best_score and r.rule_type == "accepted"):
            best_score = score
            best_type = r.rule_type
    return best_type


@router.get("/{host_id}/overview", response_model=HostOverviewResponse)
async def get_host_overview(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostOverviewResponse:
    """Get aggregated overview dashboard data for a specific host."""
    from app.models.alert import Alert, AlertType
    from app.services import alert_rules as alert_rules_service
    from app.services import alerts as alerts_service
    from app.services import networks as networks_service
    from app.services import scans as scans_service
    from app.services import ssh_results as ssh_service
    from app.services.alert_rules import is_port_blocked, port_rule_matches_alert

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

    # Networks
    network_infos = []
    network_map: dict[int, str] = {}
    for nid in host.seen_by_networks or []:
        net = await networks_service.get_network_by_id(db, nid)
        if net:
            network_infos.append(HostNetworkInfo(id=net.id, name=net.name, cidr=net.cidr))
            network_map[net.id] = net.name

    # Batch-fetch SSH data and SSH alert counts for this host
    host_ips = {host.ip}
    ssh_data_cache = await ssh_service.get_latest_ssh_results_for_ips(db, host_ips)
    ssh_alert_cache = await alerts_service.get_ssh_alert_summary_for_ips(db, host_ips)

    def _build_alert_summary(
        alert: Alert,
        severity: str,
        alert_network_name: str | None = None,
    ) -> HostAlertSummary:
        alert_port_key = alert.port or 0
        ssh_data = ssh_data_cache.get((alert.ip, alert_port_key))
        host_ssh = None
        if ssh_data:
            host_ssh = HostSSHSummary(**ssh_data)
        ssh_info = ssh_alert_cache.get((alert.ip, alert_port_key))
        return HostAlertSummary(
            id=alert.id,
            type=alert.alert_type.value,
            port=alert.port,
            message=alert.message,
            severity=severity,
            dismissed=alert.dismissed,
            created_at=alert.created_at,
            dismiss_reason=alert.dismiss_reason,
            network_id=alert.network_id,
            network_name=(
                alert_network_name or network_map.get(alert.network_id, None)
                if alert.network_id
                else None
            ),
            ssh_summary=host_ssh,
            related_ssh_alert_count=ssh_info[0] if ssh_info else 0,
            related_ssh_alerts_dismissed=ssh_info[1] if ssh_info else True,
        )

    # Alerts (not dismissed)
    active_alerts_raw = await alerts_service.get_alerts(
        db,
        ip=host.ip,
        dismissed=False,
        limit=100,
    )
    alert_summaries = []
    for alert, alert_net_name in active_alerts_raw:
        severity = "medium"
        if alert.port is not None and await is_port_blocked(db, alert.ip, alert.port):
            severity = "critical"
        elif alert.alert_type in (AlertType.NEW_PORT,):
            severity = "high"
        elif alert.alert_type in (
            AlertType.SSH_INSECURE_AUTH,
            AlertType.SSH_WEAK_CIPHER,
            AlertType.SSH_WEAK_KEX,
            AlertType.SSH_OUTDATED_VERSION,
            AlertType.SSH_CONFIG_REGRESSION,
        ):
            severity = "high"
        alert_summaries.append(_build_alert_summary(alert, severity, alert_net_name))

    # Dismissed alerts
    dismissed_all = await alerts_service.get_alerts(
        db,
        ip=host.ip,
        dismissed=True,
        limit=10000,
    )
    dismissed_count = len(dismissed_all)
    dismissed_summaries = []
    for dismissed_alert, dismissed_net_name in dismissed_all:
        summary = _build_alert_summary(dismissed_alert, "info", dismissed_net_name)
        dismissed_summaries.append(summary)

    # SSH summary — reuse the batch cache we already fetched
    ssh_summary = None
    for (ip, port), ssh_data in ssh_data_cache.items():
        if ip == host.ip:
            ssh_summary = HostSSHSummary(**ssh_data)
            break

    # Recent scans (from networks this host belongs to)
    scan_entries = []
    for nid in host.seen_by_networks or []:
        net = await networks_service.get_network_by_id(db, nid)
        if not net:
            continue
        scans = await scans_service.get_scans_by_network_id(db, nid, offset=0, limit=5)
        for scan, scan_port_count in scans:
            scan_entries.append(
                HostScanEntry(
                    id=scan.id,
                    network_id=nid,
                    network_name=net.name,
                    status=scan.status.value if hasattr(scan.status, "value") else str(scan.status),
                    started_at=scan.started_at,
                    completed_at=scan.completed_at,
                    trigger_type=(
                        scan.trigger_type.value
                        if hasattr(scan.trigger_type, "value")
                        else str(scan.trigger_type)
                    ),
                    port_count=scan_port_count,
                )
            )
    # Sort by most recent first and limit to 10
    scan_entries.sort(key=lambda s: s.started_at or datetime.min, reverse=True)
    scan_entries = scan_entries[:10]

    # --- Build per-port enrichments ---
    # Fetch alert rules (global + network-scoped, port source)
    from app.models.alert_rule import AlertRule

    global_rules = await alert_rules_service.get_global_rules(db, source="port")
    network_rules_tuples: list[tuple[AlertRule, int, str]] = []
    for nid in host.seen_by_networks or []:
        net_name = network_map.get(nid, "")
        for rule in await alert_rules_service.get_rules_by_network_id(db, nid, source="port"):
            network_rules_tuples.append((rule, nid, net_name))

    # Index alerts by (ip, port) for quick lookup
    all_alert_list = list(active_alerts_raw) + list(dismissed_all)
    alert_by_port: dict[int, tuple[Alert, str]] = {}
    for alert, _net in all_alert_list:
        if alert.port is None:
            continue
        if alert.port not in alert_by_port:
            # Prefer non-dismissed alert
            alert_by_port[alert.port] = (alert, "dismissed" if alert.dismissed else "new")
        elif not alert.dismissed:
            alert_by_port[alert.port] = (alert, "new")

    def _find_matching_rules(port_ip: str, port_num: int) -> list[PortRuleMatch]:
        matches: list[PortRuleMatch] = []
        for rule in global_rules:
            if not port_rule_matches_alert(rule, port_ip, port_num):
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
        for rule, nid, nname in network_rules_tuples:
            if not port_rule_matches_alert(rule, port_ip, port_num):
                continue
            criteria_ip = rule.match_criteria.get("ip")
            matches.append(
                PortRuleMatch(
                    id=rule.id,
                    scope="network",
                    network_id=nid,
                    network_name=nname,
                    rule_type=rule.rule_type.value,
                    description=rule.description,
                    ip=criteria_ip,
                )
            )
        return matches

    latest_scan_times = await global_ports_service.get_latest_scan_times_by_network(db)

    enriched_ports: list[EnrichedHostPort] = []
    all_matching_rules: list[PortRuleMatch] = []
    for p in ports:
        rules = _find_matching_rules(p.ip, p.port)
        all_matching_rules.extend(rules)
        # Determine effective rule by specificity (IP-specific > port-only)
        rule_status = _resolve_effective_rule(rules)
        # Alert status
        alert_info = alert_by_port.get(p.port)
        alert_id: int | None = None
        alert_status: str | None = None
        alert_severity: str | None = None
        dismiss_reason: str | None = None
        if alert_info:
            a, a_status = alert_info
            alert_id = a.id
            alert_status = a_status
            dismiss_reason = a.dismiss_reason
            # Compute severity
            if rule_status == "critical":
                alert_severity = "critical"
            elif a.alert_type == AlertType.NEW_PORT:
                alert_severity = "high"
            else:
                alert_severity = "medium"
        # SSH
        port_ssh_data = ssh_data_cache.get((host.ip, p.port))
        port_ssh = HostSSHSummary(**port_ssh_data) if port_ssh_data else None

        port_networks = getattr(p, "seen_by_networks", None) or (host.seen_by_networks or [])
        port_is_stale = global_ports_service.compute_port_staleness(
            p.last_seen_at,
            port_networks,
            latest_scan_times,
        )

        enriched_ports.append(
            EnrichedHostPort(
                id=p.id,
                ip=p.ip,
                port=p.port,
                protocol=p.protocol,
                banner=p.banner,
                service_guess=p.service_guess,
                user_comment=getattr(p, "user_comment", None),
                first_seen_at=p.first_seen_at,
                last_seen_at=p.last_seen_at,
                alert_id=alert_id,
                alert_status=alert_status,
                alert_severity=alert_severity,
                dismiss_reason=dismiss_reason,
                rule_status=rule_status,
                matching_rules=rules,
                ssh_summary=port_ssh,
                is_stale=port_is_stale,
            )
        )

    # Deduplicate all_matching_rules by (scope, id)
    seen_rules: set[tuple[str, int]] = set()
    deduped_rules: list[PortRuleMatch] = []
    for r in all_matching_rules:
        key = (r.scope, r.id)
        if key not in seen_rules:
            seen_rules.add(key)
            deduped_rules.append(r)

    return HostOverviewResponse(
        host=host_response,
        ports=enriched_ports,
        networks=network_infos,
        alerts=alert_summaries,
        dismissed_alerts=dismissed_summaries,
        dismissed_alert_count=dismissed_count,
        ssh=ssh_summary,
        recent_scans=scan_entries,
        matching_rules=deduped_rules,
    )


@router.get("/{host_id}/risk-trend", response_model=HostRiskTrendResponse)
async def get_host_risk_trend(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostRiskTrendResponse:
    """Get historical risk score trend for a host over the last 14 days."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    points = await hosts_service.get_host_risk_trend(db, host.ip)
    return HostRiskTrendResponse(points=points)


@router.get("/{host_id}/vulnerabilities", response_model=VulnerabilityListResponse)
async def get_host_vulnerabilities(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
    severity_label: VulnerabilitySeverityLabel | None = Query(None),
) -> VulnerabilityListResponse:
    """Get GVM vulnerability results for a host, deduped by OID."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    return await get_vulnerabilities_for_host(db, host, severity_label)


@router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    admin: OperatorUser,
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
    admin: OperatorUser,
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
    admin: OperatorUser,
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
    user: AnalystUser,
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

    def _pingable_status(h: object) -> str:
        pingable = getattr(h, "is_pingable", None)
        if pingable is None:
            return "Unknown"
        return "Up" if pingable else "Down"

    port_counts = await hosts_service.get_open_port_counts_for_hosts(
        db, [host.id for host in hosts],
    )
    rows = []
    for host in hosts:
        rows.append(
            [
                host.ip,
                host.hostname or "",
                _pingable_status(host),
                "",  # OS Guess - not available in current Host model
                host.first_seen_at.isoformat() if host.first_seen_at else "",
                host.last_seen_at.isoformat() if host.last_seen_at else "",
                port_counts.get(host.id, 0),
            ]
        )
    return csv_response(
        rows,
        ["IP", "Hostname", "Status", "OS Guess", "First Seen", "Last Seen", "Open Ports Count"],
        f"hosts_{export_timestamp()}.csv",
    )


@router.get("/export/pdf")
async def export_hosts_pdf(
    user: AnalystUser,
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

    def _pingable_status_pdf(h: object) -> str:
        pingable = getattr(h, "is_pingable", None)
        if pingable is None:
            return "Unknown"
        return "Up" if pingable else "Down"

    total_hosts = len(hosts)
    status_counts = {"Up": 0, "Down": 0, "Unknown": 0}
    for host in hosts:
        status_counts[_pingable_status_pdf(host)] += 1

    buffer, doc = new_pdf_buffer()
    with build_pdf("Host Inventory Report") as (elements, styles):
        elements.append(
            Paragraph(
                f"<b>Summary Statistics:</b><br/>"
                f"Total Hosts: {total_hosts}<br/>"
                f"Up: {status_counts['Up']}<br/>"
                f"Down: {status_counts['Down']}<br/>"
                f"Unknown: {status_counts['Unknown']}",
                styles["Normal"],
            )
        )
        elements.append(Spacer(1, 0.3 * inch))

        port_counts = await hosts_service.get_open_port_counts_for_hosts(
            db, [host.id for host in hosts],
        )
        table_rows = []
        for host in hosts:
            table_rows.append(
                [
                    host.ip,
                    host.hostname or "",
                    _pingable_status_pdf(host),
                    host.first_seen_at.strftime("%Y-%m-%d %H:%M") if host.first_seen_at else "N/A",
                    host.last_seen_at.strftime("%Y-%m-%d %H:%M") if host.last_seen_at else "N/A",
                    str(port_counts.get(host.id, 0)),
                ]
            )

        col_widths = [1.2 * inch, 1.5 * inch, 0.8 * inch, 1.2 * inch, 1.2 * inch, 0.8 * inch]
        elements.append(
            make_pdf_table(
                ["IP", "Hostname", "Status", "First Seen", "Last Seen", "Open Ports"],
                table_rows,
                col_widths,
                "No hosts found.",
            )
        )

    doc.build(elements)
    return pdf_response(buffer, f"hosts_{export_timestamp()}.pdf")


@router.post("/{host_ip}/rescan", response_model=ScanTriggerResponse)
async def trigger_host_rescan(
    admin: OperatorUser,
    db: DbSession,
    host_ip: str,
    body: HostRescanRequest | None = None,
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
        ip_address(host_ip)
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

    # Build per-scan overrides from request body (only non-None fields)
    overrides_raw = {k: v for k, v in body.model_dump().items() if v is not None} if body else {}
    # nse_profile_id is a real column, not a JSON override
    nse_template_id = overrides_raw.pop("nse_profile_id", None)
    overrides = overrides_raw or None

    # Create a single-host scan
    scan = await scans_service.create_single_host_scan(
        db, network, host_ip, scan_overrides=overrides, nse_template_id=nse_template_id
    )
    await db.commit()

    return ScanTriggerResponse(
        scan_id=scan.id,
        network_id=network.id,
        status="planned",
        trigger_type="manual",
        message=f"Single-host scan triggered for {host_ip}",
    )
