"""Port-based alert generation for network and global scans."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import app.services.global_settings as global_settings_service
from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.alert_event import AlertEventType
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.port_rule import PortRule, RuleType
from app.models.scan import Scan, ScanStatus
from app.services.alert_events import emit_event
from app.services.alert_rules import is_port_accepted
from app.services.email_alerts import queue_alert_emails, queue_global_alert_emails
from app.services.global_open_ports import upsert_global_open_port
from app.services.hosts import get_host_by_ip
from app.services.port_rule_matching import (
    PortKey,
    _build_ip_rule_ranges,
    _build_port_ranges,
    _combine_ranges,
    _port_in_ranges,
)

AlertKey = tuple[AlertType, str, int]
GlobalAlertKey = tuple[str, int, str]  # (ip, port, protocol)


async def _get_enabled_alert_types(
    db: AsyncSession, alert_config: dict[str, Any] | None
) -> set[AlertType]:
    """Resolve enabled alert types from alert_config or global defaults.

    If alert_config is None, falls back to global SSH alert defaults.
    """
    # If alert_config is None, use global defaults for SSH alerts
    if alert_config is None:
        global_defaults = await global_settings_service.get_ssh_alert_defaults(db)
        alert_config = global_defaults

    # Default port-related alerts (always enabled unless explicitly disabled)
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
        return {alert_type for alert_type in AlertType if alert_type.value not in disabled_set}

    return all_types


async def _get_open_ports_for_scan(db: AsyncSession, scan_id: int) -> set[PortKey]:
    result = await db.execute(select(OpenPort.ip, OpenPort.port).where(OpenPort.scan_id == scan_id))
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


async def _get_pending_alerts(db: AsyncSession, network_id: int) -> set[AlertKey]:
    result = await db.execute(
        select(Alert.alert_type, Alert.ip, Alert.port).where(
            Alert.network_id == network_id,
            Alert.dismissed.is_(False),
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


async def _get_severity_overrides(db: AsyncSession, network_id: int) -> dict[AlertKey, str]:
    """Get severity overrides from the most recent alert per (type, ip, port)."""
    result = await db.execute(
        select(Alert.alert_type, Alert.ip, Alert.port, Alert.severity_override).where(
            Alert.network_id == network_id,
            Alert.severity_override.isnot(None),
        )
    )
    overrides: dict[AlertKey, str] = {}
    for row in result.all():
        key = (row[0], row[1], int(row[2]) if row[2] is not None else 0)
        overrides[key] = row[3]
    return overrides


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
    enabled_types = await _get_enabled_alert_types(db, alert_config)
    if not enabled_types:
        return 0

    rules_result = await db.execute(select(PortRule).where(PortRule.network_id == scan.network_id))
    rules = list(rules_result.scalars().all())
    allow_global_ranges = _build_port_ranges(
        rule for rule in rules if rule.rule_type == RuleType.ACCEPTED and rule.ip is None
    )
    block_global_ranges = _build_port_ranges(
        rule for rule in rules if rule.rule_type == RuleType.CRITICAL and rule.ip is None
    )
    allow_ranges_by_ip = _build_ip_rule_ranges(
        rule for rule in rules if rule.rule_type == RuleType.ACCEPTED and rule.ip is not None
    )
    block_ranges_by_ip = _build_ip_rule_ranges(
        rule for rule in rules if rule.rule_type == RuleType.CRITICAL and rule.ip is not None
    )
    allow_range_cache: dict[str, list[tuple[int, int]]] = {}
    block_range_cache: dict[str, list[tuple[int, int]]] = {}

    previous_ports: set[PortKey] = set()
    if AlertType.NEW_PORT in enabled_types:
        previous_ports = await _get_previous_scan_ports(db, scan)

    existing_alerts = await _get_pending_alerts(db, scan.network_id)
    severity_overrides = await _get_severity_overrides(db, scan.network_id)
    created_alert_keys: set[AlertKey] = set()
    created_count = 0
    created_alerts: list[Alert] = []

    for ip, port in current_ports:
        # Check global accepted rules first
        if await is_port_accepted(db, ip, port):
            continue

        allow_ranges = allow_range_cache.get(ip)
        if allow_ranges is None:
            allow_ranges = _combine_ranges(allow_global_ranges, allow_ranges_by_ip.get(ip))
            allow_range_cache[ip] = allow_ranges

        block_ranges = block_range_cache.get(ip)
        if block_ranges is None:
            block_ranges = _combine_ranges(block_global_ranges, block_ranges_by_ip.get(ip))
            block_range_cache[ip] = block_ranges

        allowlist_exists = len(allow_ranges) > 0

        if AlertType.NEW_PORT in enabled_types and (ip, port) not in previous_ports:
            key = (AlertType.NEW_PORT, ip, port)
            if _should_create_alert(key, existing_alerts, created_alert_keys):
                alert = Alert(
                    scan_id=scan.id,
                    network_id=scan.network_id,
                    alert_type=AlertType.NEW_PORT,
                    source="port",
                    ip=ip,
                    port=port,
                    message=f"New open port detected: {ip}:{port}",
                    severity_override=severity_overrides.get(key),
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
                    source="port",
                    ip=ip,
                    port=port,
                    message=f"Blocked port detected: {ip}:{port}",
                    severity_override=severity_overrides.get(key),
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
                    source="port",
                    ip=ip,
                    port=port,
                    message=f"Open port not in allowlist: {ip}:{port}",
                    severity_override=severity_overrides.get(key),
                )
                db.add(alert)
                created_alerts.append(alert)
                created_count += 1

    if created_alerts:
        await db.flush()
        for alert in created_alerts:
            await emit_event(
                db,
                alert_id=alert.id,
                event_type=AlertEventType.CREATED,
                scan_id=scan.id,
                description=alert.message,
            )
        await queue_alert_emails(created_alerts, network_name, alert_config, scan.id)

    # Recurrence detection: reopen resolved alerts when ports reappear
    reopened_count = await _reopen_resolved_alerts(db, scan, current_ports)

    return created_count + reopened_count


async def _reopen_resolved_alerts(
    db: AsyncSession,
    scan: Scan,
    current_ports: set[PortKey],
) -> int:
    """Reopen resolved alerts when the same port reappears in a scan.

    Skips accepted ports and alerts with port=None.
    Returns the number of alerts reopened.
    """
    result = await db.execute(
        select(Alert).where(
            Alert.network_id == scan.network_id,
            Alert.resolution_status == ResolutionStatus.RESOLVED,
        )
    )
    resolved_alerts = list(result.scalars().all())

    reopened_count = 0
    for alert in resolved_alerts:
        if alert.port is None:
            continue
        if (alert.ip, alert.port) not in current_ports:
            continue
        if await is_port_accepted(db, alert.ip, alert.port):
            continue

        alert.dismissed = False
        alert.resolution_status = ResolutionStatus.OPEN
        alert.dismiss_reason = None
        await emit_event(
            db,
            alert_id=alert.id,
            event_type=AlertEventType.RECURRENCE,
            scan_id=scan.id,
            description=f"Port {alert.ip}:{alert.port} reappeared in scan #{scan.id}",
        )
        reopened_count += 1

    return reopened_count


async def _get_pending_global_alerts(
    db: AsyncSession,
) -> set[GlobalAlertKey]:
    """Get all pending global alerts as a set of (ip, port, protocol) tuples."""
    result = await db.execute(
        select(Alert.ip, Alert.port).where(
            Alert.dismissed.is_(False),
            Alert.global_open_port_id.isnot(None),
        )
    )
    # Default protocol to tcp for legacy alerts
    return {(row[0], int(row[1]), "tcp") for row in result.all()}


async def generate_global_alerts_for_scan(
    db: AsyncSession,
    scan: Scan,
    open_ports_data: list[tuple[str, int, str, str | None, str | None, str | None, str | None]]
    | None = None,
) -> int:
    """
    Generate global alerts for a completed scan.

    This function:
    1. Upserts each open port into global_open_ports
    2. If the port is new (never seen globally) AND not globally accepted -> create alert

    Args:
        db: Database session
        scan: The completed scan
        open_ports_data: Optional list of tuples
                        (ip, port, protocol, banner, service_guess, mac_address, mac_vendor)
                        If None, will fetch from database

    Returns:
        Number of alerts created
    """
    if scan.status != ScanStatus.COMPLETED:
        return 0

    # Fetch open ports data from database if not provided
    if open_ports_data is None:
        result = await db.execute(
            select(
                OpenPort.ip,
                OpenPort.port,
                OpenPort.protocol,
                OpenPort.banner,
                OpenPort.service_guess,
                OpenPort.mac_address,
                OpenPort.mac_vendor,
            ).where(OpenPort.scan_id == scan.id)
        )
        open_ports_data = [
            (row[0], int(row[1]), row[2], row[3], row[4], row[5], row[6]) for row in result.all()
        ]

    if not open_ports_data:
        return 0

    # Get network info for context (optional, used for email notifications)
    network_result = await db.execute(
        select(Network.alert_config, Network.name).where(Network.id == scan.network_id)
    )
    network_row = network_result.first()
    alert_config = network_row[0] if network_row else None
    network_name = str(network_row[1]) if network_row and network_row[1] else None

    # Get existing pending global alerts to avoid duplicates
    existing_global_alerts = await _get_pending_global_alerts(db)
    created_alert_keys: set[GlobalAlertKey] = set()
    created_count = 0
    created_alerts: list[Alert] = []

    # Load network-level ACCEPT rules to skip accepted ports
    rules_result = await db.execute(
        select(PortRule).where(
            PortRule.network_id == scan.network_id,
            PortRule.rule_type == RuleType.ACCEPTED,
        )
    )
    network_accept_rules = list(rules_result.scalars().all())
    net_allow_global_ranges = _build_port_ranges(
        rule for rule in network_accept_rules if rule.ip is None
    )
    net_allow_ranges_by_ip = _build_ip_rule_ranges(
        rule for rule in network_accept_rules if rule.ip is not None
    )

    for ip, port, protocol, banner, service_guess, mac_address, mac_vendor in open_ports_data:
        # Look up the host by IP to link the port to it
        host = await get_host_by_ip(db, ip)
        host_id = host.id if host else None

        # Upsert into global_open_ports
        global_port, is_new = await upsert_global_open_port(
            db,
            ip=ip,
            port=port,
            protocol=protocol,
            network_id=scan.network_id,
            banner=banner,
            service_guess=service_guess,
            mac_address=mac_address,
            mac_vendor=mac_vendor,
            host_id=host_id,
        )

        # Check if port is globally accepted
        if await is_port_accepted(db, ip, port):
            continue

        # Check if port is accepted by network-level rules
        net_allow_ranges = _combine_ranges(net_allow_global_ranges, net_allow_ranges_by_ip.get(ip))
        if _port_in_ranges(port, net_allow_ranges):
            continue

        # Check if we already have a pending alert for this
        key: GlobalAlertKey = (ip, port, protocol)
        if key in existing_global_alerts or key in created_alert_keys:
            continue

        # Create the alert
        alert = Alert(
            scan_id=scan.id,
            network_id=scan.network_id,
            global_open_port_id=global_port.id,
            alert_type=AlertType.NEW_PORT,
            source="port",
            ip=ip,
            port=port,
            message=f"New open port detected globally: {ip}:{port}",
        )
        db.add(alert)
        created_alerts.append(alert)
        created_alert_keys.add(key)
        created_count += 1

    if created_alerts:
        await db.flush()
        for alert in created_alerts:
            await emit_event(
                db,
                alert_id=alert.id,
                event_type=AlertEventType.CREATED,
                scan_id=scan.id,
                description=alert.message,
            )
        await queue_global_alert_emails(created_alerts, network_name, alert_config, scan.id)

    # Recurrence detection for global alerts
    global_ports: set[PortKey] = {(ip, port) for ip, port, *_ in open_ports_data}
    reopened_count = await _reopen_resolved_alerts(db, scan, global_ports)

    return created_count + reopened_count
