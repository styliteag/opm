"""Alert generation and retrieval services for alerts."""

from datetime import datetime
from typing import Any, Iterable

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.port_rule import PortRule, RuleType
from app.models.scan import Scan, ScanStatus
from app.services.email_alerts import queue_alert_emails

PortKey = tuple[str, int]
AlertKey = tuple[AlertType, str, int]


async def get_alert_with_network_name(
    db: AsyncSession, alert_id: int
) -> tuple[Alert, str] | None:
    """Get an alert with its network name."""
    result = await db.execute(
        select(Alert, Network.name)
        .join(Network, Alert.network_id == Network.id)
        .where(Alert.id == alert_id)
    )
    row = result.first()
    if row is None:
        return None
    return row[0], str(row[1])


async def get_alerts_by_ids(
    db: AsyncSession, alert_ids: list[int]
) -> list[Alert]:
    """Fetch alerts by IDs."""
    if not alert_ids:
        return []
    result = await db.execute(select(Alert).where(Alert.id.in_(alert_ids)))
    return list(result.scalars().all())


async def get_alerts(
    db: AsyncSession,
    *,
    alert_type: AlertType | None = None,
    network_id: int | None = None,
    acknowledged: bool | None = None,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
    offset: int = 0,
    limit: int = 50,
) -> list[tuple[Alert, str]]:
    """List alerts with optional filters and pagination."""
    query = select(Alert, Network.name).join(
        Network, Alert.network_id == Network.id
    )
    filters = []

    if alert_type is not None:
        filters.append(Alert.alert_type == alert_type)
    if network_id is not None:
        filters.append(Alert.network_id == network_id)
    if acknowledged is not None:
        filters.append(Alert.acknowledged.is_(acknowledged))
    if start_date is not None:
        filters.append(Alert.created_at >= start_date)
    if end_date is not None:
        filters.append(Alert.created_at <= end_date)

    if filters:
        query = query.where(and_(*filters))

    query = (
        query.order_by(Alert.created_at.desc(), Alert.id.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(query)
    return [(row[0], str(row[1])) for row in result.all()]


async def acknowledge_alert(db: AsyncSession, alert: Alert) -> Alert:
    """Mark an alert as acknowledged."""
    alert.acknowledged = True
    await db.flush()
    await db.refresh(alert)
    return alert


async def acknowledge_alerts(
    db: AsyncSession, alerts: list[Alert]
) -> list[Alert]:
    """Mark multiple alerts as acknowledged."""
    if not alerts:
        return []
    for alert in alerts:
        alert.acknowledged = True
    await db.flush()
    return alerts


async def unacknowledge_alert(db: AsyncSession, alert: Alert) -> Alert:
    """Mark an alert as unacknowledged (reopen)."""
    alert.acknowledged = False
    await db.flush()
    await db.refresh(alert)
    return alert


def _parse_port_range(value: str) -> tuple[int, int] | None:
    """Parse a port or port range string into a (start, end) tuple."""
    if not value:
        return None

    cleaned = value.strip()
    if "-" in cleaned:
        parts = cleaned.split("-", maxsplit=1)
        try:
            start = int(parts[0])
            end = int(parts[1])
        except ValueError:
            return None
        if start > end:
            return None
        return start, end

    try:
        port = int(cleaned)
    except ValueError:
        return None
    return port, port


def _build_port_ranges(rules: Iterable[PortRule]) -> list[tuple[int, int]]:
    """Build a list of inclusive port ranges from rules."""
    ranges: list[tuple[int, int]] = []
    for rule in rules:
        parsed = _parse_port_range(rule.port)
        if parsed is None:
            continue
        ranges.append(parsed)
    return ranges


def _build_ip_rule_ranges(
    rules: Iterable[PortRule],
) -> dict[str, list[tuple[int, int]]]:
    """Build a map of IP-specific port ranges from rules."""
    ranges_by_ip: dict[str, list[tuple[int, int]]] = {}
    for rule in rules:
        if not rule.ip:
            continue
        parsed = _parse_port_range(rule.port)
        if parsed is None:
            continue
        ranges_by_ip.setdefault(rule.ip, []).append(parsed)
    return ranges_by_ip


def _combine_ranges(
    global_ranges: list[tuple[int, int]],
    ip_ranges: list[tuple[int, int]] | None,
) -> list[tuple[int, int]]:
    """Combine global ranges with IP-specific ranges."""
    if not ip_ranges:
        return global_ranges
    if not global_ranges:
        return ip_ranges
    return [*global_ranges, *ip_ranges]


def _port_in_ranges(port: int, ranges: list[tuple[int, int]]) -> bool:
    """Check if port falls within any configured ranges."""
    for start, end in ranges:
        if start <= port <= end:
            return True
    return False


def _get_enabled_alert_types(alert_config: dict[str, Any] | None) -> set[AlertType]:
    """Resolve enabled alert types from alert_config."""
    all_types = {AlertType.NEW_PORT, AlertType.NOT_ALLOWED, AlertType.BLOCKED}
    if not alert_config:
        return all_types

    explicit_flags: dict[AlertType, bool] = {}
    for alert_type in AlertType:
        key = alert_type.value
        if key in alert_config:
            explicit_flags[alert_type] = bool(alert_config.get(key))

    if explicit_flags:
        return {alert_type for alert_type, enabled in explicit_flags.items() if enabled}

    enabled_types = alert_config.get("enabled_types")
    if isinstance(enabled_types, list):
        enabled_set = {str(item) for item in enabled_types}
        return {alert_type for alert_type in AlertType if alert_type.value in enabled_set}

    disabled_types = alert_config.get("disabled_types")
    if isinstance(disabled_types, list):
        disabled_set = {str(item) for item in disabled_types}
        return {
            alert_type
            for alert_type in AlertType
            if alert_type.value not in disabled_set
        }

    return all_types


async def _get_open_ports_for_scan(db: AsyncSession, scan_id: int) -> set[PortKey]:
    result = await db.execute(
        select(OpenPort.ip, OpenPort.port).where(OpenPort.scan_id == scan_id)
    )
    return {(row[0], int(row[1])) for row in result.all()}


async def _get_previous_scan_ports(db: AsyncSession, scan: Scan) -> set[PortKey]:
    result = await db.execute(
        select(Scan.id)
        .where(
            Scan.network_id == scan.network_id,
            Scan.status == ScanStatus.COMPLETED,
            Scan.id < scan.id,
        )
        .order_by(Scan.id.desc())
        .limit(1)
    )
    previous_scan_id = result.scalar_one_or_none()
    if previous_scan_id is None:
        return set()

    return await _get_open_ports_for_scan(db, previous_scan_id)


async def _get_unacknowledged_alerts(
    db: AsyncSession, network_id: int
) -> set[AlertKey]:
    result = await db.execute(
        select(Alert.alert_type, Alert.ip, Alert.port).where(
            Alert.network_id == network_id,
            Alert.acknowledged.is_(False),
        )
    )
    return {(row[0], row[1], int(row[2])) for row in result.all()}


def _should_create_alert(
    key: AlertKey, existing_alerts: set[AlertKey], new_alerts: set[AlertKey]
) -> bool:
    if key in existing_alerts or key in new_alerts:
        return False
    new_alerts.add(key)
    return True


async def generate_alerts_for_scan(
    db: AsyncSession,
    scan: Scan,
    open_ports: list[PortKey] | None = None,
) -> int:
    """Generate alerts for a completed scan."""
    if scan.status != ScanStatus.COMPLETED:
        return 0

    if open_ports is None:
        current_ports = await _get_open_ports_for_scan(db, scan.id)
    else:
        current_ports = set(open_ports)

    if not current_ports:
        return 0

    network_result = await db.execute(
        select(Network.alert_config, Network.name).where(Network.id == scan.network_id)
    )
    network_row = network_result.first()
    if network_row is None:
        return 0
    alert_config, network_name = network_row
    enabled_types = _get_enabled_alert_types(alert_config)
    if not enabled_types:
        return 0

    rules_result = await db.execute(
        select(PortRule).where(PortRule.network_id == scan.network_id)
    )
    rules = list(rules_result.scalars().all())
    allow_global_ranges = _build_port_ranges(
        rule for rule in rules if rule.rule_type == RuleType.ALLOW and rule.ip is None
    )
    block_global_ranges = _build_port_ranges(
        rule for rule in rules if rule.rule_type == RuleType.BLOCK and rule.ip is None
    )
    allow_ranges_by_ip = _build_ip_rule_ranges(
        rule for rule in rules if rule.rule_type == RuleType.ALLOW and rule.ip is not None
    )
    block_ranges_by_ip = _build_ip_rule_ranges(
        rule for rule in rules if rule.rule_type == RuleType.BLOCK and rule.ip is not None
    )
    allow_range_cache: dict[str, list[tuple[int, int]]] = {}
    block_range_cache: dict[str, list[tuple[int, int]]] = {}

    previous_ports: set[PortKey] = set()
    if AlertType.NEW_PORT in enabled_types:
        previous_ports = await _get_previous_scan_ports(db, scan)

    existing_alerts = await _get_unacknowledged_alerts(db, scan.network_id)
    created_alert_keys: set[AlertKey] = set()
    created_count = 0
    created_alerts: list[Alert] = []

    for ip, port in current_ports:
        allow_ranges = allow_range_cache.get(ip)
        if allow_ranges is None:
            allow_ranges = _combine_ranges(
                allow_global_ranges, allow_ranges_by_ip.get(ip)
            )
            allow_range_cache[ip] = allow_ranges

        block_ranges = block_range_cache.get(ip)
        if block_ranges is None:
            block_ranges = _combine_ranges(
                block_global_ranges, block_ranges_by_ip.get(ip)
            )
            block_range_cache[ip] = block_ranges

        allowlist_exists = len(allow_ranges) > 0

        if AlertType.NEW_PORT in enabled_types and (ip, port) not in previous_ports:
            key = (AlertType.NEW_PORT, ip, port)
            if _should_create_alert(key, existing_alerts, created_alert_keys):
                alert = Alert(
                    scan_id=scan.id,
                    network_id=scan.network_id,
                    alert_type=AlertType.NEW_PORT,
                    ip=ip,
                    port=port,
                    message=f"New open port detected: {ip}:{port}",
                )
                db.add(alert)
                created_alerts.append(alert)
                created_count += 1

        if AlertType.BLOCKED in enabled_types and _port_in_ranges(port, block_ranges):
            key = (AlertType.BLOCKED, ip, port)
            if _should_create_alert(key, existing_alerts, created_alert_keys):
                alert = Alert(
                    scan_id=scan.id,
                    network_id=scan.network_id,
                    alert_type=AlertType.BLOCKED,
                    ip=ip,
                    port=port,
                    message=f"Blocked port detected: {ip}:{port}",
                )
                db.add(alert)
                created_alerts.append(alert)
                created_count += 1

        if (
            AlertType.NOT_ALLOWED in enabled_types
            and allowlist_exists
            and not _port_in_ranges(port, allow_ranges)
        ):
            key = (AlertType.NOT_ALLOWED, ip, port)
            if _should_create_alert(key, existing_alerts, created_alert_keys):
                alert = Alert(
                    scan_id=scan.id,
                    network_id=scan.network_id,
                    alert_type=AlertType.NOT_ALLOWED,
                    ip=ip,
                    port=port,
                    message=f"Open port not in allowlist: {ip}:{port}",
                )
                db.add(alert)
                created_alerts.append(alert)
                created_count += 1

    if created_alerts:
        await queue_alert_emails(created_alerts, network_name, alert_config, scan.id)

    return created_count
