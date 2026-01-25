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


async def get_networks_by_scanner_id(db: AsyncSession, scanner_id: int) -> list[Network]:
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
    scanner_type: str = "masscan",
    scan_protocol: str = "tcp",
    alert_config: dict[str, Any] | None = None,
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
        scanner_type=scanner_type,
        scan_protocol=scan_protocol,
        alert_config=alert_config,
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
    scanner_type: str | None = None,
    scan_protocol: str | None = None,
    alert_config: dict[str, Any] | None = None,
    clear_schedule: bool = False,
    clear_alert_config: bool = False,
) -> Network:
    """Update an existing network.

    Args:
        db: Database session
        network: Network to update
        name: New name (if provided)
        cidr: New CIDR (if provided)
        port_spec: New port spec (if provided)
        scanner_id: New scanner ID (if provided)
        scan_schedule: New scan schedule (if provided)
        scan_rate: New scan rate (if provided)
        scan_timeout: New scan timeout (if provided)
        port_timeout: New port timeout (if provided)
        scanner_type: New scanner type (if provided)
        scan_protocol: New scan protocol (if provided)
        alert_config: New alert config (if provided)
        clear_schedule: If True, clear the scan_schedule even if None
        clear_alert_config: If True, clear the alert_config even if None
    """
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
    if scanner_type is not None:
        network.scanner_type = scanner_type
    if scan_protocol is not None:
        network.scan_protocol = scan_protocol
    if alert_config is not None or clear_alert_config:
        network.alert_config = alert_config

    await db.flush()
    await db.refresh(network)
    return network


async def delete_network(db: AsyncSession, network: Network) -> None:
    """Delete a network (cascades to scans, rules, exclusions)."""
    await db.delete(network)
    await db.flush()
