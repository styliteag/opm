"""SSH alert generation for scan results."""

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.lib.ssh_utils import is_version_outdated, parse_ssh_version
from app.models.alert import Alert, AlertType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus
from app.models.ssh_scan_result import SSHScanResult
from app.services.alert_generation import _get_enabled_alert_types, _get_severity_overrides
from app.services.alert_queries import SSH_ALERT_TYPES
from app.services.alert_rules import is_ssh_accepted
from app.services.email_alerts import queue_alert_emails

logger = logging.getLogger(__name__)

SSHAlertKey = tuple[AlertType, str, int]  # (alert_type, ip, port)
SSHResultKey = tuple[str, int]  # (host_ip, port)

# Default minimum SSH version threshold for outdated version alerts
DEFAULT_SSH_VERSION_THRESHOLD = "8.0.0"

# Aliases for backward compatibility with routers that import these names
_parse_ssh_version = parse_ssh_version
_is_version_outdated = is_version_outdated


async def _get_pending_ssh_alerts(db: AsyncSession, network_id: int) -> set[SSHAlertKey]:
    """Get all pending SSH alerts for a network as a set of (alert_type, ip, port) tuples."""
    result = await db.execute(
        select(Alert.alert_type, Alert.ip, Alert.port).where(
            Alert.network_id == network_id,
            Alert.dismissed.is_(False),
            Alert.alert_type.in_(SSH_ALERT_TYPES),
        )
    )
    return {(row[0], row[1], int(row[2])) for row in result.all()}


def _extract_weak_algorithms(algorithms: list[dict[str, Any]] | None) -> list[str]:
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
    result = await db.execute(select(SSHScanResult).where(SSHScanResult.scan_id == scan.id))
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

    # Get existing pending SSH alerts to avoid duplicates
    existing_alerts = await _get_pending_ssh_alerts(db, scan.network_id)
    severity_overrides = await _get_severity_overrides(db, scan.network_id)
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
        if AlertType.SSH_INSECURE_AUTH in enabled_types and not await is_ssh_accepted(
            db, ip, port, AlertType.SSH_INSECURE_AUTH.value
        ):
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
                        source="ssh",
                        ip=ip,
                        port=port,
                        message=message,
                        severity_override=severity_overrides.get(key),
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

        # Check for weak ciphers
        if AlertType.SSH_WEAK_CIPHER in enabled_types and not await is_ssh_accepted(
            db, ip, port, AlertType.SSH_WEAK_CIPHER.value
        ):
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
                        source="ssh",
                        ip=ip,
                        port=port,
                        message=message,
                        severity_override=severity_overrides.get(key),
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

        # Check for weak key exchange algorithms
        if AlertType.SSH_WEAK_KEX in enabled_types and not await is_ssh_accepted(
            db, ip, port, AlertType.SSH_WEAK_KEX.value
        ):
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
                        source="ssh",
                        ip=ip,
                        port=port,
                        message=message,
                        severity_override=severity_overrides.get(key),
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

        # Check for outdated SSH version
        if AlertType.SSH_OUTDATED_VERSION in enabled_types and not await is_ssh_accepted(
            db, ip, port, AlertType.SSH_OUTDATED_VERSION.value
        ):
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
                        source="ssh",
                        ip=ip,
                        port=port,
                        message=message,
                        severity_override=severity_overrides.get(key),
                    )
                    db.add(alert)
                    created_alerts.append(alert)
                    created_alert_keys.add(key)
                    created_count += 1

    # Queue email notifications
    if created_alerts:
        await queue_alert_emails(created_alerts, network_name, alert_config, scan.id)

    return created_count


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


def _detect_ssh_regressions(current: SSHScanResult, previous: SSHScanResult) -> list[str]:
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


def _detect_ssh_improvements(current: SSHScanResult, previous: SSHScanResult) -> list[str]:
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
    if scan.status != ScanStatus.COMPLETED:
        return 0

    # Fetch SSH scan results for this scan
    result = await db.execute(select(SSHScanResult).where(SSHScanResult.scan_id == scan.id))
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

    # Get existing pending SSH alerts to avoid duplicates
    existing_alerts = await _get_pending_ssh_alerts(db, scan.network_id)
    severity_overrides = await _get_severity_overrides(db, scan.network_id)
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
                AlertType.SSH_CONFIG_REGRESSION,
                current.host_ip,
                current.port,
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
                    source="ssh",
                    ip=current.host_ip,
                    port=current.port,
                    message=message,
                    severity_override=severity_overrides.get(alert_key),
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
