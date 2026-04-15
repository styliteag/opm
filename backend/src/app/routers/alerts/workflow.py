"""Alert assignment and severity endpoints."""

from fastapi import APIRouter, Body, HTTPException, status

from app.core.deps import AnalystUser, DbSession
from app.models.alert_event import AlertEventType
from app.schemas.alert import (
    AlertAssignRequest,
    AlertResponse,
    AlertSeverityRequest,
)
from app.services import alerts as alerts_service
from app.services import users as users_service
from app.services.alert_events import emit_event

from .detail import _severity_override_value, compute_alert_severity

router = APIRouter()


@router.patch("/{alert_id}/assign", response_model=AlertResponse)
async def assign_alert(
    user: AnalystUser,
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
    await emit_event(
        db,
        alert_id=alert.id,
        event_type=AlertEventType.ASSIGNED,
        user_id=user.id,
        metadata={"assigned_to_user_id": request.user_id},
    )
    await db.commit()
    await db.refresh(alert)

    # Compute severity for response
    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port or 0, alert.severity_override
    )

    return AlertResponse(
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
    )


@router.patch("/{alert_id}/severity", response_model=AlertResponse)
async def update_alert_severity(
    user: AnalystUser,
    db: DbSession,
    alert_id: int,
    request: AlertSeverityRequest = Body(...),
) -> AlertResponse:
    """Update the severity override of an alert."""
    alert_with_network = await alerts_service.get_alert_with_network_name(db, alert_id)
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    old_severity = alert.severity_override
    alert.severity_override = request.severity.value if request.severity is not None else None
    await emit_event(
        db,
        alert_id=alert.id,
        event_type=AlertEventType.SEVERITY_OVERRIDDEN,
        user_id=user.id,
        metadata={"old_severity": old_severity, "new_severity": alert.severity_override},
    )
    await db.commit()
    await db.refresh(alert)

    assigned_to_email: str | None = None
    if alert.assigned_to_user_id is not None:
        assigned_user = await users_service.get_user_by_id(db, alert.assigned_to_user_id)
        if assigned_user is not None:
            assigned_to_email = assigned_user.email

    severity = await compute_alert_severity(
        db, alert.alert_type, alert.ip, alert.port or 0, alert.severity_override
    )

    return AlertResponse(
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
    )
