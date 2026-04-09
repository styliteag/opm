"""Scanner management service for CRUD operations."""

import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.repositories.base import BaseRepository


class ScannerRepository(BaseRepository[Scanner]):
    model = Scanner


def generate_api_key() -> str:
    """Generate a secure 32+ character API key."""
    return secrets.token_hex(32)


async def get_all_scanners(db: AsyncSession) -> list[Scanner]:
    """Get all scanners."""
    return await ScannerRepository(db).get_all(order_by=Scanner.created_at)


async def get_scanner_by_id(db: AsyncSession, scanner_id: int) -> Scanner | None:
    """Get a scanner by its ID."""
    return await ScannerRepository(db).get_by_id(scanner_id)


async def get_scanner_by_name(db: AsyncSession, name: str) -> Scanner | None:
    """Get a scanner by its name."""
    return await ScannerRepository(db).get_by_field(Scanner.name, name)


async def create_scanner(
    db: AsyncSession,
    name: str,
    description: str | None = None,
    location: str | None = None,
) -> tuple[Scanner, str]:
    """Create a new scanner and return it with the plain API key."""
    api_key = generate_api_key()
    api_key_hash = hash_password(api_key)
    scanner = await ScannerRepository(db).create(
        name=name,
        api_key_hash=api_key_hash,
        description=description,
        location=location,
    )
    return scanner, api_key


async def update_scanner(
    db: AsyncSession,
    scanner: Scanner,
    name: str | None = None,
    description: str | None = None,
    location: str | None = None,
) -> Scanner:
    """Update an existing scanner."""
    repo = ScannerRepository(db)
    if name is not None:
        scanner.name = name
    if description is not None:
        scanner.description = description
    if location is not None:
        scanner.location = location
    return await repo.flush_and_refresh(scanner)


async def regenerate_api_key(db: AsyncSession, scanner: Scanner) -> tuple[Scanner, str]:
    """Regenerate the API key for a scanner."""
    api_key = generate_api_key()
    scanner.api_key_hash = hash_password(api_key)
    scanner = await ScannerRepository(db).flush_and_refresh(scanner)
    return scanner, api_key


async def get_scanner_overview(db: AsyncSession, scanner_id: int) -> dict[str, Any] | None:
    """Get aggregated overview stats for a scanner."""
    scanner = await get_scanner_by_id(db, scanner_id)
    if scanner is None:
        return None

    # Assigned networks
    networks_result = await db.execute(
        select(Network).where(Network.scanner_id == scanner_id).order_by(Network.name)
    )
    networks = [
        {
            "id": n.id,
            "name": n.name,
            "cidr": n.cidr,
            "scan_schedule": n.scan_schedule,
        }
        for n in networks_result.scalars().all()
    ]

    # Recent scans (join with Network for name, count ports)
    recent_result = await db.execute(
        select(Scan, Network.name, func.count(OpenPort.id).label("port_count"))
        .join(Network, Scan.network_id == Network.id)
        .outerjoin(OpenPort, OpenPort.scan_id == Scan.id)
        .where(Scan.scanner_id == scanner_id)
        .group_by(Scan.id, Network.name)
        .order_by(Scan.id.desc())
        .limit(20)
    )
    recent_scans = []
    for scan, network_name, port_count in recent_result.all():
        duration = None
        if scan.started_at and scan.completed_at:
            duration = (scan.completed_at - scan.started_at).total_seconds()
        recent_scans.append(
            {
                "id": scan.id,
                "network_id": scan.network_id,
                "network_name": network_name,
                "status": scan.status.value,
                "started_at": scan.started_at,
                "completed_at": scan.completed_at,
                "trigger_type": scan.trigger_type.value,
                "port_count": int(port_count),
                "duration_seconds": duration,
            }
        )

    # Scan statistics
    scan_stats_result = await db.execute(
        select(Scan.status, func.count(Scan.id))
        .where(Scan.scanner_id == scanner_id)
        .group_by(Scan.status)
    )
    total_scans = 0
    completed_scans = 0
    failed_scans = 0
    for scan_status, count in scan_stats_result.all():
        total_scans += count
        if scan_status == ScanStatus.COMPLETED:
            completed_scans = count
        elif scan_status == ScanStatus.FAILED:
            failed_scans = count

    # Average duration of completed scans
    avg_result = await db.execute(
        select(Scan.started_at, Scan.completed_at).where(
            and_(
                Scan.scanner_id == scanner_id,
                Scan.status == ScanStatus.COMPLETED,
                Scan.started_at.isnot(None),
                Scan.completed_at.isnot(None),
            )
        )
    )
    durations = []
    for started, completed in avg_result.all():
        if started and completed:
            durations.append((completed - started).total_seconds())
    avg_duration = sum(durations) / len(durations) if durations else None

    # Scans in last 24h and 7d
    now = datetime.now(timezone.utc)
    scans_24h_result = await db.execute(
        select(func.count(Scan.id)).where(
            and_(
                Scan.scanner_id == scanner_id,
                Scan.started_at >= now - timedelta(hours=24),
            )
        )
    )
    scans_last_24h = scans_24h_result.scalar() or 0

    scans_7d_result = await db.execute(
        select(func.count(Scan.id)).where(
            and_(
                Scan.scanner_id == scanner_id,
                Scan.started_at >= now - timedelta(days=7),
            )
        )
    )
    scans_last_7d = scans_7d_result.scalar() or 0

    return {
        "scanner": scanner,
        "networks": networks,
        "recent_scans": recent_scans,
        "total_scans": total_scans,
        "completed_scans": completed_scans,
        "failed_scans": failed_scans,
        "avg_scan_duration_seconds": round(avg_duration, 1) if avg_duration else None,
        "scans_last_24h": scans_last_24h,
        "scans_last_7d": scans_last_7d,
    }


async def delete_scanner(db: AsyncSession, scanner: Scanner) -> None:
    """Delete a scanner (cascades to networks)."""
    await ScannerRepository(db).delete(scanner)


async def verify_scanner_api_key(scanner: Scanner, api_key: str) -> bool:
    """Verify an API key against a scanner's stored hash."""
    return verify_password(api_key, scanner.api_key_hash)
