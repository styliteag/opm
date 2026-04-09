"""Auto-dismiss orchestration: query + mutate + emit events for accepted rules."""

from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_event import AlertEventType
from app.services.alert_events import emit_event


async def auto_dismiss_alerts_for_accepted_rule(
    db: AsyncSession,
    ip: str | None,
    port_str: str,
    reason: str,
    network_id: int | None = None,
) -> int:
    """Auto-dismiss pending alerts matching a newly created ACCEPTED port rule."""
    from app.services.alert_rules import _parse_port_range as parse_port_range

    parsed = parse_port_range(port_str)
    if parsed is None:
        return 0

    start, end = parsed

    conditions: list[Any] = [
        Alert.dismissed.is_(False),
        Alert.port.isnot(None),
        Alert.port >= start,
        Alert.port <= end,
    ]

    if ip is not None:
        conditions.append(Alert.ip == ip)

    if network_id is not None:
        conditions.append(Alert.network_id == network_id)

    return await _dismiss_matching(db, conditions, reason)


async def auto_dismiss_alerts_for_ssh_rule(
    db: AsyncSession,
    ip: str | None,
    port: int | None,
    alert_type: str | None,
    reason: str,
    network_id: int | None = None,
) -> int:
    """Auto-dismiss pending SSH alerts matching a newly created ACCEPTED rule."""
    conditions: list[Any] = [
        Alert.dismissed.is_(False),
        Alert.source == "ssh",
    ]

    if ip is not None:
        conditions.append(Alert.ip == ip)

    if port is not None:
        conditions.append(Alert.port == port)

    if alert_type is not None:
        conditions.append(Alert.alert_type == alert_type)

    if network_id is not None:
        conditions.append(Alert.network_id == network_id)

    return await _dismiss_matching(db, conditions, reason)


async def auto_dismiss_alerts_for_nse_rule(
    db: AsyncSession,
    ip: str | None,
    port: int | None,
    alert_type: str | None,
    script_name: str | None,
    reason: str,
    network_id: int | None = None,
) -> int:
    """Auto-dismiss pending NSE alerts matching a newly created ACCEPTED rule."""
    conditions: list[Any] = [
        Alert.dismissed.is_(False),
        Alert.source == "nse",
    ]

    if ip is not None:
        conditions.append(Alert.ip == ip)

    if port is not None:
        conditions.append(Alert.port == port)

    if alert_type is not None:
        conditions.append(Alert.alert_type == alert_type)

    if network_id is not None:
        conditions.append(Alert.network_id == network_id)

    if script_name is not None:
        conditions.append(Alert.message.contains(script_name))

    return await _dismiss_matching(db, conditions, reason)


async def _dismiss_matching(
    db: AsyncSession, conditions: list[Any], reason: str
) -> int:
    """Shared dismiss logic: find matching alerts, dismiss, emit events."""
    result = await db.execute(select(Alert).where(and_(*conditions)))
    alerts = list(result.scalars().all())

    for alert in alerts:
        alert.dismissed = True
        alert.dismiss_reason = reason
        await emit_event(
            db,
            alert_id=alert.id,
            event_type=AlertEventType.DISMISSED,
            description=reason,
        )

    return len(alerts)
