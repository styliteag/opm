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
from app.models.ssh_scan_result import SSHScanResult
from app.services.email_alerts import queue_alert_emails, queue_global_alert_emails
from app.services.global_open_ports import upsert_global_open_port
from app.services.global_port_rules import is_port_whitelisted
from app.services.hosts import get_host_by_ip
import app.services.global_settings as global_settings_service

PortKey = tuple[str, int]
AlertKey = tuple[AlertType, str, int]
GlobalAlertKey = tuple[str, int, str]  # (ip, port, protocol)


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
) -> list[tuple[Alert, str | None]]:
    """List alerts with optional filters and pagination."""
    query = select(Alert, Network.name).outerjoin(Network, Alert.network_id == Network.id)
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

    query = query.order_by(Alert.created_at.desc(), Alert.id.desc()).offset(offset).limit(limit)
    result = await db.execute(query)
    return [(row[0], str(row[1]) if row[1] is not None else None) for row in result.all()]


async def acknowledge_alert(db: AsyncSession, alert: Alert) -> Alert:
    """Mark an alert as acknowledged."""
    alert.acknowledged = True
    await db.flush()
    await db.refresh(alert)
    return alert


async def acknowledge_alerts(db: AsyncSession, alerts: list[Alert]) -> list[Alert]:
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


async def _get_unacknowledged_alerts(db: AsyncSession, network_id: int) -> set[AlertKey]:
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
    enabled_types = await _get_enabled_alert_types(db, alert_config)
    if not enabled_types:
        return 0

    rules_result = await db.execute(select(PortRule).where(PortRule.network_id == scan.network_id))
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
        # Check global whitelist first
        if await is_port_whitelisted(db, ip, port):
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


async def _get_unacknowledged_global_alerts(
    db: AsyncSession,
) -> set[GlobalAlertKey]:
    """Get all unacknowledged global alerts as a set of (ip, port, protocol) tuples."""
    result = await db.execute(
        select(Alert.ip, Alert.port).where(
            Alert.acknowledged.is_(False),
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
    2. If the port is new (never seen globally) AND not in global whitelist -> create alert

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

    # Get existing unacknowledged global alerts to avoid duplicates
    existing_global_alerts = await _get_unacknowledged_global_alerts(db)
    created_alert_keys: set[GlobalAlertKey] = set()
    created_count = 0
    created_alerts: list[Alert] = []

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

        # Only create alert if this is a NEW global port
        if not is_new:
            continue

        # Check if port is in global whitelist
        if await is_port_whitelisted(db, ip, port):
            continue

        # Check if we already have an unacknowledged alert for this
        key: GlobalAlertKey = (ip, port, protocol)
        if key in existing_global_alerts or key in created_alert_keys:
            continue

        # Create the alert
        alert = Alert(
            scan_id=scan.id,
            network_id=scan.network_id,
            global_open_port_id=global_port.id,
            alert_type=AlertType.NEW_PORT,
            ip=ip,
            port=port,
            message=f"New open port detected globally: {ip}:{port}",
        )
        db.add(alert)
        created_alerts.append(alert)
        created_alert_keys.add(key)
        created_count += 1

    if created_alerts:
        await queue_global_alert_emails(created_alerts, network_name, alert_config, scan.id)

    return created_count


SSHAlertKey = tuple[AlertType, str, int]  # (alert_type, ip, port)

# SSH alert types to check for unacknowledged alerts
SSH_ALERT_TYPES = (
    AlertType.SSH_INSECURE_AUTH,
    AlertType.SSH_WEAK_CIPHER,
    AlertType.SSH_WEAK_KEX,
    AlertType.SSH_OUTDATED_VERSION,
)

# Default minimum SSH version threshold for outdated version alerts
DEFAULT_SSH_VERSION_THRESHOLD = "8.0.0"


def _parse_ssh_version(version_str: str | None) -> tuple[int, int, int] | None:
    """Parse SSH version string into a tuple of (major, minor, patch).

    Handles various SSH version formats:
    - "OpenSSH_8.2p1" -> (8, 2, 0)
    - "OpenSSH_7.9" -> (7, 9, 0)
    - "8.2p1" -> (8, 2, 0)
    - "8.2" -> (8, 2, 0)
    - "8" -> (8, 0, 0)

    Returns None if version cannot be parsed.
    """
    import re

    if not version_str:
        return None

    # Strip common prefixes like "OpenSSH_" or "SSH-"
    cleaned = version_str
    for prefix in ["OpenSSH_", "SSH-", "openssh_", "ssh-"]:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix):]
            break

    # Match version pattern: major.minor.patch or major.minor
    # Also handles suffixes like "p1", "p2", etc.
    match = re.match(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:p\d+)?", cleaned)
    if not match:
        return None

    major = int(match.group(1))
    minor = int(match.group(2)) if match.group(2) else 0
    patch = int(match.group(3)) if match.group(3) else 0

    return (major, minor, patch)


