"""Alert dismiss, reopen, delete, and accept endpoints."""

import json as _json

from fastapi import APIRouter, Body, HTTPException, status
from sqlalchemy import select as sa_select
from sqlalchemy import update as sa_update

from app.core.deps import AnalystUser, DbSession, OperatorUser
from app.models.alert import Alert, AlertType
from app.models.alert_event import AlertEventType
from app.models.alert_rule import RuleType as AlertRuleType
from app.schemas.alert import (
    AlertBulkAcceptRequest,
    AlertBulkAcceptResponse,
    AlertBulkDismissResponse,
    AlertBulkReopenRequest,
    AlertBulkReopenResponse,
    AlertResponse,
    BulkDeleteRequest,
    BulkDeleteResponse,
    BulkDismissRequest,
    DismissRequest,
)
from app.services import alert_comments as alert_comments_service
from app.services import alert_rules as alert_rules_service
from app.services import alerts as alerts_service
from app.services import networks as networks_service
from app.services import ssh_results as ssh_service
from app.services.alert_events import emit_event
from app.services.alerts import (
    DEFAULT_SSH_VERSION_THRESHOLD,
    _extract_weak_algorithms,
    _is_version_outdated,
)

from .detail import _severity_override_value, compute_alert_severity

router = APIRouter()


