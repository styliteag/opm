"""Service for managing hosts."""

from datetime import datetime
from ipaddress import IPv4Address, IPv6Address
from typing import Any, cast

from sqlalchemy import and_, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.models.global_open_port import GlobalOpenPort
from app.models.host import Host

IPRange = tuple[int, IPv4Address | IPv6Address, IPv4Address | IPv6Address]


async def get_host_by_ip(db: AsyncSession, ip: str) -> Host | None:
    """Get a host by IP address."""
    result = await db.execute(select(Host).where(Host.ip == ip))
    return result.scalar_one_or_none()


async def get_host_by_id(db: AsyncSession, host_id: int) -> Host | None:
    """Get a host by its ID."""
    result = await db.execute(select(Host).where(Host.id == host_id))
    return result.scalar_one_or_none()


async def upsert_host(
    db: AsyncSession,
    ip: str,
    *,
    hostname: str | None = None,
    is_pingable: bool | None = None,
    mac_address: str | None = None,
    mac_vendor: str | None = None,
    network_id: int | None = None,
    timestamp: datetime | None = None,
) -> tuple[Host, bool]:
    """
    Create or update a host entry.

    Returns:
        Tuple of (Host, is_new) where is_new is True if this was a new entry.
    """
    now = timestamp or datetime.utcnow()

    existing = await get_host_by_ip(db, ip)

    if existing:
        # Update existing entry
        existing.last_seen_at = now

        # Add network to seen_by_networks if not already present
        if network_id is not None:
            networks = set(existing.seen_by_networks or [])
            networks.add(network_id)
            existing.seen_by_networks = sorted(networks)

        # Update hostname only if the host doesn't have one yet
        if hostname is not None and not existing.hostname:
            existing.hostname = hostname
        if is_pingable is not None:
            existing.is_pingable = is_pingable
        if mac_address is not None:
            existing.mac_address = mac_address
        if mac_vendor is not None:
            existing.mac_vendor = mac_vendor

        await db.flush()
        await db.refresh(existing)
        return existing, False

    # Create new entry
    initial_networks = [network_id] if network_id is not None else []
    new_host = Host(
        ip=ip,
        hostname=hostname,
        is_pingable=is_pingable,
        mac_address=mac_address,
        mac_vendor=mac_vendor,
        first_seen_at=now,
        last_seen_at=now,
        seen_by_networks=initial_networks,
    )
    db.add(new_host)
    await db.flush()
    await db.refresh(new_host)
    return new_host, True


async def update_host_comment(
    db: AsyncSession,
    host_id: int,
    user_comment: str | None,
) -> Host | None:
    """Update a host's user comment."""
    host = await get_host_by_id(db, host_id)
    if host is None:
        return None

    host.user_comment = user_comment
    await db.flush()
    await db.refresh(host)
    return host


