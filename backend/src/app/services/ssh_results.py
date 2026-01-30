"""SSH scan results service for querying SSH security data."""

from typing import Any

from sqlalchemy import and_, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.network import Network
from app.models.scan import Scan, ScanStatus
from app.models.ssh_scan_result import SSHScanResult


async def get_ssh_results_for_scan(
    db: AsyncSession,
    scan_id: int,
) -> list[SSHScanResult]:
    """Get all SSH scan results for a specific scan."""
    result = await db.execute(
        select(SSHScanResult)
        .where(SSHScanResult.scan_id == scan_id)
        .order_by(SSHScanResult.host_ip, SSHScanResult.port)
    )
    return list(result.scalars().all())


async def get_ssh_hosts(
    db: AsyncSession,
    *,
    network_id: int | None = None,
    password_enabled: bool | None = None,
    keyboard_interactive_enabled: bool | None = None,
    ssh_version: str | None = None,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    """
    Get a list of all hosts with SSH data, showing the latest scan result for each host/port.

    Returns a tuple of (hosts, total_count).
    """
    # Subquery to find the latest SSH result for each host/port combination
    latest_subq = (
        select(
            SSHScanResult.host_ip,
            SSHScanResult.port,
            func.max(SSHScanResult.id).label("max_id"),
        )
        .join(Scan, Scan.id == SSHScanResult.scan_id)
        .where(Scan.status == ScanStatus.COMPLETED)
        .group_by(SSHScanResult.host_ip, SSHScanResult.port)
        .subquery()
    )

    # Main query joining to get the actual SSH results
    query = (
        select(SSHScanResult, Scan.network_id, Network.name.label("network_name"))
        .join(
            latest_subq,
            and_(
                SSHScanResult.host_ip == latest_subq.c.host_ip,
                SSHScanResult.port == latest_subq.c.port,
                SSHScanResult.id == latest_subq.c.max_id,
            ),
        )
        .join(Scan, Scan.id == SSHScanResult.scan_id)
        .outerjoin(Network, Network.id == Scan.network_id)
    )

    # Apply filters
    filters = []
    if network_id is not None:
        filters.append(Scan.network_id == network_id)
    if password_enabled is not None:
        filters.append(SSHScanResult.password_enabled == password_enabled)
    if keyboard_interactive_enabled is not None:
        filters.append(
            SSHScanResult.keyboard_interactive_enabled == keyboard_interactive_enabled
        )
    if ssh_version is not None:
        filters.append(SSHScanResult.ssh_version.ilike(f"%{ssh_version}%"))

    if filters:
        query = query.where(and_(*filters))

    # Get total count before pagination
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering
    query = query.order_by(SSHScanResult.host_ip, SSHScanResult.port)
    query = query.offset(offset).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    # Transform results to dict with computed weak cipher/kex flags
    hosts = []
    for row in rows:
        ssh_result = row[0]
        network_id_val = row[1]
        network_name = row[2]

        # Check for weak ciphers
        has_weak_ciphers = False
        if ssh_result.supported_ciphers:
            has_weak_ciphers = any(
                cipher.get("is_weak", False) for cipher in ssh_result.supported_ciphers
            )

        # Check for weak KEX
        has_weak_kex = False
        if ssh_result.kex_algorithms:
            has_weak_kex = any(
                kex.get("is_weak", False) for kex in ssh_result.kex_algorithms
            )

        hosts.append({
            "host_ip": ssh_result.host_ip,
            "port": ssh_result.port,
            "ssh_version": ssh_result.ssh_version,
            "publickey_enabled": ssh_result.publickey_enabled,
            "password_enabled": ssh_result.password_enabled,
            "keyboard_interactive_enabled": ssh_result.keyboard_interactive_enabled,
            "has_weak_ciphers": has_weak_ciphers,
            "has_weak_kex": has_weak_kex,
            "last_scan_id": ssh_result.scan_id,
            "last_scanned": ssh_result.timestamp,
            "network_id": network_id_val,
            "network_name": network_name,
        })

    return hosts, total


async def get_ssh_host_history(
    db: AsyncSession,
    host_ip: str,
    port: int = 22,
    offset: int = 0,
    limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    """
    Get SSH scan history for a specific host/port.

    Returns a tuple of (history_entries, total_count).
    """
    # Base query for SSH results for this host/port from completed scans
    base_query = (
        select(SSHScanResult, Scan.network_id, Network.name.label("network_name"))
        .join(Scan, Scan.id == SSHScanResult.scan_id)
        .outerjoin(Network, Network.id == Scan.network_id)
        .where(
            and_(
                SSHScanResult.host_ip == host_ip,
                SSHScanResult.port == port,
                Scan.status == ScanStatus.COMPLETED,
            )
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(base_query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Apply pagination and ordering (most recent first)
    query = base_query.order_by(SSHScanResult.timestamp.desc()).offset(offset).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    history = []
    for row in rows:
        ssh_result = row[0]
        network_id_val = row[1]
        network_name = row[2]

        history.append({
            "scan_id": ssh_result.scan_id,
            "timestamp": ssh_result.timestamp,
            "ssh_version": ssh_result.ssh_version,
            "publickey_enabled": ssh_result.publickey_enabled,
            "password_enabled": ssh_result.password_enabled,
            "keyboard_interactive_enabled": ssh_result.keyboard_interactive_enabled,
            "supported_ciphers": ssh_result.supported_ciphers,
            "kex_algorithms": ssh_result.kex_algorithms,
            "host_key_types": ssh_result.host_key_types,
            "mac_algorithms": ssh_result.mac_algorithms,
            "network_id": network_id_val,
            "network_name": network_name,
        })

    return history, total


async def get_scan_with_ssh_results(
    db: AsyncSession,
    scan_id: int,
) -> Scan | None:
    """Get a scan by ID with SSH results loaded."""
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