@router.put("/{alert_id}/dismiss", response_model=AlertResponse)
async def dismiss_alert(
    admin: AnalystUser,
    db: DbSession,
    alert_id: int,
    request: DismissRequest | None = None,
) -> AlertResponse:
    """Dismiss a single alert (admin only).

    When include_ssh_findings=True, also dismisses related SSH security
    alerts for the same ip:port (creating them on-the-fly if needed).
    """
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    reason = request.reason if request else None
    include_ssh = request.include_ssh_findings if request else False
    resolution_status = request.resolution_status if request else None
    alert = await alerts_service.dismiss_alert(
        db, alert, dismiss_reason=reason, resolution_status=resolution_status
    )

    # Auto-create comment if reason provided
    if reason:
        await alert_comments_service.create_comment(
            db, alert_id=alert.id, user_id=admin.id, comment=reason
        )

        # Propagate reason to GlobalOpenPort and Host
        await alerts_service.propagate_dismiss_reason_to_port_and_host(db, alert, reason)

    # Unified dismiss: also dismiss SSH findings for the same ip:port
    ssh_alert_count = 0
    ssh_all_acked = True
    if include_ssh and alert.port is not None:
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
            has_insecure = ssh_result.password_enabled or ssh_result.keyboard_interactive_enabled
            if has_insecure and AlertType.SSH_INSECURE_AUTH not in existing_types:
                auth_methods = []
                if ssh_result.password_enabled:
                    auth_methods.append("password")
                if ssh_result.keyboard_interactive_enabled:
                    auth_methods.append("keyboard-interactive")
                new_alert = Alert(
                    scan_id=ssh_result.scan_id,
                    network_id=alert.network_id,
                    alert_type=AlertType.SSH_INSECURE_AUTH,
                    ip=alert.ip,
                    port=alert.port,
                    message=(
                        f"SSH server allows insecure authentication methods: "
                        f"{', '.join(auth_methods)} on {alert.ip}:{alert.port}"
                    ),
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            weak_ciphers = _extract_weak_algorithms(ssh_result.supported_ciphers)
            if weak_ciphers and AlertType.SSH_WEAK_CIPHER not in existing_types:
                new_alert = Alert(
                    scan_id=ssh_result.scan_id,
                    network_id=alert.network_id,
                    alert_type=AlertType.SSH_WEAK_CIPHER,
                    ip=alert.ip,
                    port=alert.port,
                    message=(
                        f"SSH server supports weak ciphers: "
                        f"{', '.join(weak_ciphers)} on {alert.ip}:{alert.port}"
                    ),
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            weak_kex = _extract_weak_algorithms(ssh_result.kex_algorithms)
            if weak_kex and AlertType.SSH_WEAK_KEX not in existing_types:
                new_alert = Alert(
                    scan_id=ssh_result.scan_id,
                    network_id=alert.network_id,
                    alert_type=AlertType.SSH_WEAK_KEX,
                    ip=alert.ip,
                    port=alert.port,
                    message=(
                        f"SSH server supports weak key exchange algorithms: "
                        f"{', '.join(weak_kex)} on {alert.ip}:{alert.port}"
                    ),
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            is_outdated = _is_version_outdated(
                ssh_result.ssh_version, DEFAULT_SSH_VERSION_THRESHOLD
            )
            if is_outdated and AlertType.SSH_OUTDATED_VERSION not in existing_types:
                new_alert = Alert(
                    scan_id=ssh_result.scan_id,
                    network_id=alert.network_id,
                    alert_type=AlertType.SSH_OUTDATED_VERSION,
                    ip=alert.ip,
                    port=alert.port,
                    message=(
                        f"SSH server running outdated version: "
                        f"{ssh_result.ssh_version or 'unknown'} on {alert.ip}:{alert.port}"
                    ),
                )
                db.add(new_alert)
                await db.flush()
                ssh_alert_ids.append(new_alert.id)

            # Dismiss all SSH alerts
            if ssh_alert_ids:
                dismiss_values: dict[str, object] = {"dismissed": True}
                if reason:
                    dismiss_values["dismiss_reason"] = reason
                await db.execute(
                    sa_update(Alert).where(Alert.id.in_(ssh_alert_ids)).values(**dismiss_values)
                )
                ssh_alert_count = len(ssh_alert_ids)
                ssh_all_acked = True
                for ssh_id in ssh_alert_ids:
                    await emit_event(
                        db,
                        alert_id=ssh_id,
                        event_type=AlertEventType.DISMISSED,
                        user_id=admin.id,
                        description=reason,
                    )

    await emit_event(
        db,
        alert_id=alert.id,
        event_type=AlertEventType.DISMISSED,
        user_id=admin.id,
        description=reason,
    )
    await db.commit()

    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port or 0, alert.severity_override
    )

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        source=alert.source,
        network_id=alert.network_id,
        network_name=network_name,
        global_open_port_id=alert.global_open_port_id,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        dismissed=alert.dismissed,
        dismiss_reason=alert.dismiss_reason,
        created_at=alert.created_at,
        severity=severity,
        severity_override=_severity_override_value(alert),
        related_ssh_alert_count=ssh_alert_count,
        related_ssh_alerts_dismissed=ssh_all_acked,
    )


@router.post(
    "/bulk-dismiss",
    response_model=AlertBulkDismissResponse,
)
async def dismiss_alerts_bulk(
    admin: AnalystUser,
    db: DbSession,
    request: BulkDismissRequest = Body(...),
) -> AlertBulkDismissResponse:
    """Dismiss multiple alerts (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    unique_ids = sorted(set(request.alert_ids))
    alerts = await alerts_service.get_alerts_by_ids(db, unique_ids)
    reason = request.reason.strip() if request.reason else None

    # Set dismiss_reason and resolution_status on each alert, then dismiss
    for alert in alerts:
        if reason:
            alert.dismiss_reason = reason
        if request.resolution_status is not None:
            alert.resolution_status = request.resolution_status
    await alerts_service.dismiss_alerts(db, alerts)

    # Auto-create comments and propagate reason to GlobalOpenPort/Host
    if reason:
        for alert in alerts:
            await alert_comments_service.create_comment(
                db, alert_id=alert.id, user_id=admin.id, comment=reason
            )
            await alerts_service.propagate_dismiss_reason_to_port_and_host(db, alert, reason)

    for alert in alerts:
        await emit_event(
            db,
            alert_id=alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin.id,
            description=reason,
        )

    await db.commit()

    dismissed_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(dismissed_ids))

    return AlertBulkDismissResponse(
        dismissed_ids=dismissed_ids,
        missing_ids=missing_ids,
    )


@router.post(
    "/bulk-delete",
    response_model=BulkDeleteResponse,
)
async def delete_alerts_bulk(
    admin: AnalystUser,
    db: DbSession,
    request: BulkDeleteRequest = Body(...),
) -> BulkDeleteResponse:
    """Permanently delete multiple alerts (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    unique_ids = sorted(set(request.alert_ids))
    deleted_ids, missing_ids = await alerts_service.delete_alerts_by_ids(db, unique_ids)
    await db.commit()

    return BulkDeleteResponse(
        deleted_ids=deleted_ids,
        missing_ids=missing_ids,
    )


@router.put("/{alert_id}/reopen", response_model=AlertResponse)
async def reopen_alert(
    admin: AnalystUser,
    db: DbSession,
    alert_id: int,
) -> AlertResponse:
    """Reopen a single alert (admin only)."""
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    alert = await alerts_service.reopen_alert(db, alert)
    await emit_event(
        db,
        alert_id=alert.id,
        event_type=AlertEventType.REOPENED,
        user_id=admin.id,
    )
    await db.commit()

    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port or 0, alert.severity_override
    )

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        source=alert.source,
        network_id=alert.network_id,
        network_name=network_name,
        global_open_port_id=alert.global_open_port_id,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        dismissed=alert.dismissed,
        dismiss_reason=alert.dismiss_reason,
        created_at=alert.created_at,
        severity=severity,
        severity_override=_severity_override_value(alert),
    )


