"""SSH scan results service for querying SSH security data."""

from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.network import Network
from app.models.scan import Scan, ScanStatus
from app.models.ssh_scan_result import SSHScanResult


def _compute_ssh_changes(
    current: dict[str, Any],
    previous: dict[str, Any] | None,
) -> tuple[str | None, list[dict[str, Any]]]:
    """
    Compare current SSH result with previous and compute changes.

    Returns a tuple of (change_status, list_of_changes).
    change_status: "improved", "degraded", "unchanged", or None (no prior scan)
    """
    if previous is None:
        return None, []

    changes: list[dict[str, Any]] = []

    # Check authentication method changes
    # Regression: insecure auth enabled that wasn't before
    # Improvement: insecure auth disabled that was enabled before
    if current["password_enabled"] and not previous["password_enabled"]:
        changes.append({
            "field": "password_enabled",
            "description": "Password authentication was enabled",
            "is_regression": True,
        })
    elif not current["password_enabled"] and previous["password_enabled"]:
        changes.append({
            "field": "password_enabled",
            "description": "Password authentication was disabled",
            "is_regression": False,
        })

    if current["keyboard_interactive_enabled"] and not previous["keyboard_interactive_enabled"]:
        changes.append({
            "field": "keyboard_interactive_enabled",
            "description": "Keyboard-interactive authentication was enabled",
            "is_regression": True,
        })
    elif not current["keyboard_interactive_enabled"] and previous["keyboard_interactive_enabled"]:
        changes.append({
            "field": "keyboard_interactive_enabled",
            "description": "Keyboard-interactive authentication was disabled",
            "is_regression": False,
        })

    if not current["publickey_enabled"] and previous["publickey_enabled"]:
        changes.append({
            "field": "publickey_enabled",
            "description": "Public key authentication was disabled",
            "is_regression": True,
        })
    elif current["publickey_enabled"] and not previous["publickey_enabled"]:
        changes.append({
            "field": "publickey_enabled",
            "description": "Public key authentication was enabled",
            "is_regression": False,
        })

    # Check weak cipher changes
    if current["has_weak_ciphers"] and not previous["has_weak_ciphers"]:
        changes.append({
            "field": "has_weak_ciphers",
            "description": "Weak ciphers detected",
            "is_regression": True,
        })
    elif not current["has_weak_ciphers"] and previous["has_weak_ciphers"]:
        changes.append({
            "field": "has_weak_ciphers",
            "description": "Weak ciphers removed",
            "is_regression": False,
        })

    # Check weak KEX changes
    if current["has_weak_kex"] and not previous["has_weak_kex"]:
        changes.append({
            "field": "has_weak_kex",
            "description": "Weak key exchange algorithms detected",
            "is_regression": True,
        })
    elif not current["has_weak_kex"] and previous["has_weak_kex"]:
        changes.append({
            "field": "has_weak_kex",
            "description": "Weak key exchange algorithms removed",
            "is_regression": False,
        })

    # Check SSH version changes
    if current["ssh_version"] != previous["ssh_version"]:
        # Version change - determine if it's an upgrade or downgrade
        curr_ver = current["ssh_version"] or ""
        prev_ver = previous["ssh_version"] or ""
        if curr_ver != prev_ver:
            prev_label = prev_ver or "unknown"
            curr_label = curr_ver or "unknown"
            changes.append({
                "field": "ssh_version",
                "description": f"SSH version changed from {prev_label} to {curr_label}",
                "is_regression": False,  # Version changes are informational
            })

    # Determine overall status
    if not changes:
        return "unchanged", []

    has_regressions = any(c["is_regression"] for c in changes)
    has_improvements = any(not c["is_regression"] for c in changes)

    if has_regressions and not has_improvements:
        return "degraded", changes
    elif has_improvements and not has_regressions:
        return "improved", changes
    else:
        # Mixed changes - report as degraded if there are any regressions
        return "degraded" if has_regressions else "improved", changes


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
    Includes change tracking compared to the previous scan.
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

    # Collect host/port pairs to fetch previous results
    host_port_pairs = [(row[0].host_ip, row[0].port, row[0].id) for row in rows]

    # Fetch previous scan results for each host/port (the second-most-recent)
    previous_results: dict[tuple[str, int], dict[str, Any]] = {}
    if host_port_pairs:
        for host_ip, port, current_id in host_port_pairs:
            # Find the second-most-recent result for this host/port
            prev_query = (
                select(SSHScanResult)
                .join(Scan, Scan.id == SSHScanResult.scan_id)
                .where(
                    and_(
                        SSHScanResult.host_ip == host_ip,
                        SSHScanResult.port == port,
                        SSHScanResult.id < current_id,
                        Scan.status == ScanStatus.COMPLETED,
                    )
                )
                .order_by(SSHScanResult.id.desc())
                .limit(1)
            )
            prev_result = await db.execute(prev_query)
            prev_row = prev_result.scalar_one_or_none()
            if prev_row:
                # Check for weak ciphers/kex in previous result
                prev_has_weak_ciphers = False
                if prev_row.supported_ciphers:
                    prev_has_weak_ciphers = any(
                        cipher.get("is_weak", False) for cipher in prev_row.supported_ciphers
                    )
                prev_has_weak_kex = False
                if prev_row.kex_algorithms:
                    prev_has_weak_kex = any(
                        kex.get("is_weak", False) for kex in prev_row.kex_algorithms
                    )
                previous_results[(host_ip, port)] = {
                    "ssh_version": prev_row.ssh_version,
                    "publickey_enabled": prev_row.publickey_enabled,
                    "password_enabled": prev_row.password_enabled,
                    "keyboard_interactive_enabled": prev_row.keyboard_interactive_enabled,
                    "has_weak_ciphers": prev_has_weak_ciphers,
                    "has_weak_kex": prev_has_weak_kex,
                }

    # Transform results to dict with computed weak cipher/kex flags and change tracking
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

        # Build current result dict for comparison
        current_data = {
            "ssh_version": ssh_result.ssh_version,
            "publickey_enabled": ssh_result.publickey_enabled,
            "password_enabled": ssh_result.password_enabled,
            "keyboard_interactive_enabled": ssh_result.keyboard_interactive_enabled,
            "has_weak_ciphers": has_weak_ciphers,
            "has_weak_kex": has_weak_kex,
        }

        # Get previous result and compute changes
        prev_data = previous_results.get((ssh_result.host_ip, ssh_result.port))
        change_status, changes = _compute_ssh_changes(current_data, prev_data)

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
            "change_status": change_status,
            "changes": changes,
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


