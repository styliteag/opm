"""Service for managing global port rules (whitelist/blocklist)."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_port_rule import GlobalPortRule, GlobalRuleType


async def get_all_global_rules(db: AsyncSession) -> list[GlobalPortRule]:
    """Get all global port rules."""
    stmt = select(GlobalPortRule).order_by(GlobalPortRule.id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_global_rule_by_id(db: AsyncSession, rule_id: int) -> GlobalPortRule | None:
    """Get a global port rule by its ID."""
    stmt = select(GlobalPortRule).where(GlobalPortRule.id == rule_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_global_rule(
    db: AsyncSession,
    port: str,
    rule_type: GlobalRuleType,
    ip: str | None = None,
    description: str | None = None,
    created_by: int | None = None,
) -> GlobalPortRule:
    """Create a new global port rule."""
    if not description or not description.strip():
        raise ValueError("A reason/description is required for transparency in global security rules.")

    rule = GlobalPortRule(
        ip=ip,
        port=port,
        rule_type=rule_type,
        description=description.strip(),
        created_by=created_by,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def delete_global_rule(db: AsyncSession, rule: GlobalPortRule) -> None:
    """Delete a global port rule."""
    await db.delete(rule)
    await db.flush()


async def delete_global_rule_by_id(db: AsyncSession, rule_id: int) -> bool:
    """Delete a global port rule by ID. Returns True if a rule was deleted."""
    stmt = delete(GlobalPortRule).where(GlobalPortRule.id == rule_id)
    result = await db.execute(stmt)
    await db.flush()
    return result.rowcount > 0


def _parse_port_range(value: str) -> tuple[int, int] | None:
    """Parse a port or port range string into a (start, end) tuple."""
    if not value or value == "*":
        return 1, 65535

    cleaned = value.strip()
    if "-" in cleaned:
        parts = cleaned.split("-", maxsplit=1)
        try:
            start = int(parts[0])
            end = int(parts[1])
        except ValueError:
            return None
        if start > end:
            return None
        return start, end

    try:
        port = int(cleaned)
    except ValueError:
        return None
    return port, port


async def is_port_whitelisted(
    db: AsyncSession,
    ip: str,
    port: int,
) -> bool:
    """
    Check if a port is whitelisted in global rules.

    Checks both:
    - Global rules (ip is null) that match the port
    - IP-specific rules that match both IP and port
    """
    rules = await get_all_global_rules(db)

    for rule in rules:
        if rule.rule_type != GlobalRuleType.ALLOW:
            continue

        parsed = _parse_port_range(rule.port)
        if parsed is None:
            continue

        start, end = parsed
        if not (start <= port <= end):
            continue

        # Port matches, check if rule applies
        if rule.ip is None:
            # Global rule (applies to all IPs)
            return True
        if rule.ip == ip:
            # IP-specific rule that matches
            return True

    return False


async def is_port_blocked(
    db: AsyncSession,
    ip: str,
    port: int,
) -> bool:
    """
    Check if a port is blocked in global rules.

    Checks both:
    - Global rules (ip is null) that match the port
    - IP-specific rules that match both IP and port
    """
    rules = await get_all_global_rules(db)

    for rule in rules:
        if rule.rule_type != GlobalRuleType.BLOCK:
            continue

        parsed = _parse_port_range(rule.port)
        if parsed is None:
            continue

        start, end = parsed
        if not (start <= port <= end):
            continue

        # Port matches, check if rule applies
        if rule.ip is None:
            # Global rule (applies to all IPs)
            return True
        if rule.ip == ip:
            # IP-specific rule that matches
            return True

    return False


async def get_whitelist_rules(db: AsyncSession) -> list[GlobalPortRule]:
    """Get all ALLOW rules."""
    stmt = (
        select(GlobalPortRule)
        .where(GlobalPortRule.rule_type == GlobalRuleType.ALLOW)
        .order_by(GlobalPortRule.id)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_blocklist_rules(db: AsyncSession) -> list[GlobalPortRule]:
    """Get all BLOCK rules."""
    stmt = (
        select(GlobalPortRule)
        .where(GlobalPortRule.rule_type == GlobalRuleType.BLOCK)
        .order_by(GlobalPortRule.id)
    )
    result = await db.execute(stmt)
    return list(result.scalars().all())
async def update_global_rule(
    db: AsyncSession,
    rule: GlobalPortRule,
    ip: str | None = None,
    port: str | None = None,
    rule_type: GlobalRuleType | None = None,
    description: str | None = None,
) -> GlobalPortRule:
    """Update a global port rule."""
    if description is not None:
        if not description.strip():
            raise ValueError("A reason/description is required for transparency in global security rules.")
        rule.description = description.strip()
    
    if ip is not None:
        rule.ip = ip if ip.strip() else None
        
    if port is not None:
        # Port normalization is handled by the schema/router validation calling validate_port_or_range
        rule.port = port
        
    if rule_type is not None:
        rule.rule_type = rule_type

    await db.flush()
    await db.refresh(rule)
    return rule
