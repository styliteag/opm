"""Network management service for CRUD operations."""

from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner


async def get_all_networks(db: AsyncSession) -> list[Network]:
    """Get all networks."""
    stmt = select(Network).order_by(Network.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_network_by_id(db: AsyncSession, network_id: int) -> Network | None:
    """Get a network by its ID."""
    stmt = select(Network).where(Network.id == network_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_network_by_name(db: AsyncSession, name: str) -> Network | None:
    """Get a network by its name."""
    stmt = select(Network).where(Network.name == name)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_networks_by_scanner_id(db: AsyncSession, scanner_id: int) -> list[Network]:
    """Get all networks for a specific scanner."""
    stmt = (
        select(Network).where(Network.scanner_id == scanner_id).order_by(Network.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_network(
    db: AsyncSession,
    name: str,
    cidr: str,
    port_spec: str,
    scanner_id: int,
    scan_schedule: str | None = None,
    scan_rate: int | None = None,
    scan_timeout: int | None = None,
    port_timeout: int | None = None,
    scanner_type: str = "masscan",
    scan_protocol: str = "tcp",
    alert_config: dict[str, Any] | None = None,
    nse_profile_id: int | None = None,
    host_discovery_enabled: bool = True,
    phases: list[dict[str, Any]] | None = None,
    gvm_scan_config: str | None = None,
) -> Network:
    """Create a new network."""
    network = Network(
        name=name,
        cidr=cidr,
        port_spec=port_spec,
        scanner_id=scanner_id,
        scan_schedule=scan_schedule,
        scan_rate=scan_rate,
        scan_timeout=scan_timeout,
        port_timeout=port_timeout,
        scanner_type=scanner_type,
        scan_protocol=scan_protocol,
        alert_config=alert_config,
        nse_profile_id=nse_profile_id,
        host_discovery_enabled=host_discovery_enabled,
        phases=phases,
        gvm_scan_config=gvm_scan_config,
    )
    db.add(network)
    await db.flush()
    await db.refresh(network)
    return network


async def update_network(
    db: AsyncSession,
    network: Network,
    name: str | None = None,
    cidr: str | None = None,
    port_spec: str | None = None,
    scanner_id: int | None = None,
    scan_schedule: str | None = None,
    scan_rate: int | None = None,
    scan_timeout: int | None = None,
    port_timeout: int | None = None,
    scanner_type: str | None = None,
    scan_protocol: str | None = None,
    alert_config: dict[str, Any] | None = None,
    nse_profile_id: int | None = None,
    clear_nse_profile: bool = False,
    host_discovery_enabled: bool | None = None,
    phases: list[dict[str, Any]] | None = None,
    clear_phases: bool = False,
    clear_schedule: bool = False,
    clear_alert_config: bool = False,
    gvm_scan_config: str | None = None,
    clear_gvm_scan_config: bool = False,
) -> Network:
    """Update an existing network.

    Args:
        db: Database session
        network: Network to update
        name: New name (if provided)
        cidr: New CIDR (if provided)
        port_spec: New port spec (if provided)
        scanner_id: New scanner ID (if provided)
        scan_schedule: New scan schedule (if provided)
        scan_rate: New scan rate (if provided)
        scan_timeout: New scan timeout (if provided)
        port_timeout: New port timeout (if provided)
        scanner_type: New scanner type (if provided)
        scan_protocol: New scan protocol (if provided)
        alert_config: New alert config (if provided)
        host_discovery_enabled: New host discovery enabled flag (if provided)
        clear_schedule: If True, clear the scan_schedule even if None
        clear_alert_config: If True, clear the alert_config even if None
    """
    if name is not None:
        network.name = name
    if cidr is not None:
        network.cidr = cidr
    if port_spec is not None:
        network.port_spec = port_spec
    if scanner_id is not None:
        network.scanner_id = scanner_id
    if scan_schedule is not None or clear_schedule:
        network.scan_schedule = scan_schedule
    if scan_rate is not None:
        network.scan_rate = scan_rate
    if scan_timeout is not None:
        network.scan_timeout = scan_timeout
    if port_timeout is not None:
        network.port_timeout = port_timeout
    if scan_protocol is not None:
        network.scan_protocol = scan_protocol
    if alert_config is not None or clear_alert_config:
        network.alert_config = alert_config
    if nse_profile_id is not None or clear_nse_profile:
        network.nse_profile_id = nse_profile_id
    if host_discovery_enabled is not None:
        network.host_discovery_enabled = host_discovery_enabled
    if phases is not None or clear_phases:
        network.phases = phases
    if gvm_scan_config is not None or clear_gvm_scan_config:
        network.gvm_scan_config = gvm_scan_config
    if scanner_type is not None:
        network.scanner_type = scanner_type
        # Sync phases port_scan tool — must run AFTER phases assignment
        # so frontend-sent phases don't overwrite the tool sync
        if network.phases is not None:
            updated_phases = [
                {**phase, "tool": scanner_type}
                if phase.get("name") == "port_scan"
                else phase
                for phase in network.phases
            ]
            network.phases = updated_phases

    await db.flush()
    await db.refresh(network)
    return network


async def get_network_overview(db: AsyncSession, network_id: int) -> dict[str, Any] | None:
    """Get aggregated overview stats for a network."""
    network = await get_network_by_id(db, network_id)
    if network is None:
        return None

    # Scanner info
    scanner_result = await db.execute(select(Scanner).where(Scanner.id == network.scanner_id))
    scanner = scanner_result.scalar_one_or_none()
    scanner_name = scanner.name if scanner else "Unknown"
    scanner_online = False
    if scanner and scanner.last_seen_at:
        scanner_online = (
            datetime.now(timezone.utc) - scanner.last_seen_at.replace(tzinfo=timezone.utc)
        ) < timedelta(minutes=5)

    # Active alerts (not dismissed) for this network
    alert_count_result = await db.execute(
        select(func.count(Alert.id)).where(
            and_(Alert.network_id == network_id, Alert.dismissed == False)  # noqa: E712
        )
    )
    active_alert_count = alert_count_result.scalar() or 0

    # Alert severity distribution — compute from alert_type
    # Group by alert_type for active alerts, then map to severity
    severity_dist_result = await db.execute(
        select(Alert.alert_type, func.count(Alert.id))
        .where(
            and_(Alert.network_id == network_id, Alert.dismissed == False)  # noqa: E712
        )
        .group_by(Alert.alert_type)
    )
    severity_map = {
        "blocked": "critical",
        "ssh_weak_cipher": "high",
        "ssh_weak_kex": "high",
        "ssh_insecure_auth": "high",
        "ssh_outdated_version": "medium",
        "ssh_config_regression": "medium",
        "nse_cve_detected": "critical",
        "nse_vulnerability": "high",
        "not_allowed": "high",
        "new_port": "medium",
    }
    alert_severity_distribution: dict[str, int] = {}
    for alert_type, count in severity_dist_result.all():
        severity = severity_map.get(
            alert_type.value if hasattr(alert_type, "value") else str(alert_type), "info"
        )
        alert_severity_distribution[severity] = alert_severity_distribution.get(severity, 0) + count

    # Scan stats for last 30 days
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    scan_stats_result = await db.execute(
        select(Scan.status, func.count(Scan.id))
        .where(
            and_(
                Scan.network_id == network_id,
                Scan.started_at >= thirty_days_ago,
            )
        )
        .group_by(Scan.status)
    )
    total_scans_30d = 0
    completed_scans_30d = 0
    for scan_status, count in scan_stats_result.all():
        total_scans_30d += count
        if scan_status == ScanStatus.COMPLETED:
            completed_scans_30d = count

    scan_success_rate = completed_scans_30d / total_scans_30d if total_scans_30d > 0 else 0.0

    # Open port count from latest completed scan
    latest_scan_result = await db.execute(
        select(Scan)
        .where(
            and_(
                Scan.network_id == network_id,
                Scan.status == ScanStatus.COMPLETED,
            )
        )
        .order_by(Scan.id.desc())
        .limit(1)
    )
    latest_scan = latest_scan_result.scalar_one_or_none()

    open_port_count = 0
    last_scan_summary = None
    if latest_scan:
        port_count_result = await db.execute(
            select(func.count(OpenPort.id)).where(OpenPort.scan_id == latest_scan.id)
        )
        open_port_count = port_count_result.scalar() or 0
        last_scan_summary = {
            "id": latest_scan.id,
            "status": latest_scan.status.value,
            "started_at": latest_scan.started_at,
            "completed_at": latest_scan.completed_at,
            "trigger_type": latest_scan.trigger_type.value,
            "port_count": open_port_count,
        }

    # Host count — distinct IPs from latest scan (SQLite-compatible)
    host_count_result = (
        await db.execute(
            select(func.count(func.distinct(OpenPort.ip))).where(OpenPort.scan_id == latest_scan.id)
        )
        if latest_scan
        else None
    )
    host_count = host_count_result.scalar() or 0 if host_count_result else 0

    return {
        "network": network,
        "host_count": host_count,
        "active_alert_count": active_alert_count,
        "alert_severity_distribution": alert_severity_distribution,
        "open_port_count": open_port_count,
        "scan_success_rate": round(scan_success_rate, 4),
        "total_scans_30d": total_scans_30d,
        "completed_scans_30d": completed_scans_30d,
        "last_scan": last_scan_summary,
        "scanner_name": scanner_name,
        "scanner_online": scanner_online,
    }


async def delete_network(db: AsyncSession, network: Network) -> None:
    """Delete a network (cascades to scans, rules, exclusions)."""
    await db.delete(network)
    await db.flush()