async def get_ssh_hosts_for_report(
    db: AsyncSession,
    *,
    network_id: int | None = None,
) -> list[dict[str, Any]]:
    """
    Get all SSH hosts with detailed cipher data for report generation.

    Similar to get_ssh_hosts but includes full cipher/KEX lists for report.
    Returns all hosts without pagination.
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

    # Apply network filter if specified
    if network_id is not None:
        query = query.where(Scan.network_id == network_id)

    query = query.order_by(SSHScanResult.host_ip, SSHScanResult.port)

    result = await db.execute(query)
    rows = result.all()

    # Transform results with detailed cipher information
    hosts = []
    for row in rows:
        ssh_result = row[0]
        network_id_val = row[1]
        network_name = row[2]

        # Extract weak ciphers list
        weak_ciphers = []
        if ssh_result.supported_ciphers:
            weak_ciphers = [
                c.get("name", "unknown")
                for c in ssh_result.supported_ciphers
                if c.get("is_weak", False)
            ]

        # Extract weak KEX list
        weak_kex = []
        if ssh_result.kex_algorithms:
            weak_kex = [
                k.get("name", "unknown")
                for k in ssh_result.kex_algorithms
                if k.get("is_weak", False)
            ]

        # Extract weak MACs list
        weak_macs = []
        if ssh_result.mac_algorithms:
            weak_macs = [
                m.get("name", "unknown")
                for m in ssh_result.mac_algorithms
                if m.get("is_weak", False)
            ]

        hosts.append({
            "host_ip": ssh_result.host_ip,
            "port": ssh_result.port,
            "ssh_version": ssh_result.ssh_version,
            "publickey_enabled": ssh_result.publickey_enabled,
            "password_enabled": ssh_result.password_enabled,
            "keyboard_interactive_enabled": ssh_result.keyboard_interactive_enabled,
            "has_weak_ciphers": len(weak_ciphers) > 0,
            "has_weak_kex": len(weak_kex) > 0,
            "has_weak_macs": len(weak_macs) > 0,
            "weak_ciphers": weak_ciphers,
            "weak_kex": weak_kex,
            "weak_macs": weak_macs,
            "last_scanned": ssh_result.timestamp,
            "network_id": network_id_val,
            "network_name": network_name,
        })

    return hosts
