"""Scanner result submission service."""

from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.excluded_port import ExcludedPort
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerResultRequest, ScannerResultResponse
from app.services.alerts import generate_alerts_for_scan


async def get_excluded_ports_for_scan(
    db: AsyncSession, scan: Scan
) -> tuple[set[tuple[str, int]], set[int]]:
    """
    Get excluded ports for the scan's network.

    Returns:
    - ip-specific exclusions as (ip, port) tuples
    - network-wide exclusions as a set of ports
    """
    result = await db.execute(
        select(ExcludedPort).where(ExcludedPort.network_id == scan.network_id)
    )
    excluded = result.scalars().all()

    ip_specific = {(ep.ip, ep.port) for ep in excluded if ep.ip is not None}
    network_wide = {ep.port for ep in excluded if ep.ip is None}

    return ip_specific, network_wide


async def find_existing_port(
    db: AsyncSession, network_id: int, ip: str, port: int
) -> OpenPort | None:
    """
    Find an existing open port record in previous scans of this network.

    Used to preserve first_seen_at timestamp for ports that were already discovered.
    """
    # Find any previous scan of this network that has this ip:port
    result = await db.execute(
        select(OpenPort)
        .join(Scan, OpenPort.scan_id == Scan.id)
        .where(
            and_(
                Scan.network_id == network_id,
                OpenPort.ip == ip,
                OpenPort.port == port,
            )
        )
        .order_by(OpenPort.first_seen_at.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def submit_scan_results(
    db: AsyncSession,
    scanner: Scanner,
    request: ScannerResultRequest,
) -> ScannerResultResponse | None:
    """
    Submit scan results from a scanner.

    Returns None if:
    - Scan doesn't exist
    - Scan is not in RUNNING or CANCELLED status
    - Scan's network is not assigned to this site

    Otherwise processes the results and returns a response.
    """
    # Find the scan and verify ownership
    scan_result = await db.execute(
        select(Scan).where(Scan.id == request.scan_id)
    )
    scan = scan_result.scalar_one_or_none()

    if scan is None:
        return None

    # Verify scan belongs to this site
    if scan.scanner_id != scanner.id:
        return None

    # Verify scan is in RUNNING or CANCELLED status
    if scan.status not in {ScanStatus.RUNNING, ScanStatus.CANCELLED}:
        return None

    # Get excluded ports for this network
    excluded_ports, excluded_network_ports = await get_excluded_ports_for_scan(
        db, scan
    )

    is_cancelled = scan.status == ScanStatus.CANCELLED

    # Determine the final scan status
    if not is_cancelled:
        if request.status == "success":
            scan.status = ScanStatus.COMPLETED
        else:
            scan.status = ScanStatus.FAILED
        scan.completed_at = datetime.now(timezone.utc)
    else:
        if scan.completed_at is None:
            scan.completed_at = datetime.now(timezone.utc)

    if request.error_message:
        scan.error_message = request.error_message

    # Process open ports
    ports_recorded = 0
    ports_excluded = 0
    now = datetime.now(timezone.utc)
    recorded_ports: list[tuple[str, int]] = []

    for port_data in request.open_ports:
        # Check if this port should be excluded
        if (
            port_data.port in excluded_network_ports
            or (port_data.ip, port_data.port) in excluded_ports
        ):
            ports_excluded += 1
            continue

        # Find first_seen_at from previous scans
        existing_port = await find_existing_port(
            db, scan.network_id, port_data.ip, port_data.port
        )

        first_seen = existing_port.first_seen_at if existing_port else now

        # Create new open port record for this scan
        new_port = OpenPort(
            scan_id=scan.id,
            ip=port_data.ip,
            port=port_data.port,
            protocol=port_data.protocol,
            ttl=port_data.ttl,
            banner=port_data.banner,
            mac_address=port_data.mac_address,
            mac_vendor=port_data.mac_vendor,
            first_seen_at=first_seen,
            last_seen_at=now,
        )
        db.add(new_port)
        recorded_ports.append((port_data.ip, port_data.port))
        ports_recorded += 1

    if scan.status == ScanStatus.COMPLETED:
        await generate_alerts_for_scan(db, scan, recorded_ports)

    return ScannerResultResponse(
        scan_id=scan.id,
        status=scan.status.value,
        ports_recorded=ports_recorded,
        ports_excluded=ports_excluded,
    )
