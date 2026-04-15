"""Service layer for GVM per-OID severity override rules."""

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gvm_severity_rule import GvmSeverityRule


async def list_rules(
    db: AsyncSession,
    *,
    network_id: int | None = None,
    oid: str | None = None,
) -> list[GvmSeverityRule]:
    """List rules. If ``network_id`` given, include global + that network."""
    query = select(GvmSeverityRule)
    filters = []
    if network_id is not None:
        filters.append(
            or_(
                GvmSeverityRule.network_id == network_id,
                GvmSeverityRule.network_id.is_(None),
            )
        )
    if oid is not None:
        filters.append(GvmSeverityRule.oid == oid)
    if filters:
        query = query.where(and_(*filters))
    query = query.order_by(GvmSeverityRule.created_at.desc())
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_rule(db: AsyncSession, rule_id: int) -> GvmSeverityRule | None:
    return await db.get(GvmSeverityRule, rule_id)


async def get_rule_by_scope(
    db: AsyncSession, oid: str, network_id: int | None
) -> GvmSeverityRule | None:
    query = select(GvmSeverityRule).where(GvmSeverityRule.oid == oid)
    if network_id is None:
        query = query.where(GvmSeverityRule.network_id.is_(None))
    else:
        query = query.where(GvmSeverityRule.network_id == network_id)
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def upsert_rule(
    db: AsyncSession,
    *,
    oid: str,
    network_id: int | None,
    severity_override: str,
    reason: str | None,
    created_by_user_id: int | None,
) -> GvmSeverityRule:
    """Create-or-update a rule scoped to (oid, network_id)."""
    existing = await get_rule_by_scope(db, oid, network_id)
    if existing is not None:
        existing.severity_override = severity_override
        existing.reason = reason
        return existing
    rule = GvmSeverityRule(
        oid=oid,
        network_id=network_id,
        severity_override=severity_override,
        reason=reason,
        created_by_user_id=created_by_user_id,
    )
    db.add(rule)
    await db.flush()
    return rule


async def update_rule(
    db: AsyncSession,
    rule: GvmSeverityRule,
    *,
    severity_override: str | None = None,
    reason: str | None = None,
) -> GvmSeverityRule:
    if severity_override is not None:
        rule.severity_override = severity_override
    if reason is not None:
        rule.reason = reason
    return rule


async def delete_rule(db: AsyncSession, rule: GvmSeverityRule) -> None:
    await db.delete(rule)


async def resolve_overrides(
    db: AsyncSession, network_id: int, oids: list[str]
) -> dict[str, str]:
    """Return ``{oid -> effective severity label}`` for the given OIDs.

    Only entries with an applicable rule appear in the output. The network
    scope wins over the global scope.
    """
    if not oids:
        return {}
    result = await db.execute(
        select(GvmSeverityRule).where(
            and_(
                GvmSeverityRule.oid.in_(oids),
                or_(
                    GvmSeverityRule.network_id == network_id,
                    GvmSeverityRule.network_id.is_(None),
                ),
            )
        )
    )
    global_by_oid: dict[str, str] = {}
    network_by_oid: dict[str, str] = {}
    for rule in result.scalars().all():
        if rule.network_id == network_id:
            network_by_oid[rule.oid] = rule.severity_override
        else:
            global_by_oid[rule.oid] = rule.severity_override
    # Network rule wins; global fills in the rest.
    return {**global_by_oid, **network_by_oid}
