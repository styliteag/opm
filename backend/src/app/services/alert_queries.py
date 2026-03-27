"""Alert CRUD, filtering, dismissing, reopening, auto-dismiss, and status summaries."""

from datetime import datetime
from typing import Any

from sqlalchemy import Integer, and_, case, func, literal, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.network import Network
from app.services.global_open_ports import get_global_open_port, get_global_open_port_by_id
from app.services.hosts import get_host_by_ip

SSH_ALERT_TYPES = frozenset(
    {
        AlertType.SSH_INSECURE_AUTH,
        AlertType.SSH_WEAK_CIPHER,
        AlertType.SSH_WEAK_KEX,
        AlertType.SSH_OUTDATED_VERSION,
        AlertType.SSH_CONFIG_REGRESSION,
    }
)

PORT_ALERT_TYPES = frozenset(
    {
        AlertType.NEW_PORT,
        AlertType.NOT_ALLOWED,
        AlertType.BLOCKED,
    }
)


async def get_alert_with_network_name(
    db: AsyncSession, alert_id: int
) -> tuple[Alert, str | None] | None:
    """Get an alert with its network name (may be None for global alerts)."""
    result = await db.execute(
        select(Alert, Network.name)
        .outerjoin(Network, Alert.network_id == Network.id)
        .where(Alert.id == alert_id)
    )
    row = result.first()
    if row is None:
        return None
    network_name = str(row[1]) if row[1] is not None else None
    return row[0], network_name


async def get_alerts_by_ids(db: AsyncSession, alert_ids: list[int]) -> list[Alert]:
    """Fetch alerts by IDs."""
    if not alert_ids:
        return []
    result = await db.execute(select(Alert).where(Alert.id.in_(alert_ids)))
    return list(result.scalars().all())


async def delete_alerts_by_ids(
    db: AsyncSession, alert_ids: list[int]
) -> tuple[list[int], list[int]]:
    """Delete alerts by IDs. Returns (deleted_ids, missing_ids)."""
    if not alert_ids:
        return [], []
    alerts = await get_alerts_by_ids(db, alert_ids)
    found_ids = {a.id for a in alerts}
    missing_ids = sorted(set(alert_ids) - found_ids)
    for alert in alerts:
        await db.delete(alert)
    return sorted(found_ids), missing_ids


