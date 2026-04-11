"""Scanner job retrieval and claiming service."""

from datetime import datetime, timezone

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerJobClaimResponse, ScannerJobResponse
from app.services import gvm_library as gvm_library_service
from app.services import nse_scripts as nse_scripts_service


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
        .options(selectinload(Scan.network), selectinload(Scan.nse_template))
        .join(Network, Network.id == Scan.network_id)
        .where(Network.scanner_id == scanner.id)
        .where(Scan.status == ScanStatus.PLANNED)
        .order_by(Scan.id.asc())
    )
    planned_scans = list(result.scalars().all())

    jobs: list[ScannerJobResponse] = []
    for scan in planned_scans:
        overrides = scan.scan_overrides or {}

        # Determine scanner type — NSE scans have nse_template_id set
        is_nse = scan.nse_template_id is not None
        scanner_type = (
            "nse"
            if is_nse
            else overrides.get("scanner_type", scan.network.scanner_type or "masscan")
        )

        # Build NSE-specific fields from template
        nse_scripts = None
        nse_script_args = None
        custom_script_hashes = None
        if is_nse and scan.nse_template is not None:
            nse_scripts = scan.nse_template.nse_scripts
            nse_script_args = scan.nse_template.script_args
            # Look up content hashes for any custom scripts in the profile
            if nse_scripts:
                custom_script_hashes = (
                    await nse_scripts_service.get_custom_script_hashes(db, nse_scripts)
                ) or None

        net = scan.network
        jobs.append(
            ScannerJobResponse(
                network_id=net.id,
                cidr=net.cidr,
                port_spec=overrides.get("port_spec", net.port_spec),
                rate=overrides.get("scan_rate", net.scan_rate),
                scanner_type=scanner_type,
                scan_timeout=overrides.get(
                    "scan_timeout",
                    net.scan_timeout if net.scan_timeout is not None else 3600,
                ),
                port_timeout=overrides.get(
                    "port_timeout",
                    net.port_timeout if net.port_timeout is not None else 1500,
                ),
                scan_protocol=overrides.get("scan_protocol", net.scan_protocol or "tcp"),
                is_ipv6=net.is_ipv6,
                target_ip=scan.target_ip,
                nse_scripts=nse_scripts,
                nse_script_args=nse_script_args,
                custom_script_hashes=custom_script_hashes,
                phases=net.phases,
                gvm_scan_config=net.gvm_scan_config,
                gvm_port_list=net.gvm_port_list,
                gvm_keep_reports=net.gvm_keep_reports,
                ssh_probe_enabled=net.ssh_probe_enabled,
                nuclei_enabled=net.nuclei_enabled,
                nuclei_tags=net.nuclei_tags,
                nuclei_severity=net.nuclei_severity,
                nuclei_timeout=net.nuclei_timeout,
            )
        )

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

    # Resolve library references — scanner will self-check + auto-push
    required_entries = await gvm_library_service.resolve_required_entries(db, network)

    return ScannerJobClaimResponse(
        scan_id=planned_scan.id,
        network_id=network_id,
        required_library_entries=required_entries,
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
