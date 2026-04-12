"""Service for managing hosts."""

from collections.abc import Mapping
from datetime import date, datetime, timedelta
from typing import Any, cast

from sqlalchemy import and_, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.lib.ip_utils import IPRange
from app.models.alert import Alert
from app.models.global_open_port import GlobalOpenPort
from app.models.host import Host
from app.models.hostname_lookup import HostnameLookup
from app.repositories.base import BaseRepository


def _build_search_filter(term: str) -> ColumnElement[bool]:
    """Build an OR filter matching hosts by IP, hostname, comment, or cached vhosts."""
    like_term = f"%{term}%"
    return or_(
        Host.ip.ilike(like_term),
        Host.hostname.ilike(like_term),
        Host.user_comment.ilike(like_term),
        exists(
            select(HostnameLookup.id).where(
                HostnameLookup.ip == Host.ip,
                func.json_search(
                    HostnameLookup.hostnames_json, "one", like_term
                ).isnot(None),
            )
        ),
    )


class HostRepository(BaseRepository[Host]):
    model = Host


async def get_host_by_ip(db: AsyncSession, ip: str) -> Host | None:
    """Get a host by IP address."""
    return await HostRepository(db).get_by_field(Host.ip, ip)


async def get_host_by_id(db: AsyncSession, host_id: int) -> Host | None:
    """Get a host by its ID."""
    return await HostRepository(db).get_by_id(host_id)


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
    return await HostRepository(db).flush_and_refresh(host)


async def update_host_fields(
    db: AsyncSession,
    host_id: int,
    fields: "Mapping[str, object]",
) -> Host | None:
    """Update specified fields on a host."""
    host = await get_host_by_id(db, host_id)
    if host is None:
        return None

    return await HostRepository(db).update(host, **dict(fields))


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
        filters.append(_build_search_filter(ip_search))

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
    result = await db.execute(select(func.count()).where(GlobalOpenPort.host_id == host_id))
    return result.scalar_one()


async def get_open_port_counts_for_hosts(
    db: AsyncSession, host_ids: list[int],
) -> dict[int, int]:
    """Get open port counts for multiple hosts in a single query."""
    if not host_ids:
        return {}
    result = await db.execute(
        select(GlobalOpenPort.host_id, func.count())
        .where(GlobalOpenPort.host_id.in_(host_ids))
        .group_by(GlobalOpenPort.host_id)
    )
    counts = {row[0]: row[1] for row in result.all()}
    return {hid: counts.get(hid, 0) for hid in host_ids}


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
        filters.append(_build_search_filter(ip_search))

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
        update(GlobalOpenPort).where(GlobalOpenPort.host_id == host_id).values(host_id=None)
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
        update(GlobalOpenPort).where(GlobalOpenPort.host_id.in_(host_ids)).values(host_id=None)
    )

    # Delete the hosts
    result = await db.execute(select(Host).where(Host.id.in_(host_ids)))
    hosts_to_delete = list(result.scalars().all())
    deleted_ids = [h.id for h in hosts_to_delete]

    for host in hosts_to_delete:
        await db.delete(host)

    await db.flush()
    return deleted_ids


# Severity weights for risk score computation
_SEVERITY_WEIGHTS: dict[str, int] = {
    "blocked": 25,
    "nse_cve_detected": 25,
    "not_allowed": 15,
    "ssh_weak_cipher": 10,
    "ssh_weak_kex": 10,
    "ssh_insecure_auth": 10,
    "nse_vulnerability": 10,
    "new_port": 5,
    "ssh_outdated_version": 5,
    "ssh_config_regression": 5,
}


async def get_host_risk_trend(
    db: AsyncSession,
    host_ip: str,
    days: int = 14,
) -> list[dict[str, Any]]:
    """Compute daily risk score for a host over recent days.

    Risk score = sum of severity weights for active (non-dismissed) alerts
    that existed on each day.
    """
    end = date.today()
    start = end - timedelta(days=days - 1)

    # Get all alerts for this host with their created_at dates
    result = await db.execute(
        select(Alert.alert_type, Alert.created_at, Alert.dismissed).where(Alert.ip == host_ip)
    )
    alerts = result.all()

    # Build daily scores
    points: list[dict[str, Any]] = []
    for day_offset in range(days):
        current_date = start + timedelta(days=day_offset)
        score = 0
        for alert_type, created_at, dismissed in alerts:
            # Alert existed on this day if created before end of day
            created_date = created_at.date() if isinstance(created_at, datetime) else created_at
            if created_date <= current_date:
                type_str = alert_type.value if hasattr(alert_type, "value") else str(alert_type)
                weight = _SEVERITY_WEIGHTS.get(type_str, 3)
                if not dismissed:
                    score += weight
                else:
                    score += 1  # Dismissed alerts contribute minimal score

        points.append({"date": current_date, "score": min(score, 100)})

    return points
