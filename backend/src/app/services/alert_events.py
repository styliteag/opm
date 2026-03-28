"""Service functions for alert event lifecycle tracking."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert_event import AlertEvent, AlertEventType


async def emit_event(
    db: AsyncSession,
    *,
    alert_id: int,
    event_type: AlertEventType,
    user_id: int | None = None,
    scan_id: int | None = None,
    description: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AlertEvent:
    """Create an AlertEvent row in the current session without committing.

    Flushes to assign an ID but does not commit — the caller controls the transaction.
    """
    event = AlertEvent(
        alert_id=alert_id,
        event_type=event_type,
        user_id=user_id,
        scan_id=scan_id,
        description=description,
        extra=metadata,
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


async def get_events_for_alert(db: AsyncSession, alert_id: int) -> list[AlertEvent]:
    """Get all events for an alert ordered by occurred_at ascending."""
    result = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.alert_id == alert_id)
        .order_by(AlertEvent.occurred_at.asc(), AlertEvent.id.asc())
    )
    return list(result.scalars().all())
