"""Scanner job retrieval and claiming service."""

from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerJobClaimResponse, ScannerJobResponse


async def get_pending_jobs_for_scanner(
    db: AsyncSession, scanner: Scanner
) -> list[ScannerJobResponse]:
    """
    Get networks assigned to this scanner that need scanning.

    A network needs scanning if:
    1. It has a scan with status 'planned' (manual or scheduled trigger)
    2. OR no running/planned scans exist and schedule indicates it's due
       (Schedule evaluation will be handled by the scheduler service in US-022)

    For now, we just return networks that have planned scans waiting.
    Returns one job per planned scan (to support single-host scans).
    """
    from sqlalchemy.orm import selectinload
    
    # Get planned scans for networks on this scanner
    result = await db.execute(
        select(Scan)
        .options(selectinload(Scan.network))
        .join(Network, Network.id == Scan.network_id)
        .where(Network.scanner_id == scanner.id)
        .where(Scan.status == ScanStatus.PLANNED)
        .order_by(Scan.id.asc())
    )
    planned_scans = list(result.scalars().all())

    jobs = [
        ScannerJobResponse(
            network_id=scan.network.id,
            cidr=scan.network.cidr,
            port_spec=scan.network.port_spec,
            rate=scan.network.scan_rate,
            scanner_type=scan.network.scanner_type or "masscan",
            scan_timeout=scan.network.scan_timeout if scan.network.scan_timeout is not None else 3600,
            port_timeout=scan.network.port_timeout if scan.network.port_timeout is not None else 1500,
            scan_protocol=scan.network.scan_protocol or "tcp",
            is_ipv6=scan.network.is_ipv6,
            target_ip=scan.target_ip,  # None for full network scan
        )
        for scan in planned_scans
    ]

    return jobs


async def claim_job(
    db: AsyncSession, scanner: Scanner, network_id: int
) -> ScannerJobClaimResponse | None:
    """
    Claim a scan job for a network.

    Returns the claim response with scan_id if successful, or None if:
    - Network doesn't exist or is not assigned to this scanner
    - No planned scan exists for this network
    - A scan is already running for this network

    Returns the existing running scan's conflict info if already running.
    """
    # Check if network exists and belongs to this scanner
    network_result = await db.execute(
        select(Network).where(and_(Network.id == network_id, Network.scanner_id == scanner.id))
    )
    network = network_result.scalar_one_or_none()

    if network is None:
        return None

    # Check if there's already a running scan for this network
    running_scan_result = await db.execute(
        select(Scan).where(
            and_(
                Scan.network_id == network_id,
                Scan.status == ScanStatus.RUNNING,
            )
        )
    )
    running_scan = running_scan_result.scalar_one_or_none()

    if running_scan is not None:
        # Already running - this will be converted to 409 Conflict in the router
        return None

    # Find a planned scan to claim
    planned_scan_result = await db.execute(
        select(Scan)
        .where(
            and_(
                Scan.network_id == network_id,
                Scan.status == ScanStatus.PLANNED,
            )
        )
        .order_by(Scan.id.asc())
        .limit(1)
    )
    planned_scan = planned_scan_result.scalar_one_or_none()

    if planned_scan is None:
        return None

    # Claim the scan - update status to running
    planned_scan.status = ScanStatus.RUNNING
    planned_scan.started_at = datetime.now(timezone.utc)

    return ScannerJobClaimResponse(
        scan_id=planned_scan.id,
        network_id=network_id,
    )


async def is_job_running(db: AsyncSession, network_id: int) -> bool:
    """Check if there's already a running scan for this network."""
    result = await db.execute(
        select(Scan).where(
            and_(
                Scan.network_id == network_id,
                Scan.status == ScanStatus.RUNNING,
            )
        )
    )
    return result.scalar_one_or_none() is not None
