"""Scan management service for triggering and querying scans."""

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scan_log import LogLevel, ScanLog


async def create_manual_scan(db: AsyncSession, network: Network) -> Scan:
    """
    Create a new manual scan for a network.

    Creates a scan record with status 'planned' and trigger_type 'manual'.
    """
    scan = Scan(
        network_id=network.id,
        scanner_id=network.scanner_id,
        status=ScanStatus.PLANNED,
        trigger_type=TriggerType.MANUAL,
    )
    db.add(scan)
    await db.flush()
    return scan


async def create_single_host_scan(
    db: AsyncSession, network: Network, target_ip: str
) -> Scan:
    """
    Create a new manual scan for a single host/IP within a network.

    Creates a scan record with status 'planned', trigger_type 'manual',
    and target_ip set to the specific IP address to scan.
    """
    scan = Scan(
        network_id=network.id,
        scanner_id=network.scanner_id,
        status=ScanStatus.PLANNED,
        trigger_type=TriggerType.MANUAL,
        target_ip=target_ip,
    )
    db.add(scan)
    await db.flush()
    return scan


async def cancel_scan(
    db: AsyncSession,
    scan: Scan,
    cancelled_by: int,
) -> Scan:
    """Cancel a running scan and set cancellation metadata."""
    scan.status = ScanStatus.CANCELLED
    scan.cancelled_at = datetime.now(timezone.utc)
    scan.cancelled_by = cancelled_by
    db.add(
        ScanLog(
            scan_id=scan.id,
            level=LogLevel.WARNING,
            message="Scan cancelled by user request",
        )
    )
    await db.flush()
    return scan


async def get_scans_by_network_id(
    db: AsyncSession,
    network_id: int,
    offset: int = 0,
    limit: int = 50,
) -> list[tuple[Scan, int]]:
    """
    Get scan history for a specific network with port counts.

    Returns scans ordered by most recent first.
    """
    result = await db.execute(
        select(Scan, func.count(OpenPort.id).label("port_count"))
        .outerjoin(OpenPort, OpenPort.scan_id == Scan.id)
        .options(selectinload(Scan.cancelled_by_user))
        .where(Scan.network_id == network_id)
        .group_by(Scan.id)
        .order_by(Scan.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return [(row[0], int(row[1])) for row in result.all()]


async def get_scan_with_ports(db: AsyncSession, scan_id: int) -> Scan | None:
    """Get a scan by ID with open ports and SSH results loaded."""
    result = await db.execute(
        select(Scan)
        .options(
            selectinload(Scan.open_ports),
            selectinload(Scan.ssh_scan_results),
            selectinload(Scan.cancelled_by_user),
        )
        .where(Scan.id == scan_id)
    )
    return result.scalar_one_or_none()


async def get_scan_by_id(db: AsyncSession, scan_id: int) -> Scan | None:
    """Get a scan by ID without loading relationships."""
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    return result.scalar_one_or_none()


async def get_scan_logs(
    db: AsyncSession,
    scan_id: int,
    offset: int = 0,
    limit: int = 50,
) -> list[ScanLog]:
    """Get paginated scan logs ordered by timestamp."""
    result = await db.execute(
        select(ScanLog)
        .where(ScanLog.scan_id == scan_id)
        .order_by(ScanLog.timestamp.asc(), ScanLog.id.asc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_all_scans(
    db: AsyncSession,
    network_id: int | None = None,
    offset: int = 0,
    limit: int = 50,
    include_hidden: bool = False,
) -> list[tuple[Scan, int]]:
    """
    Get all scans with port counts, optionally filtered by network_id.

    Returns scans ordered by most recent first with related network and site loaded.
    """
    query = (
        select(Scan, func.count(OpenPort.id).label("port_count"))
        .outerjoin(OpenPort, OpenPort.scan_id == Scan.id)
        .options(
            selectinload(Scan.network),
            selectinload(Scan.scanner),
            selectinload(Scan.cancelled_by_user),
        )
    )

    if network_id is not None:
        query = query.where(Scan.network_id == network_id)
    if not include_hidden:
        query = query.where(Scan.hidden.is_(False))

    query = query.group_by(Scan.id).order_by(Scan.id.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    return [(row[0], int(row[1])) for row in result.all()]


async def set_scan_hidden(db: AsyncSession, scan: Scan, hidden: bool) -> Scan:
    """Show or hide a scan without deleting its data."""
    scan.hidden = hidden
    db.add(scan)
    await db.flush()
    return scan


async def delete_scan(db: AsyncSession, scan: Scan) -> None:
    """Permanently delete a scan and its related data."""
    await db.delete(scan)
    await db.flush()


async def get_latest_scans_by_network(
    db: AsyncSession,
) -> dict[int, tuple[Scan, int] | None]:
    """
    Get the latest completed scan for each network.

    Returns a dict mapping network_id to (Scan, port_count) or None if no scans exist.
    """
    # Subquery to get the latest scan ID for each network
    latest_scan_subq = (
        select(
            Scan.network_id,
            func.max(Scan.id).label("latest_scan_id"),
        )
        .where(Scan.status == ScanStatus.COMPLETED)
        .group_by(Scan.network_id)
        .subquery()
    )

    # Main query to get the scans with port counts
    query = (
        select(Scan, func.count(OpenPort.id).label("port_count"))
        .join(
            latest_scan_subq,
            Scan.id == latest_scan_subq.c.latest_scan_id,
        )
        .outerjoin(OpenPort, OpenPort.scan_id == Scan.id)
        .group_by(Scan.id)
    )

    result = await db.execute(query)
    return {row[0].network_id: (row[0], int(row[1])) for row in result.all()}