def _is_version_outdated(
    version_str: str | None, threshold_str: str
) -> bool:
    """Check if an SSH version is below the threshold.

    Args:
        version_str: The detected SSH version string
        threshold_str: The minimum acceptable version (e.g., "8.0.0")

    Returns:
        True if version is outdated (below threshold), False otherwise.
        Returns False if version cannot be parsed.
    """
    parsed_version = _parse_ssh_version(version_str)
    threshold_version = _parse_ssh_version(threshold_str)

    if parsed_version is None or threshold_version is None:
        return False

    return parsed_version < threshold_version


async def _get_unacknowledged_ssh_alerts(
    db: AsyncSession, network_id: int
) -> set[SSHAlertKey]:
    """Get all unacknowledged SSH alerts for a network as a set of (alert_type, ip, port) tuples."""
    result = await db.execute(
        select(Alert.alert_type, Alert.ip, Alert.port).where(
            Alert.network_id == network_id,
            Alert.acknowledged.is_(False),
            Alert.alert_type.in_(SSH_ALERT_TYPES),
        )
    )
    return {(row[0], row[1], int(row[2])) for row in result.all()}


def _extract_weak_algorithms(
    algorithms: list[dict[str, Any]] | None
) -> list[str]:
    """Extract names of weak algorithms from a list of algorithm dicts.

    Each algorithm dict should have 'name' and 'is_weak' fields.
    """
    if not algorithms:
        return []
    return [
        algo.get("name", "unknown")
        for algo in algorithms
        if isinstance(algo, dict) and algo.get("is_weak", False)
    ]