@router.put("/bulk-reopen", response_model=AlertBulkReopenResponse)
async def bulk_reopen_alerts(
    admin: AnalystUser,
    db: DbSession,
    request: AlertBulkReopenRequest = Body(...),
) -> AlertBulkReopenResponse:
    """Bulk reopen dismissed alerts (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    unique_ids = sorted(set(request.alert_ids))
    reopened_ids: list[int] = []
    missing_ids: list[int] = []

    for alert_id in unique_ids:
        result = await alerts_service.get_alert_with_network_name(db, alert_id)
        if result is None:
            missing_ids.append(alert_id)
            continue
        alert, _ = result
        if not alert.dismissed:
            missing_ids.append(alert_id)
            continue
        await alerts_service.reopen_alert(db, alert)
        await emit_event(
            db,
            alert_id=alert_id,
            event_type=AlertEventType.REOPENED,
            user_id=admin.id,
        )
        reopened_ids.append(alert_id)

    await db.commit()
    return AlertBulkReopenResponse(
        reopened_ids=reopened_ids,
        missing_ids=missing_ids,
    )


@router.post(
    "/bulk-accept-global",
    response_model=AlertBulkAcceptResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_accept_global(
    admin: OperatorUser,
    db: DbSession,
    request: AlertBulkAcceptRequest = Body(...),
) -> AlertBulkAcceptResponse:
    """Add multiple alerts to global accept list with single reason (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    if not request.reason or not request.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason is required for accepting",
        )

    unique_ids = sorted(set(request.alert_ids))
    alerts = await alerts_service.get_alerts_by_ids(db, unique_ids)

    errors: list[str] = []

    # Build unique match criteria per source
    rules_to_create: list[tuple[str, dict[str, str | None]]] = []
    seen_keys: set[str] = set()
    for alert in alerts:
        if alert.source == "port" and alert.port is not None:
            criteria: dict[str, str | None] = {"ip": alert.ip, "port": str(alert.port)}
        elif alert.source == "ssh":
            criteria = {"ip": alert.ip, "alert_type": alert.alert_type.value}
            if alert.port is not None:
                criteria["port"] = str(alert.port)
        else:
            criteria = {"ip": alert.ip}

        key = f"{alert.source}:{_json.dumps(criteria, sort_keys=True)}"
        if key not in seen_keys:
            seen_keys.add(key)
            rules_to_create.append((alert.source, criteria))

    # Create global accept rules using unified alert_rules
    accepted_count = 0
    for source, criteria in rules_to_create:
        try:
            await alert_rules_service.create_rule(
                db=db,
                source=source,
                rule_type=AlertRuleType.ACCEPTED,
                match_criteria=criteria,
                description=request.reason.strip(),
                created_by=admin.id,
            )
            accepted_count += 1
        except Exception as e:
            errors.append(f"Failed to accept {source} rule: {str(e)}")

    # Dismiss all alerts and create comments
    reason = request.reason.strip()
    for alert in alerts:
        alert.dismiss_reason = reason
    await alerts_service.dismiss_alerts(db, alerts)
    for alert in alerts:
        await alert_comments_service.create_comment(
            db, alert_id=alert.id, user_id=admin.id, comment=reason
        )
        await alerts_service.propagate_dismiss_reason_to_port_and_host(db, alert, reason)
    for alert in alerts:
        await emit_event(
            db,
            alert_id=alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin.id,
            description=reason,
        )
    await db.commit()

    dismissed_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(dismissed_ids))

    return AlertBulkAcceptResponse(
        accepted_count=accepted_count,
        dismissed_ids=dismissed_ids,
        missing_ids=missing_ids,
        errors=errors,
    )


