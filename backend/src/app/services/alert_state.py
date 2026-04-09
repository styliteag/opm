"""Alert state transitions: dismiss, reopen, delete, propagate."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.repositories.alert import AlertRepository
from app.services.global_open_ports import get_global_open_port, get_global_open_port_by_id
from app.services.hosts import get_host_by_ip


async def dismiss_alert(
    db: AsyncSession,
    alert: Alert,
    dismiss_reason: str | None = None,
) -> Alert:
    """Mark an alert as dismissed."""
    alert.dismissed = True
    alert.dismiss_reason = dismiss_reason
    return await AlertRepository(db).flush_and_refresh(alert)


async def dismiss_alerts(db: AsyncSession, alerts: list[Alert]) -> list[Alert]:
    """Mark multiple alerts as dismissed."""
    if not alerts:
        return []
    for alert in alerts:
        alert.dismissed = True
    await db.flush()
    return alerts


async def reopen_alert(db: AsyncSession, alert: Alert) -> Alert:
    """Reopen a dismissed alert."""
    alert.dismissed = False
    alert.dismiss_reason = None
    return await AlertRepository(db).flush_and_refresh(alert)


async def delete_alerts_by_ids(
    db: AsyncSession, alert_ids: list[int]
) -> tuple[list[int], list[int]]:
    """Delete alerts by IDs. Returns (deleted_ids, missing_ids)."""
    if not alert_ids:
        return [], []
    repo = AlertRepository(db)
    alerts = await repo.get_many(alert_ids)
    found_ids = {a.id for a in alerts}
    missing_ids = sorted(set(alert_ids) - found_ids)
    for alert in alerts:
        await db.delete(alert)
    return sorted(found_ids), missing_ids


async def propagate_dismiss_reason_to_port_and_host(
    db: AsyncSession, alert: Alert, reason: str
) -> None:
    """Propagate a dismiss reason to the related GlobalOpenPort and Host.

    - Always overwrites GlobalOpenPort.user_comment with the reason.
    - Sets Host.user_comment only if currently empty/null.
    - Does not commit — caller handles the transaction.
    """
    global_port = None
    if alert.global_open_port_id:
        global_port = await get_global_open_port_by_id(db, alert.global_open_port_id)
    elif alert.port is not None:
        global_port = await get_global_open_port(db, alert.ip, alert.port)

    if global_port:
        global_port.user_comment = reason

    host = await get_host_by_ip(db, alert.ip)
    if host and not host.user_comment:
        host.user_comment = reason