async def get_alerts(
    db: AsyncSession,
    *,
    alert_type: AlertType | None = None,
    network_id: int | None = None,
    dismissed: bool | None = None,
    ip: str | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    offset: int = 0,
    limit: int = 50,
) -> list[tuple[Alert, str | None]]:
    """List alerts with optional filters and pagination."""
    query = select(Alert, Network.name).outerjoin(Network, Alert.network_id == Network.id)
    filters = []

    if alert_type is not None:
        filters.append(Alert.alert_type == alert_type)
    if network_id is not None:
        filters.append(Alert.network_id == network_id)
    if dismissed is not None:
        filters.append(Alert.dismissed.is_(dismissed))
    if ip is not None:
        filters.append(Alert.ip == ip)
    if start_date is not None:
        filters.append(Alert.created_at >= start_date)
    if end_date is not None:
        filters.append(Alert.created_at <= end_date)

    if filters:
        query = query.where(and_(*filters))

    query = query.order_by(Alert.created_at.desc(), Alert.id.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return [(row[0], str(row[1]) if row[1] is not None else None) for row in result.all()]


async def dismiss_alert(
    db: AsyncSession,
    alert: Alert,
    dismiss_reason: str | None = None,
    resolution_status: ResolutionStatus | None = None,
) -> Alert:
    """Mark an alert as dismissed."""
    alert.dismissed = True
    alert.dismiss_reason = dismiss_reason
    if resolution_status is not None:
        alert.resolution_status = resolution_status
    await db.flush()
    await db.refresh(alert)
    return alert


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
    await db.flush()
    await db.refresh(alert)
    return alert


async def propagate_dismiss_reason_to_port_and_host(
    db: AsyncSession, alert: Alert, reason: str
) -> None:
    """Propagate a dismiss reason to the related GlobalOpenPort and Host.

    - Always overwrites GlobalOpenPort.user_comment with the reason.
    - Sets Host.user_comment only if currently empty/null.
    - Does not commit — caller handles the transaction.
    """
    # Update GlobalOpenPort
    global_port = None
    if alert.global_open_port_id:
        global_port = await get_global_open_port_by_id(db, alert.global_open_port_id)
    elif alert.port is not None:
        global_port = await get_global_open_port(db, alert.ip, alert.port)

    if global_port:
        global_port.user_comment = reason

    # Update Host (only if comment is empty)
    host = await get_host_by_ip(db, alert.ip)
    if host and not host.user_comment:
        host.user_comment = reason


async def auto_dismiss_alerts_for_accepted_rule(
    db: AsyncSession,
    ip: str | None,
    port_str: str,
    reason: str,
    network_id: int | None = None,
) -> int:
    """Auto-dismiss pending alerts matching a newly created ACCEPTED rule.

    Args:
        db: Database session
        ip: Optional IP address (None means rule applies to all IPs)
        port_str: Port value as string (single port or range like "22" or "80-443")
        reason: The rule description used as the dismiss_reason
        network_id: If set, only dismiss alerts in this network

    Returns:
        Number of alerts dismissed
    """
    from app.services.alert_rules import _parse_port_range as parse_port_range

    parsed = parse_port_range(port_str)
    if parsed is None:
        return 0

    start, end = parsed

    conditions = [
        Alert.dismissed.is_(False),
        Alert.port.isnot(None),
        Alert.port >= start,
        Alert.port <= end,
    ]

    if ip is not None:
        conditions.append(Alert.ip == ip)

    if network_id is not None:
        conditions.append(Alert.network_id == network_id)

    stmt = (
        update(Alert)
        .where(and_(*conditions))
        .values(
            dismissed=True,
            dismiss_reason=reason,
        )
    )
    result = await db.execute(stmt)
    return result.rowcount or 0  # type: ignore[attr-defined]


async def auto_dismiss_alerts_for_ssh_rule(
    db: AsyncSession,
    ip: str | None,
    port: int | None,
    alert_type: str | None,
    reason: str,
    network_id: int | None = None,
) -> int:
    """Auto-dismiss pending SSH alerts matching a newly created ACCEPTED rule.

    Returns:
        Number of alerts dismissed
    """
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

    stmt = (
        update(Alert)
        .where(and_(*conditions))
        .values(
            dismissed=True,
            dismiss_reason=reason,
        )
    )
    result = await db.execute(stmt)
    return result.rowcount or 0  # type: ignore[attr-defined]


async def auto_dismiss_alerts_for_nse_rule(
    db: AsyncSession,
    ip: str | None,
    port: int | None,
    alert_type: str | None,
    script_name: str | None,
    reason: str,
    network_id: int | None = None,
) -> int:
    """Auto-dismiss pending NSE alerts matching a newly created ACCEPTED rule.

    Returns:
        Number of alerts dismissed
    """
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

    # script_name matching via message substring (script name is embedded
    # in the alert message by the NSE alert generator).
    if script_name is not None:
        conditions.append(Alert.message.contains(script_name))

    stmt = (
        update(Alert)
        .where(and_(*conditions))
        .values(
            dismissed=True,
            dismiss_reason=reason,
        )
    )
    result = await db.execute(stmt)
    return result.rowcount or 0  # type: ignore[attr-defined]


async def get_ssh_alert_summary_for_ips(
    db: AsyncSession,
    ips: set[str],
) -> dict[tuple[str, int], tuple[int, bool]]:
    """Get SSH alert count and all-dismissed status for (ip, port) pairs.

    Returns dict keyed by (ip, port) -> (total_count, all_dismissed).
    """
    if not ips:
        return {}

    result = await db.execute(
        select(
            Alert.ip,
            Alert.port,
            func.count(Alert.id),
            func.min(Alert.dismissed.cast(Integer)),  # 0 if any unacked
        )
        .where(
            Alert.ip.in_(ips),
            Alert.alert_type.in_(list(SSH_ALERT_TYPES)),
        )
        .group_by(Alert.ip, Alert.port)
    )

    lookup: dict[tuple[str, int], tuple[int, bool]] = {}
    for ip, port, count, min_acked in result.all():
        lookup[(ip, port)] = (count, bool(min_acked))
    return lookup


async def get_port_alert_status_for_ips(
    db: AsyncSession,
    ip_port_pairs: set[tuple[str, int]],
) -> dict[tuple[str, int], tuple[int, bool, str | None]]:
    """Get the most relevant port-type alert for each (ip, port).

    Returns dict keyed by (ip, port) -> (alert_id, dismissed, dismiss_reason).
    Picks the highest-priority pending alert, or the latest dismissed one.
    """
    if not ip_port_pairs:
        return {}

    ips = {pair[0] for pair in ip_port_pairs}
    result = await db.execute(
        select(Alert)
        .where(
            Alert.ip.in_(ips),
            Alert.alert_type.in_(list(PORT_ALERT_TYPES)),
        )
        .order_by(Alert.dismissed.asc(), Alert.created_at.desc())
    )
    alerts = result.scalars().all()

    lookup: dict[tuple[str, int], tuple[int, bool, str | None]] = {}
    for alert in alerts:
        if alert.port is None:
            continue
        key = (alert.ip, alert.port)
        if key in ip_port_pairs and key not in lookup:
            lookup[key] = (alert.id, alert.dismissed, alert.dismiss_reason)
    return lookup


async def get_dismiss_reason_suggestions(
    db: AsyncSession,
    *,
    port: int | None = None,
    search: str | None = None,
    limit: int = 20,
) -> list[dict[str, object]]:
    """Get previously used dismiss reasons ranked by port affinity and frequency.

    Returns a list of dicts with keys: reason, frequency, last_used, same_port.
    """
    filters = [
        Alert.dismissed.is_(True),
        Alert.dismiss_reason.isnot(None),
        Alert.dismiss_reason != "",
    ]

    if search:
        filters.append(Alert.dismiss_reason.ilike(f"%{search}%"))

    same_port_expr = (
        func.sum(case((Alert.port == port, 1), else_=0)) if port is not None else literal(0)
    )

    query = (
        select(
            Alert.dismiss_reason,
            func.count(Alert.id).label("frequency"),
            func.max(Alert.created_at).label("last_used"),
            same_port_expr.label("same_port_count"),
        )
        .where(and_(*filters))
        .group_by(Alert.dismiss_reason)
        .order_by(
            same_port_expr.desc(),
            func.count(Alert.id).desc(),
            func.max(Alert.created_at).desc(),
        )
        .limit(limit)
    )

    result = await db.execute(query)
    rows = result.all()

    return [
        {
            "reason": row[0],
            "frequency": row[1],
            "last_used": row[2].isoformat() if row[2] else None,
            "same_port": bool(row[3] and row[3] > 0),
        }
        for row in rows
    ]
