"""Excluded port management service for CRUD operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.excluded_port import ExcludedPort


async def get_exclusions_by_network_id(
    db: AsyncSession, network_id: int
) -> list[ExcludedPort]:
    """Get all excluded ports for a specific network."""
    stmt = (
        select(ExcludedPort)
        .where(ExcludedPort.network_id == network_id)
        .order_by(ExcludedPort.id)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_exclusion_by_id(db: AsyncSession, exclusion_id: int) -> ExcludedPort | None:
    """Get an excluded port entry by its ID."""
    stmt = select(ExcludedPort).where(ExcludedPort.id == exclusion_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_exclusion(
    db: AsyncSession,
    network_id: int,
    ip: str | None,
    port: int,
    reason: str,
    created_by: int,
) -> ExcludedPort:
    """Create a new excluded port entry."""
    exclusion = ExcludedPort(
        network_id=network_id,
        ip=ip,
        port=port,
        reason=reason,
        created_by=created_by,
    )
    db.add(exclusion)
    await db.flush()
    await db.refresh(exclusion)
    return exclusion


async def delete_exclusion(db: AsyncSession, exclusion: ExcludedPort) -> None:
    """Delete an excluded port entry."""
    await db.delete(exclusion)
    await db.flush()
