"""Scanner result submission service."""

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.models.ssh_scan_result import SSHScanResult
from app.schemas.scanner import ScannerResultRequest, ScannerResultResponse
from app.services.alerts import (
    generate_global_alerts_for_scan,
    generate_ssh_alerts_for_scan,
    generate_ssh_regression_alerts_for_scan,
)


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
    scan_result = await db.execute(select(Scan).where(Scan.id == request.scan_id))
    scan = scan_result.scalar_one_or_none()

    if scan is None:
        return None

    # Verify scan belongs to this site
    if scan.scanner_id != scanner.id:
        return None

    # Verify scan is in RUNNING or CANCELLED status
    if scan.status not in {ScanStatus.RUNNING, ScanStatus.CANCELLED}:
        return None

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
    now = datetime.now(timezone.utc)
    # Format: (ip, port, protocol, banner, service_guess, mac_address, mac_vendor)
    recorded_ports_data: list[
        tuple[str, int, str, str | None, str | None, str | None, str | None]
    ] = []

    for port_data in request.open_ports:
        # Find first_seen_at from previous scans
        existing_port = await find_existing_port(db, scan.network_id, port_data.ip, port_data.port)

        first_seen = existing_port.first_seen_at if existing_port else now

        # Create new open port record for this scan
        new_port = OpenPort(
            scan_id=scan.id,
            ip=port_data.ip,
            port=port_data.port,
            protocol=port_data.protocol,
            ttl=port_data.ttl,
            banner=port_data.banner,
            service_guess=port_data.service_guess,
            mac_address=port_data.mac_address,
            mac_vendor=port_data.mac_vendor,
            first_seen_at=first_seen,
            last_seen_at=now,
        )
        db.add(new_port)
        recorded_ports_data.append(
            (
                port_data.ip,
                port_data.port,
                port_data.protocol,
                port_data.banner,
                port_data.service_guess,
                port_data.mac_address,
                port_data.mac_vendor,
            )
        )
        ports_recorded += 1

    # Process SSH probe results
    ssh_results_recorded = 0
    for ssh_data in request.ssh_results:
        # Only store successful SSH probe results
        if not ssh_data.success:
            continue

        # Convert algorithm info to JSON-serializable format
        ciphers_json: list[dict[str, Any]] = [
            {
                "name": c.name,
                "keysize": c.keysize,
                "is_weak": c.is_weak,
                "notes": c.notes,
            }
            for c in ssh_data.ciphers
        ]
        kex_json: list[dict[str, Any]] = [
            {
                "name": k.name,
                "keysize": k.keysize,
                "is_weak": k.is_weak,
                "notes": k.notes,
            }
            for k in ssh_data.kex_algorithms
        ]
        mac_json: list[dict[str, Any]] = [
            {
                "name": m.name,
                "keysize": m.keysize,
                "is_weak": m.is_weak,
                "notes": m.notes,
            }
            for m in ssh_data.mac_algorithms
        ]

        ssh_result = SSHScanResult(
            scan_id=scan.id,
            host_ip=ssh_data.host,
            port=ssh_data.port,
            timestamp=now,
            publickey_enabled=ssh_data.publickey_enabled,
            password_enabled=ssh_data.password_enabled,
            keyboard_interactive_enabled=ssh_data.keyboard_interactive_enabled,
            ssh_version=ssh_data.ssh_version,
            protocol_version=ssh_data.protocol_version,
            server_banner=ssh_data.server_banner,
            supported_ciphers=ciphers_json,
            kex_algorithms=kex_json,
            host_key_types=list(ssh_data.host_key_types),
            mac_algorithms=mac_json,
        )
        db.add(ssh_result)
        ssh_results_recorded += 1

    if scan.status == ScanStatus.COMPLETED:
        await generate_global_alerts_for_scan(db, scan, recorded_ports_data)
        # Generate SSH security alerts if SSH results were recorded
        if ssh_results_recorded > 0:
            await generate_ssh_alerts_for_scan(db, scan)
            # Generate regression alerts by comparing to previous scan
            await generate_ssh_regression_alerts_for_scan(db, scan)

    return ScannerResultResponse(
        scan_id=scan.id,
        status=scan.status.value,
        ports_recorded=ports_recorded,
    )
