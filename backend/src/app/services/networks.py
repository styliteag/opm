"""Network management service for CRUD operations."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network


async def get_all_networks(db: AsyncSession) -> list[Network]:
    """Get all networks."""
    stmt = select(Network).order_by(Network.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_network_by_id(db: AsyncSession, network_id: int) -> Network | None:
    """Get a network by its ID."""
    stmt = select(Network).where(Network.id == network_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_network_by_name(db: AsyncSession, name: str) -> Network | None:
    """Get a network by its name."""
    stmt = select(Network).where(Network.name == name)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_networks_by_scanner_id(
    db: AsyncSession, scanner_id: int,
) -> list[Network]:
    """Get all networks for a specific scanner."""
    stmt = (
        select(Network)
        .where(Network.scanner_id == scanner_id)
        .order_by(Network.created_at.desc())
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def create_network(
    db: AsyncSession,
    name: str,
    cidr: str,
    port_spec: str,
    scanner_id: int,
    scan_schedule: str | None = None,
    scan_rate: int | None = None,
    scan_timeout: int | None = None,
    port_timeout: int | None = None,
    scan_protocol: str = "tcp",
    alert_config: dict[str, Any] | None = None,
    scan_profile_id: int | None = None,
) -> Network:
    """Create a new network."""
    network = Network(
        name=name,
        cidr=cidr,
        port_spec=port_spec,
        scanner_id=scanner_id,
        scan_schedule=scan_schedule,
        scan_rate=scan_rate,
        scan_timeout=scan_timeout,
        port_timeout=port_timeout,
        scan_protocol=scan_protocol,
        alert_config=alert_config,
        scan_profile_id=scan_profile_id,
    )
    db.add(network)
    await db.flush()
    await db.refresh(network)
    return network


async def update_network(
    db: AsyncSession,
    network: Network,
    name: str | None = None,
    cidr: str | None = None,
    port_spec: str | None = None,
    scanner_id: int | None = None,
    scan_schedule: str | None = None,
    scan_rate: int | None = None,
    scan_timeout: int | None = None,
    port_timeout: int | None = None,
    scan_protocol: str | None = None,
    alert_config: dict[str, Any] | None = None,
    scan_profile_id: int | None = None,
    clear_scan_profile: bool = False,
    clear_schedule: bool = False,
    clear_alert_config: bool = False,
) -> Network:
    """Update an existing network."""
    if name is not None:
        network.name = name
    if cidr is not None:
        network.cidr = cidr
    if port_spec is not None:
        network.port_spec = port_spec
    if scanner_id is not None:
        network.scanner_id = scanner_id
    if scan_schedule is not None or clear_schedule:
        network.scan_schedule = scan_schedule
    if scan_rate is not None:
        network.scan_rate = scan_rate
    if scan_timeout is not None:
        network.scan_timeout = scan_timeout
    if port_timeout is not None:
        network.port_timeout = port_timeout
    if scan_protocol is not None:
        network.scan_protocol = scan_protocol
    if alert_config is not None or clear_alert_config:
        network.alert_config = alert_config
    if scan_profile_id is not None or clear_scan_profile:
        network.scan_profile_id = scan_profile_id

    await db.flush()
    await db.refresh(network)
    return network


async def delete_network(db: AsyncSession, network: Network) -> None:
    """Delete a network (cascades to scans, rules, exclusions)."""
    await db.delete(network)
    await db.flush()
