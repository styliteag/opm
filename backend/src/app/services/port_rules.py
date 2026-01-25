"""Port rule management service for CRUD operations."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.port_rule import PortRule, RuleType


async def get_rules_by_network_id(db: AsyncSession, network_id: int) -> list[PortRule]:
    """Get all port rules for a specific network."""
    stmt = select(PortRule).where(PortRule.network_id == network_id).order_by(PortRule.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_rule_by_id(db: AsyncSession, rule_id: int) -> PortRule | None:
    """Get a port rule by its ID."""
    stmt = select(PortRule).where(PortRule.id == rule_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_rule(
    db: AsyncSession,
    network_id: int,
    port: str,
    rule_type: RuleType,
    ip: str | None = None,
    description: str | None = None,
) -> PortRule:
    """Create a new port rule."""
    rule = PortRule(
        network_id=network_id,
        ip=ip,
        port=port,
        rule_type=rule_type,
        description=description,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, rule: PortRule) -> None:
    """Delete a port rule."""
    await db.delete(rule)
    await db.flush()


async def delete_rules_by_network_id(db: AsyncSession, network_id: int) -> None:
    """Delete all port rules for a network."""
    stmt = delete(PortRule).where(PortRule.network_id == network_id)
    await db.execute(stmt)
    await db.flush()


async def bulk_replace_rules(
    db: AsyncSession,
    network_id: int,
    rules: list[tuple[str, RuleType, str | None, str | None]],
) -> list[PortRule]:
    """Replace all rules for a network with new ones (bulk import/update).

    Args:
        db: Database session
        network_id: Network ID to update rules for
        rules: List of tuples (port, rule_type, description, ip)

    Returns:
        List of newly created PortRule objects
    """
    # Delete existing rules
    await delete_rules_by_network_id(db, network_id)

    # Create new rules
    new_rules = []
    for port, rule_type, description, ip in rules:
        rule = PortRule(
            network_id=network_id,
            ip=ip,
            port=port,
            rule_type=rule_type,
            description=description,
        )
        db.add(rule)
        new_rules.append(rule)

    await db.flush()

    # Refresh all rules to get their IDs
    for rule in new_rules:
        await db.refresh(rule)

    return new_rules
