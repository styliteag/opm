"""Host discovery scan management service."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.global_open_port import GlobalOpenPort
from app.models.host import Host
from app.models.host_discovery_scan import (
    HostDiscoveryScan,
    HostDiscoveryScanStatus,
    HostDiscoveryTriggerType,
)
from app.models.network import Network


async def create_host_discovery_scan(
    db: AsyncSession,
    network: Network,
    trigger_type: HostDiscoveryTriggerType = HostDiscoveryTriggerType.MANUAL,
) -> HostDiscoveryScan:
    """
    Create a new host discovery scan for a network.

    Creates a scan record with status 'planned'.
    """
    scan = HostDiscoveryScan(
        network_id=network.id,
        scanner_id=network.scanner_id,
        status=HostDiscoveryScanStatus.PLANNED,
        trigger_type=trigger_type,
    )
    db.add(scan)
    await db.flush()
    return scan


async def get_host_discovery_scan_by_id(
    db: AsyncSession,
    scan_id: int,
) -> HostDiscoveryScan | None:
    """Get a host discovery scan by ID."""
    result = await db.execute(
        select(HostDiscoveryScan).where(HostDiscoveryScan.id == scan_id)
    )
    return result.scalar_one_or_none()


async def get_host_discovery_scans_by_network(
    db: AsyncSession,
    network_id: int,
    offset: int = 0,
    limit: int = 50,
) -> list[HostDiscoveryScan]:
    """
    Get host discovery scan history for a specific network.

    Returns scans ordered by most recent first.
    """
    result = await db.execute(
        select(HostDiscoveryScan)
        .options(selectinload(HostDiscoveryScan.scanner))
        .where(HostDiscoveryScan.network_id == network_id)
        .order_by(HostDiscoveryScan.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_pending_host_discovery_jobs(
    db: AsyncSession,
    scanner_id: int,
) -> list[HostDiscoveryScan]:
    """
    Get pending host discovery scans for a scanner.

    Returns scans with status 'planned' for the given scanner.
    """
    result = await db.execute(
        select(HostDiscoveryScan)
        .options(selectinload(HostDiscoveryScan.network))
        .where(
            HostDiscoveryScan.scanner_id == scanner_id,
            HostDiscoveryScan.status == HostDiscoveryScanStatus.PLANNED,
        )
        .order_by(HostDiscoveryScan.id.asc())
    )
    return list(result.scalars().all())


async def claim_host_discovery_job(
    db: AsyncSession,
    scan_id: int,
    scanner_id: int,
) -> HostDiscoveryScan | None:
    """
    Claim a host discovery scan job for a scanner.

    Sets the scan status to 'running' and records the start time.
    Returns None if the scan doesn't exist or isn't in 'planned' status.
    """
    result = await db.execute(
        select(HostDiscoveryScan)
        .options(selectinload(HostDiscoveryScan.network))
        .where(
            HostDiscoveryScan.id == scan_id,
            HostDiscoveryScan.scanner_id == scanner_id,
            HostDiscoveryScan.status == HostDiscoveryScanStatus.PLANNED,
        )
    )
    scan = result.scalar_one_or_none()
    if scan is None:
        return None

    scan.status = HostDiscoveryScanStatus.RUNNING
    scan.started_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(scan)
    return scan


async def complete_host_discovery_scan(
    db: AsyncSession,
    scan_id: int,
    hosts_discovered: int,
) -> HostDiscoveryScan | None:
    """Mark a host discovery scan as completed."""
    scan = await get_host_discovery_scan_by_id(db, scan_id)
    if scan is None:
        return None

    scan.status = HostDiscoveryScanStatus.COMPLETED
    scan.completed_at = datetime.now(timezone.utc)
    scan.hosts_discovered = hosts_discovered
    await db.flush()
    await db.refresh(scan)
    return scan


async def fail_host_discovery_scan(
    db: AsyncSession,
    scan_id: int,
    error_message: str,
) -> HostDiscoveryScan | None:
    """Mark a host discovery scan as failed."""
    scan = await get_host_discovery_scan_by_id(db, scan_id)
    if scan is None:
        return None

    scan.status = HostDiscoveryScanStatus.FAILED
    scan.completed_at = datetime.now(timezone.utc)
    scan.error_message = error_message
    await db.flush()
    await db.refresh(scan)
    return scan


async def get_known_hostnames(
    db: AsyncSession,
    network_id: int,
) -> dict[str, str]:
    """Get a map of IP -> hostname for hosts with known hostnames in a network.

    Args:
        db: Database session.
        network_id: Network ID to filter hosts by.

    Returns:
        Dict mapping IP addresses to their known hostnames.
    """
    from sqlalchemy import func

    result = await db.execute(
        select(Host.ip, Host.hostname).where(
            Host.hostname.isnot(None),
            func.json_contains(Host.seen_by_networks, str(network_id)),
        )
    )
    return {row.ip: row.hostname for row in result.all()}


async def get_ips_with_open_ports(
    db: AsyncSession,
    network_id: int,
) -> list[str]:
    """Get distinct IPs that have open ports and belong to a network.

    Joins GlobalOpenPort with Host (via host_id) and filters by network membership.

    Args:
        db: Database session.
        network_id: Network ID to filter hosts by.

    Returns:
        List of IP addresses that have at least one open port.
    """
    from sqlalchemy import distinct, func

    result = await db.execute(
        select(distinct(GlobalOpenPort.ip))
        .join(Host, GlobalOpenPort.host_id == Host.id)
        .where(func.json_contains(Host.seen_by_networks, str(network_id)))
    )
    return [row[0] for row in result.all()]