async def get_hosts(
    db: AsyncSession,
    *,
    network_id: int | None = None,
    is_pingable: bool | None = None,
    ip_range: IPRange | None = None,
    ip_search: str | None = None,
    sort_by: str = "last_seen_at",
    sort_dir: str = "desc",
    offset: int = 0,
    limit: int = 50,
) -> list[Host]:
    """
    Get hosts with optional filtering and pagination.

    Returns a list of Host objects.
    """
    query = select(Host)

    filters: list[ColumnElement[bool]] = []

    if network_id is not None:
        # Filter by hosts that have been seen by this network
        filters.append(func.json_contains(Host.seen_by_networks, str(network_id)))

    if is_pingable is not None:
        filters.append(Host.is_pingable == is_pingable)

    if ip_search:
        filters.append(Host.ip.ilike(f"%{ip_search}%"))

    if ip_range is not None:
        version, start_ip, end_ip = ip_range
        if version == 4:
            filters.append(func.inet_aton(Host.ip).between(int(start_ip), int(end_ip)))
        else:
            filters.append(
                func.inet6_aton(Host.ip).between(
                    func.inet6_aton(str(start_ip)),
                    func.inet6_aton(str(end_ip)),
                )
            )

    if filters:
        query = query.where(and_(*filters))

    sort_fields: dict[str, Any] = {
        "ip": func.inet6_aton(Host.ip),  # Numeric sort for both IPv4 and IPv6
        "hostname": Host.hostname,
        "first_seen_at": Host.first_seen_at,
        "last_seen_at": Host.last_seen_at,
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

    query = query.order_by(sort_expression, Host.id.asc()).offset(offset).limit(limit)

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_host_open_ports(
    db: AsyncSession,
    host_id: int,
) -> list[GlobalOpenPort]:
    """Get open ports associated with a host."""
    result = await db.execute(
        select(GlobalOpenPort)
        .where(GlobalOpenPort.host_id == host_id)
        .order_by(GlobalOpenPort.port.asc())
    )
    return list(result.scalars().all())


async def get_open_port_count_for_host(db: AsyncSession, host_id: int) -> int:
    """Get the count of open ports for a host."""
    result = await db.execute(
        select(func.count()).where(GlobalOpenPort.host_id == host_id)
    )
    return result.scalar_one()


async def get_host_counts(
    db: AsyncSession,
    *,
    network_id: int | None = None,
    ip_range: IPRange | None = None,
    ip_search: str | None = None,
) -> tuple[int, int]:
    """
    Get total host count and pingable host count with optional filters.

    Returns:
        Tuple of (total_count, pingable_count)
    """
    filters: list[Any] = []

    if network_id is not None:
        filters.append(func.json_contains(Host.seen_by_networks, str(network_id)))

    if ip_search:
        filters.append(Host.ip.ilike(f"%{ip_search}%"))

    if ip_range is not None:
        version, start_ip, end_ip = ip_range
        if version == 4:
            filters.append(func.inet_aton(Host.ip).between(int(start_ip), int(end_ip)))
        else:
            filters.append(
                func.inet6_aton(Host.ip).between(
                    func.inet6_aton(str(start_ip)),
                    func.inet6_aton(str(end_ip)),
                )
            )

    # Total count query
    total_query = select(func.count()).select_from(Host)
    if filters:
        total_query = total_query.where(and_(*filters))

    total_result = await db.execute(total_query)
    total_count = total_result.scalar_one()

    # Pingable count query
    pingable_filters = filters + [Host.is_pingable == True]  # noqa: E712
    pingable_query = select(func.count()).select_from(Host).where(and_(*pingable_filters))

    pingable_result = await db.execute(pingable_query)
    pingable_count = pingable_result.scalar_one()

    return total_count, pingable_count


async def link_port_to_host(db: AsyncSession, port_id: int, host_id: int) -> None:
    """Link a global open port to a host."""
    result = await db.execute(select(GlobalOpenPort).where(GlobalOpenPort.id == port_id))
    port = result.scalar_one_or_none()
    if port:
        port.host_id = host_id
        await db.flush()


async def delete_host(db: AsyncSession, host_id: int) -> bool:
    """Delete a host by ID. Returns True if deleted, False if not found."""
    host = await get_host_by_id(db, host_id)
    if host is None:
        return False

    # Unlink any associated open ports (set host_id to NULL)
    await db.execute(
        update(GlobalOpenPort)
        .where(GlobalOpenPort.host_id == host_id)
        .values(host_id=None)
    )

    await db.delete(host)
    await db.flush()
    return True


async def delete_hosts_bulk(db: AsyncSession, host_ids: list[int]) -> list[int]:
    """Delete multiple hosts by ID. Returns list of IDs that were actually deleted."""
    if not host_ids:
        return []

    # Unlink open ports from these hosts
    await db.execute(
        update(GlobalOpenPort)
        .where(GlobalOpenPort.host_id.in_(host_ids))
        .values(host_id=None)
    )

    # Delete the hosts
    result = await db.execute(select(Host).where(Host.id.in_(host_ids)))
    hosts_to_delete = list(result.scalars().all())
    deleted_ids = [h.id for h in hosts_to_delete]

    for host in hosts_to_delete:
        await db.delete(host)

    await db.flush()
    return deleted_ids
