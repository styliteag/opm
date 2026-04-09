"""Service for managing global open ports."""

from datetime import datetime
from ipaddress import IPv4Address, IPv6Address
from typing import Any, cast

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.models.global_open_port import GlobalOpenPort
from app.models.scan import Scan, ScanStatus
from app.repositories.base import BaseRepository


class GlobalOpenPortRepository(BaseRepository[GlobalOpenPort]):
    model = GlobalOpenPort

IPRange = tuple[int, IPv4Address | IPv6Address, IPv4Address | IPv6Address]


async def get_global_open_port(
    db: AsyncSession,
    ip: str,
    port: int,
    protocol: str = "tcp",
) -> GlobalOpenPort | None:
    """Get a global open port by ip, port, and protocol."""
    result = await db.execute(
        select(GlobalOpenPort).where(
            GlobalOpenPort.ip == ip,
            GlobalOpenPort.port == port,
            GlobalOpenPort.protocol == protocol,
        )
    )
    return result.scalar_one_or_none()


async def upsert_global_open_port(
    db: AsyncSession,
    ip: str,
    port: int,
    protocol: str = "tcp",
    network_id: int | None = None,
    banner: str | None = None,
    service_guess: str | None = None,
    mac_address: str | None = None,
    mac_vendor: str | None = None,
    timestamp: datetime | None = None,
    host_id: int | None = None,
) -> tuple[GlobalOpenPort, bool]:
    """
    Create or update a global open port entry.

    Returns:
        Tuple of (GlobalOpenPort, is_new) where is_new is True if this was a new entry.
    """
    now = timestamp or datetime.utcnow()

    existing = await get_global_open_port(db, ip, port, protocol)

    if existing:
        # Update existing entry
        existing.last_seen_at = now

        # Add network to seen_by_networks if not already present
        if network_id is not None:
            networks = set(existing.seen_by_networks or [])
            networks.add(network_id)
            existing.seen_by_networks = sorted(networks)

        # Update optional fields if provided
        if banner is not None:
            existing.banner = banner
        if service_guess is not None:
            existing.service_guess = service_guess
        if mac_address is not None:
            existing.mac_address = mac_address
        if mac_vendor is not None:
            existing.mac_vendor = mac_vendor
        if host_id is not None:
            existing.host_id = host_id

        await db.flush()
        await db.refresh(existing)
        return existing, False

    # Create new entry
    initial_networks = [network_id] if network_id is not None else []
    new_port = GlobalOpenPort(
        ip=ip,
        port=port,
        protocol=protocol,
        banner=banner,
        service_guess=service_guess,
        mac_address=mac_address,
        mac_vendor=mac_vendor,
        first_seen_at=now,
        last_seen_at=now,
        seen_by_networks=initial_networks,
        host_id=host_id,
    )
    db.add(new_port)
    await db.flush()
    await db.refresh(new_port)
    return new_port, True


async def get_global_open_ports(
    db: AsyncSession,
    *,
    port_min: int | None = None,
    port_max: int | None = None,
    ip_range: IPRange | None = None,
    service: str | None = None,
    sort_by: str = "last_seen_at",
    sort_dir: str = "desc",
    offset: int = 0,
    limit: int = 50,
) -> list[GlobalOpenPort]:
    """
    Get global open ports with optional filtering and pagination.

    Returns a list of GlobalOpenPort objects.
    """
    query = select(GlobalOpenPort)

    filters = []

    if port_min is not None:
        filters.append(GlobalOpenPort.port >= port_min)
    if port_max is not None:
        filters.append(GlobalOpenPort.port <= port_max)

    if service:
        filters.append(GlobalOpenPort.service_guess.ilike(f"%{service}%"))

    if ip_range is not None:
        version, start_ip, end_ip = ip_range
        if version == 4:
            filters.append(func.inet_aton(GlobalOpenPort.ip).between(int(start_ip), int(end_ip)))
        else:
            filters.append(
                func.inet6_aton(GlobalOpenPort.ip).between(
                    func.inet6_aton(str(start_ip)),
                    func.inet6_aton(str(end_ip)),
                )
            )

    if filters:
        query = query.where(and_(*filters))

    sort_fields = {
        "ip": GlobalOpenPort.ip,
        "port": GlobalOpenPort.port,
        "first_seen_at": GlobalOpenPort.first_seen_at,
        "last_seen_at": GlobalOpenPort.last_seen_at,
    }
    sort_column = sort_fields.get(sort_by)
    if sort_column is None:
        raise ValueError("Invalid sort_by value")

    sort_direction = sort_dir.lower()
    sort_expression = cast(ColumnElement[Any], sort_column)
    if sort_direction == "desc":
        sort_expression = sort_expression.desc()
    elif sort_direction == "asc":
        sort_expression = sort_expression.asc()
    else:
        raise ValueError("Invalid sort_dir value")

    query = query.order_by(sort_expression, GlobalOpenPort.id.asc()).offset(offset).limit(limit)

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_global_open_port_by_id(db: AsyncSession, port_id: int) -> GlobalOpenPort | None:
    """Get a global open port by its ID."""
    return await GlobalOpenPortRepository(db).get_by_id(port_id)


async def update_port_comment(
    db: AsyncSession, port_id: int, user_comment: str | None
) -> GlobalOpenPort | None:
    """Update the user_comment on a GlobalOpenPort. Returns None if not found."""
    repo = GlobalOpenPortRepository(db)
    port = await repo.get_by_id(port_id)
    if port is None:
        return None
    return await repo.update(port, user_comment=user_comment)


async def get_latest_scan_times_by_network(
    db: AsyncSession,
) -> dict[int, datetime]:
    """Get the latest completed scan timestamp for each network.

    Returns:
        Dict mapping network_id to their latest completed scan's completed_at.
    """
    result = await db.execute(
        select(
            Scan.network_id,
            func.max(Scan.completed_at),
        )
        .where(
            Scan.status == ScanStatus.COMPLETED,
            Scan.completed_at.isnot(None),
        )
        .group_by(Scan.network_id)
    )
    return {row[0]: row[1] for row in result.all()}


def compute_port_staleness(
    port_last_seen: datetime,
    port_networks: list[int],
    latest_scan_times: dict[int, datetime],
) -> bool:
    """Determine if a port is stale based on its networks' latest scans.

    A port is stale if ALL of its networks have completed a scan after
    the port's last_seen_at timestamp.
    """
    if not port_networks:
        return False

    for network_id in port_networks:
        latest_scan = latest_scan_times.get(network_id)
        if latest_scan is None:
            # Network has never completed a scan — can't determine staleness
            return False
        if port_last_seen >= latest_scan:
            # Port was seen at or after this network's latest scan
            return False

    return True
