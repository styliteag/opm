"""Alerts management endpoints."""

from datetime import datetime

from fastapi import APIRouter, Body, HTTPException, Query, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.alert import AlertType
from app.schemas.alert import AlertBulkAcknowledgeResponse, AlertListResponse, AlertResponse
from app.services import alerts as alerts_service

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


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

    return AlertListResponse(
        alerts=[
            AlertResponse(
                id=alert.id,
                type=alert.alert_type,
                network_id=alert.network_id,
                network_name=network_name,
                ip=alert.ip,
                port=alert.port,
                message=alert.message,
                acknowledged=alert.acknowledged,
                created_at=alert.created_at,
            )
            for alert, network_name in alerts
        ]
    )


@router.put("/{alert_id}/acknowledge", response_model=AlertResponse)
async def acknowledge_alert(
    admin: AdminUser,
    db: DbSession,
    alert_id: int,
) -> AlertResponse:
    """Acknowledge a single alert (admin only)."""
    alert_with_network = await alerts_service.get_alert_with_network_name(
        db, alert_id
    )
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    alert = await alerts_service.acknowledge_alert(db, alert)
    await db.commit()

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        network_id=alert.network_id,
        network_name=network_name,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        acknowledged=alert.acknowledged,
        created_at=alert.created_at,
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
    alert_with_network = await alerts_service.get_alert_with_network_name(
        db, alert_id
    )
    if alert_with_network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found",
        )

    alert, network_name = alert_with_network
    alert = await alerts_service.unacknowledge_alert(db, alert)
    await db.commit()

    return AlertResponse(
        id=alert.id,
        type=alert.alert_type,
        network_id=alert.network_id,
        network_name=network_name,
        ip=alert.ip,
        port=alert.port,
        message=alert.message,
        acknowledged=alert.acknowledged,
        created_at=alert.created_at,
    )
