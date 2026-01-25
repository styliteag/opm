"""Alerts management endpoints."""

from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Query, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.alert import AlertType
from app.models.global_port_rule import GlobalRuleType
from app.models.port_rule import RuleType
from app.schemas.alert import (
    AlertBulkAcknowledgeResponse,
    AlertBulkWhitelistRequest,
    AlertBulkWhitelistResponse,
    AlertListResponse,
    AlertResponse,
    Severity,
)
from app.services import alerts as alerts_service
from app.services import global_port_rules as global_rules_service
from app.services import networks as networks_service
from app.services import port_rules as port_rules_service
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

    return Severity.MEDIUM


@router.get("", response_model=AlertListResponse)
async def list_alerts(
    user: CurrentUser,
    db: DbSession,
    alert_type: AlertType | None = Query(None, alias="type"),
    network_id: int | None = Query(None, ge=1),
    acknowledged: bool | None = Query(None),
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
        start_date=start_date,
        end_date=end_date,
        offset=offset,
        limit=limit,
    )

    # Compute severity for each alert
    alert_responses = []
    for alert, network_name in alerts:
        severity = await compute_alert_severity(
            db, alert.alert_type, alert.ip, alert.port, alert.acknowledged
        )
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
                created_at=alert.created_at,
                severity=severity,
            )
        )

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

    return AlertListResponse(alerts=alert_responses)


@router.put("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    admin: AdminUser,
    db: DbSession,
    alert_id: int,
) -> AlertResponse:
    """Acknowledge a single alert (admin only)."""
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    alert = await alerts_service.acknowledge_alert(db, alert)
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
        created_at=alert.created_at,
        severity=severity,
    )


@router.put(
    "/acknowledge-bulk",
    response_model=AlertBulkAcknowledgeResponse,
)
async def acknowledge_alerts_bulk(
    admin: AdminUser,
    db: DbSession,
    alert_ids: list[int] = Body(...),
) -> AlertBulkAcknowledgeResponse:
    """Acknowledge multiple alerts (admin only)."""
    if not alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    unique_ids = sorted(set(alert_ids))
    alerts = await alerts_service.get_alerts_by_ids(db, unique_ids)
    await alerts_service.acknowledge_alerts(db, alerts)
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
                rule_type=GlobalRuleType.ALLOW,
                ip=ip,
                description=request.reason.strip(),
                created_by=admin.id,
            )
            whitelisted_count += 1
        except Exception as e:
            errors.append(f"Failed to whitelist {ip}:{port}: {str(e)}")

    # Acknowledge all alerts
    await alerts_service.acknowledge_alerts(db, alerts)
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
    alerts_by_network: dict[int, list] = {}
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
                    rule_type=RuleType.ALLOW,
                    ip=ip,
                    description=request.reason.strip(),
                )
                whitelisted_count += 1
            except Exception as e:
                errors.append(f"Failed to whitelist {ip}:{port} on network {network_id}: {str(e)}")

    # Acknowledge all alerts
    await alerts_service.acknowledge_alerts(db, alerts)
    await db.commit()

    acknowledged_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(acknowledged_ids))

    return AlertBulkWhitelistResponse(
        whitelisted_count=whitelisted_count,
        acknowledged_ids=acknowledged_ids,
        missing_ids=missing_ids,
        errors=errors,
    )