@router.post(
    "/bulk-accept-network",
    response_model=AlertBulkAcceptResponse,
    status_code=status.HTTP_200_OK,
)
async def bulk_accept_network(
    admin: OperatorUser,
    db: DbSession,
    request: AlertBulkAcceptRequest = Body(...),
) -> AlertBulkAcceptResponse:
    """Add multiple alerts to network-specific accept list with single reason (admin only)."""
    if not request.alert_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="alert_ids cannot be empty",
        )

    if not request.reason or not request.reason.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="reason is required for accepting",
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

    # Create network-specific accept rules using unified alert_rules
    accepted_count = 0
    for network_id, network_alerts in alerts_by_network.items():
        # Verify network exists
        network = await networks_service.get_network_by_id(db, network_id)
        if network is None:
            errors.append(f"Network {network_id} not found")
            continue

        # Build unique criteria per alert
        seen_keys: set[str] = set()
        rules_to_create: list[tuple[str, dict[str, str | None]]] = []
        for alert in network_alerts:
            if alert.source == "port" and alert.port is not None:
                criteria: dict[str, str | None] = {"ip": alert.ip, "port": str(alert.port)}
            elif alert.source == "ssh":
                criteria = {"ip": alert.ip, "alert_type": alert.alert_type.value}
                if alert.port is not None:
                    criteria["port"] = str(alert.port)
            else:
                criteria = {"ip": alert.ip}
            key = f"{alert.source}:{_json.dumps(criteria, sort_keys=True)}"
            if key not in seen_keys:
                seen_keys.add(key)
                rules_to_create.append((alert.source, criteria))

        # Create rules for this network
        for source, criteria in rules_to_create:
            try:
                await alert_rules_service.create_rule(
                    db=db,
                    source=source,
                    rule_type=AlertRuleType.ACCEPTED,
                    match_criteria=criteria,
                    network_id=network_id,
                    description=request.reason.strip(),
                )
                accepted_count += 1
            except Exception as e:
                errors.append(f"Failed to accept {source} rule on network {network_id}: {str(e)}")

    # Dismiss all alerts and create comments
    reason = request.reason.strip()
    for alert in alerts:
        alert.dismiss_reason = reason
    await alerts_service.dismiss_alerts(db, alerts)
    for alert in alerts:
        await alert_comments_service.create_comment(
            db, alert_id=alert.id, user_id=admin.id, comment=reason
        )
        await alerts_service.propagate_dismiss_reason_to_port_and_host(db, alert, reason)
    for alert in alerts:
        await emit_event(
            db,
            alert_id=alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin.id,
            description=reason,
        )
    await db.commit()

    dismissed_ids = sorted(alert.id for alert in alerts)
    missing_ids = sorted(set(unique_ids) - set(dismissed_ids))

    return AlertBulkAcceptResponse(
        accepted_count=accepted_count,
        dismissed_ids=dismissed_ids,
        missing_ids=missing_ids,
        errors=errors,
    )