async def generate_ssh_alerts_for_scan(
    db: AsyncSession,
    scan: Scan,
) -> int:
    """
    Generate SSH alerts for a completed scan.

    This function:
    1. Queries SSHScanResult records for the scan
    2. Checks for insecure auth (password/keyboard-interactive enabled)
    3. Checks for weak ciphers (DES, 3DES, RC4, Blowfish, CBC modes)
    4. Checks for weak KEX algorithms (sha1-based, weak DH groups)
    5. Creates alerts with deduplication
    6. Queues email notifications

    Args:
        db: Database session
        scan: The completed scan

    Returns:
        Number of alerts created
    """
    if scan.status != ScanStatus.COMPLETED:
        return 0

    # Fetch SSH scan results for this scan
    result = await db.execute(
        select(SSHScanResult).where(SSHScanResult.scan_id == scan.id)
    )
    ssh_results = list(result.scalars().all())

    if not ssh_results:
        return 0

    # Get network info for context and alert config
    network_result = await db.execute(
        select(Network.alert_config, Network.name).where(Network.id == scan.network_id)
    )
    network_row = network_result.first()
    if network_row is None:
        return 0

    alert_config, network_name = network_row
    enabled_types = await _get_enabled_alert_types(db, alert_config)

    # Check if any SSH alert types are enabled
    ssh_types_enabled = {
        AlertType.SSH_INSECURE_AUTH,
        AlertType.SSH_WEAK_CIPHER,
        AlertType.SSH_WEAK_KEX,
        AlertType.SSH_OUTDATED_VERSION,
    }.intersection(enabled_types)
    if not ssh_types_enabled:
        return 0

    # Get existing unacknowledged SSH alerts to avoid duplicates
    existing_alerts = await _get_unacknowledged_ssh_alerts(db, scan.network_id)
    created_alert_keys: set[SSHAlertKey] = set()
    created_count = 0
    created_alerts: list[Alert] = []

    for ssh_result in ssh_results:
        ip = ssh_result.host_ip
        port = ssh_result.port

        # Version info suffix for all alerts
        version_info = ""
        if ssh_result.ssh_version:
            version_info = f" (SSH {ssh_result.ssh_version})"

        # Check for insecure authentication methods
        if AlertType.SSH_INSECURE_AUTH in enabled_types:
            if ssh_result.password_enabled or ssh_result.keyboard_interactive_enabled:
                # Build alert message with details about which auth methods are enabled
                auth_methods: list[str] = []
                if ssh_result.password_enabled:
                    auth_methods.append("password")
                if ssh_result.keyboard_interactive_enabled:
                    auth_methods.append("keyboard-interactive")
                auth_methods_str = ", ".join(auth_methods)

                # Check for duplicate alerts (same alert_type, ip, port)
                key: SSHAlertKey = (AlertType.SSH_INSECURE_AUTH, ip, port)
                if key not in existing_alerts and key not in created_alert_keys:
                    message = (
                        f"SSH server allows insecure authentication methods: "
                        f"{auth_methods_str}{version_info} on {ip}:{port}"
                    )

                    alert = Alert(
                        scan_id=scan.id,
                        network_id=scan.network_id,
                        alert_type=AlertType.SSH_INSECURE_AUTH,
                        ip=ip,
                        port=port,
                        message=message,
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

        # Check for weak ciphers
        if AlertType.SSH_WEAK_CIPHER in enabled_types:
            weak_ciphers = _extract_weak_algorithms(ssh_result.supported_ciphers)
            if weak_ciphers:
                key = (AlertType.SSH_WEAK_CIPHER, ip, port)
                if key not in existing_alerts and key not in created_alert_keys:
                    weak_ciphers_str = ", ".join(weak_ciphers)
                    message = (
                        f"SSH server supports weak ciphers: "
                        f"{weak_ciphers_str}{version_info} on {ip}:{port}"
                    )

                    alert = Alert(
                        scan_id=scan.id,
                        network_id=scan.network_id,
                        alert_type=AlertType.SSH_WEAK_CIPHER,
                        ip=ip,
                        port=port,
                        message=message,
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

        # Check for weak key exchange algorithms
        if AlertType.SSH_WEAK_KEX in enabled_types:
            weak_kex = _extract_weak_algorithms(ssh_result.kex_algorithms)
            if weak_kex:
                key = (AlertType.SSH_WEAK_KEX, ip, port)
                if key not in existing_alerts and key not in created_alert_keys:
                    weak_kex_str = ", ".join(weak_kex)
                    message = (
                        f"SSH server supports weak key exchange algorithms: "
                        f"{weak_kex_str}{version_info} on {ip}:{port}"
                    )

                    alert = Alert(
                        scan_id=scan.id,
                        network_id=scan.network_id,
                        alert_type=AlertType.SSH_WEAK_KEX,
                        ip=ip,
                        port=port,
                        message=message,
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

        # Check for outdated SSH version
        if AlertType.SSH_OUTDATED_VERSION in enabled_types:
            # Get version threshold from alert_config or use default
            version_threshold = DEFAULT_SSH_VERSION_THRESHOLD
            if alert_config and isinstance(alert_config.get("ssh_version_threshold"), str):
                version_threshold = alert_config["ssh_version_threshold"]

            if _is_version_outdated(ssh_result.ssh_version, version_threshold):
                key = (AlertType.SSH_OUTDATED_VERSION, ip, port)
                if key not in existing_alerts and key not in created_alert_keys:
                    detected_version = ssh_result.ssh_version or "unknown"
                    message = (
                        f"SSH server running outdated version: {detected_version} "
                        f"(recommended minimum: {version_threshold}) on {ip}:{port}"
                    )

                    alert = Alert(
                        scan_id=scan.id,
                        network_id=scan.network_id,
                        alert_type=AlertType.SSH_OUTDATED_VERSION,
                        ip=ip,
                        port=port,
                        message=message,
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

    # Queue email notifications
    if created_alerts:
        await queue_alert_emails(created_alerts, network_name, alert_config, scan.id)

    return created_count


SSHResultKey = tuple[str, int]  # (host_ip, port)


async def _get_previous_ssh_results(
    db: AsyncSession, scan: Scan
) -> dict[SSHResultKey, SSHScanResult]:
    """Get SSH scan results from the previous completed scan for this network.

    Returns a dict mapping (host_ip, port) to SSHScanResult for easy lookup.
    """
    # Find the previous completed scan for this network
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
        return {}

    # Get SSH results from the previous scan
    ssh_result = await db.execute(
        select(SSHScanResult).where(SSHScanResult.scan_id == previous_scan_id)
    )
    ssh_results = list(ssh_result.scalars().all())

    # Build lookup dict
    return {(r.host_ip, r.port): r for r in ssh_results}


def _get_algorithm_names(algorithms: list[dict[str, Any]] | None) -> set[str]:
    """Extract algorithm names from a list of algorithm dicts."""
    if not algorithms:
        return set()
    return {algo.get("name", "") for algo in algorithms if isinstance(algo, dict)}


def _get_weak_algorithm_names(algorithms: list[dict[str, Any]] | None) -> set[str]:
    """Extract names of weak algorithms from a list of algorithm dicts."""
    if not algorithms:
        return set()
    return {
        algo.get("name", "")
        for algo in algorithms
        if isinstance(algo, dict) and algo.get("is_weak", False)
    }


def _detect_ssh_regressions(
    current: SSHScanResult, previous: SSHScanResult
) -> list[str]:
    """Detect security regressions between current and previous SSH scan results.

    Returns a list of regression descriptions. Empty list means no regressions.

    Regressions include:
    - Password auth enabled (was disabled)
    - Keyboard-interactive auth enabled (was disabled)
    - Weak ciphers added
    - Weak KEX algorithms added
    """
    regressions: list[str] = []

    # Check auth method regressions
    if current.password_enabled and not previous.password_enabled:
        regressions.append("password authentication was enabled")

    if current.keyboard_interactive_enabled and not previous.keyboard_interactive_enabled:
        regressions.append("keyboard-interactive authentication was enabled")

    # Check for newly added weak ciphers
    prev_weak_ciphers = _get_weak_algorithm_names(previous.supported_ciphers)
    curr_weak_ciphers = _get_weak_algorithm_names(current.supported_ciphers)
    new_weak_ciphers = curr_weak_ciphers - prev_weak_ciphers
    if new_weak_ciphers:
        regressions.append(f"weak ciphers added: {', '.join(sorted(new_weak_ciphers))}")

    # Check for newly added weak KEX algorithms
    prev_weak_kex = _get_weak_algorithm_names(previous.kex_algorithms)
    curr_weak_kex = _get_weak_algorithm_names(current.kex_algorithms)
    new_weak_kex = curr_weak_kex - prev_weak_kex
    if new_weak_kex:
        regressions.append(f"weak KEX algorithms added: {', '.join(sorted(new_weak_kex))}")

    return regressions


def _detect_ssh_improvements(
    current: SSHScanResult, previous: SSHScanResult
) -> list[str]:
    """Detect security improvements between current and previous SSH scan results.

    Returns a list of improvement descriptions. Empty list means no improvements.

    Improvements include:
    - Password auth disabled (was enabled)
    - Keyboard-interactive auth disabled (was enabled)
    - Weak ciphers removed
    - Weak KEX algorithms removed
    """
    improvements: list[str] = []

    # Check auth method improvements
    if not current.password_enabled and previous.password_enabled:
        improvements.append("password authentication was disabled")

    if not current.keyboard_interactive_enabled and previous.keyboard_interactive_enabled:
        improvements.append("keyboard-interactive authentication was disabled")

    # Check for removed weak ciphers
    prev_weak_ciphers = _get_weak_algorithm_names(previous.supported_ciphers)
    curr_weak_ciphers = _get_weak_algorithm_names(current.supported_ciphers)
    removed_weak_ciphers = prev_weak_ciphers - curr_weak_ciphers
    if removed_weak_ciphers:
        improvements.append(f"weak ciphers removed: {', '.join(sorted(removed_weak_ciphers))}")

    # Check for removed weak KEX algorithms
    prev_weak_kex = _get_weak_algorithm_names(previous.kex_algorithms)
    curr_weak_kex = _get_weak_algorithm_names(current.kex_algorithms)
    removed_weak_kex = prev_weak_kex - curr_weak_kex
    if removed_weak_kex:
        improvements.append(f"weak KEX algorithms removed: {', '.join(sorted(removed_weak_kex))}")

    return improvements


async def generate_ssh_regression_alerts_for_scan(
    db: AsyncSession,
    scan: Scan,
) -> int:
    """
    Generate SSH_CONFIG_REGRESSION alerts for security regressions in SSH configuration.

    This function:
    1. Gets SSH results from the previous completed scan for this network
    2. Compares each host/port configuration to detect regressions
    3. Creates SSH_CONFIG_REGRESSION alerts for regressions
    4. Logs informational events for improvements (no alerts)

    Args:
        db: Database session
        scan: The completed scan

    Returns:
        Number of alerts created
    """
    import logging

    logger = logging.getLogger(__name__)

    if scan.status != ScanStatus.COMPLETED:
        return 0

    # Fetch SSH scan results for this scan
    result = await db.execute(
        select(SSHScanResult).where(SSHScanResult.scan_id == scan.id)
    )
    current_results = list(result.scalars().all())

    if not current_results:
        return 0

    # Get previous scan's SSH results
    previous_results = await _get_previous_ssh_results(db, scan)
    if not previous_results:
        # No previous scan to compare against
        return 0

    # Get network info for context and alert config
    network_result = await db.execute(
        select(Network.alert_config, Network.name).where(Network.id == scan.network_id)
    )
    network_row = network_result.first()
    if network_row is None:
        return 0

    alert_config, network_name = network_row
    enabled_types = await _get_enabled_alert_types(db, alert_config)

    # Check if SSH_CONFIG_REGRESSION is enabled
    if AlertType.SSH_CONFIG_REGRESSION not in enabled_types:
        return 0

    # Get existing unacknowledged SSH alerts to avoid duplicates
    existing_alerts = await _get_unacknowledged_ssh_alerts(db, scan.network_id)
    created_alert_keys: set[SSHAlertKey] = set()
    created_count = 0
    created_alerts: list[Alert] = []

    for current in current_results:
        key_tuple: SSHResultKey = (current.host_ip, current.port)
        previous = previous_results.get(key_tuple)

        if previous is None:
            # New SSH service, no comparison possible
            continue

        # Detect regressions
        regressions = _detect_ssh_regressions(current, previous)
        if regressions:
            alert_key: SSHAlertKey = (
                AlertType.SSH_CONFIG_REGRESSION, current.host_ip, current.port
            )
            if alert_key not in existing_alerts and alert_key not in created_alert_keys:
                regression_details = "; ".join(regressions)
                version_info = f" (SSH {current.ssh_version})" if current.ssh_version else ""
                message = (
                    f"SSH security regression detected{version_info} on "
                    f"{current.host_ip}:{current.port}: {regression_details}"
                )

                alert = Alert(
                    scan_id=scan.id,
                    network_id=scan.network_id,
                    alert_type=AlertType.SSH_CONFIG_REGRESSION,
                    ip=current.host_ip,
                    port=current.port,
                    message=message,
                )
                db.add(alert)
                created_alerts.append(alert)
                created_alert_keys.add(alert_key)
                created_count += 1

        # Detect improvements (log only, no alerts)
        improvements = _detect_ssh_improvements(current, previous)
        if improvements:
            improvement_details = "; ".join(improvements)
            logger.info(
                "SSH security improvement on %s:%d: %s",
                current.host_ip,
                current.port,
                improvement_details,
            )

    # Queue email notifications
    if created_alerts:
        await queue_alert_emails(created_alerts, network_name, alert_config, scan.id)

    return created_count
