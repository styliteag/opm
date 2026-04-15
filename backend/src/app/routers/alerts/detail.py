"""Single alert detail endpoint and severity computation helper."""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.models.alert import AlertType
from app.schemas.alert import (
    AlertResponse,
    AlertSSHSummary,
    Severity,
)
from app.schemas.host import PortRuleMatch
from app.services import alert_comments as alert_comments_service
from app.services import alert_rules as alert_rules_service
from app.services import alerts as alerts_service
from app.services import hosts as hosts_service
from app.services import networks as networks_service
from app.services import ssh_results as ssh_service
from app.services import users as users_service
from app.services.alert_rules import (
    is_port_blocked,
    port_rule_matches_alert,
    ssh_rule_matches_alert,
)

router = APIRouter()


def _severity_override_value(
    alert: Any,
) -> Severity | None:
    """Convert DB severity_override string to Severity enum."""
    if alert.severity_override:
        return Severity(alert.severity_override)
    return None


async def compute_alert_severity(
    db: DbSession,
    alert_type: AlertType,
    ip: str,
    port: int,
    severity_override: str | None = None,
) -> Severity:
    """Compute alert severity based on rules, status, or user override."""
    if severity_override is not None:
        try:
            return Severity(severity_override)
        except ValueError:
            pass

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


@router.get("/{alert_id}", response_model=AlertResponse)
async def get_alert(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
) -> AlertResponse:
    """Get a single alert by ID with full enrichment."""
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if not alert_with_network:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    alert, network_name = alert_with_network

    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port or 0, alert.severity_override
    )

    # Host info
    host = await hosts_service.get_host_by_ip(db, alert.ip)
    host_id = host.id if host else None
    hostname = host.hostname if host else None
    user_comment = host.user_comment if host else None

    # Assigned user email
    assigned_to_email = None
    if alert.assigned_to_user_id:
        u = await users_service.get_user_by_id(db, alert.assigned_to_user_id)
        if u:
            assigned_to_email = u.email

    # Latest comment
    latest_comments = await alert_comments_service.get_latest_comments_for_alerts(db, [alert.id])
    comment_info = latest_comments.get(alert.id)

    resp = AlertResponse(
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
        last_comment=comment_info[0] if comment_info else None,
        last_comment_by=comment_info[1] if comment_info else None,
        last_comment_at=comment_info[2] if comment_info else None,
    )

    # SSH enrichment
    ssh_data_cache = await ssh_service.get_latest_ssh_results_for_ips(db, {alert.ip})
    ssh_port = alert.port or 0
    ssh_data = ssh_data_cache.get((alert.ip, ssh_port))
    if ssh_data:
        resp.ssh_summary = AlertSSHSummary(**ssh_data)
    ssh_alert_cache = await alerts_service.get_ssh_alert_summary_for_ips(db, {alert.ip})
    ssh_alert_info = ssh_alert_cache.get((alert.ip, ssh_port))
    if ssh_alert_info:
        resp.related_ssh_alert_count = ssh_alert_info[0]
        resp.related_ssh_alerts_dismissed = ssh_alert_info[1]

    # Matching alert rules (unified)
    all_global_rules = await alert_rules_service.get_global_rules(db)
    matches: list[PortRuleMatch] = []
    for rule in all_global_rules:
        if rule.source != alert.source:
            continue
        if alert.source == "port" and alert.port is not None:
            if not port_rule_matches_alert(rule, alert.ip, alert.port):
                continue
        elif alert.source == "ssh":
            if not ssh_rule_matches_alert(rule, alert.ip, alert.port, alert.alert_type.value):
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
    if alert.network_id:
        net_rules = await alert_rules_service.get_rules_by_network_id(db, alert.network_id)
        net = await networks_service.get_network_by_id(db, alert.network_id)
        net_name = net.name if net else None
        for rule in net_rules:
            if rule.source != alert.source:
                continue
            if alert.source == "port" and alert.port is not None:
                if not port_rule_matches_alert(rule, alert.ip, alert.port):
                    continue
            elif alert.source == "ssh":
                if not ssh_rule_matches_alert(rule, alert.ip, alert.port, alert.alert_type.value):
                    continue
            else:
                continue
            criteria_ip = rule.match_criteria.get("ip")
            matches.append(
                PortRuleMatch(
                    id=rule.id,
                    scope="network",
                    network_id=alert.network_id,
                    network_name=net_name,
                    rule_type=rule.rule_type.value,
                    description=rule.description,
                    ip=criteria_ip,
                )
            )
    resp.matching_rules = matches

    return resp
