"""Service for managing unified alert rules (accepted/critical)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert_rule import AlertRule, RuleType


async def get_all_rules(
    db: AsyncSession,
    source: str | None = None,
    network_id: int | None = None,
) -> list[AlertRule]:
    """Get alert rules with optional filters."""
    stmt = select(AlertRule).order_by(AlertRule.id)
    if source is not None:
        stmt = stmt.where(AlertRule.source == source)
    if network_id is not None:
        stmt = stmt.where(AlertRule.network_id == network_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_global_rules(
    db: AsyncSession,
    source: str | None = None,
) -> list[AlertRule]:
    """Get global rules (network_id IS NULL)."""
    stmt = select(AlertRule).where(AlertRule.network_id.is_(None)).order_by(AlertRule.id)
    if source is not None:
        stmt = stmt.where(AlertRule.source == source)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_rules_by_network_id(
    db: AsyncSession,
    network_id: int,
    source: str | None = None,
) -> list[AlertRule]:
    """Get all rules for a specific network."""
    stmt = select(AlertRule).where(AlertRule.network_id == network_id).order_by(AlertRule.id)
    if source is not None:
        stmt = stmt.where(AlertRule.source == source)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_rule_by_id(db: AsyncSession, rule_id: int) -> AlertRule | None:
    """Get a rule by its ID."""
    stmt = select(AlertRule).where(AlertRule.id == rule_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_rule(
    db: AsyncSession,
    source: str,
    rule_type: RuleType,
    match_criteria: dict[str, Any],
    network_id: int | None = None,
    description: str | None = None,
    created_by: int | None = None,
) -> AlertRule:
    """Create a new alert rule. Returns existing rule if a duplicate exists.

    For global rules (network_id=None), description is required.
    """
    if network_id is None and (not description or not description.strip()):
        raise ValueError(
            "A reason/description is required for transparency in global security rules."
        )

    # Check for duplicate
    existing = await _find_duplicate(db, source, rule_type, match_criteria, network_id)
    if existing is not None:
        return existing

    rule = AlertRule(
        network_id=network_id,
        source=source,
        rule_type=rule_type,
        match_criteria=match_criteria,
        description=description.strip() if description else description,
        created_by=created_by,
    )
    db.add(rule)
    await db.flush()
    await db.refresh(rule)
    return rule


async def _find_duplicate(
    db: AsyncSession,
    source: str,
    rule_type: RuleType,
    match_criteria: dict[str, Any],
    network_id: int | None,
) -> AlertRule | None:
    """Find an existing rule with the same key fields."""
    stmt = select(AlertRule).where(
        AlertRule.source == source,
        AlertRule.rule_type == rule_type,
    )
    if network_id is None:
        stmt = stmt.where(AlertRule.network_id.is_(None))
    else:
        stmt = stmt.where(AlertRule.network_id == network_id)

    result = await db.execute(stmt)
    candidates = result.scalars().all()

    # Compare match_criteria as normalized JSON
    criteria_str = json.dumps(match_criteria, sort_keys=True)
    for candidate in candidates:
        candidate_str = json.dumps(candidate.match_criteria, sort_keys=True)
        if candidate_str == criteria_str:
            return candidate

    return None


async def delete_rule(db: AsyncSession, rule: AlertRule) -> None:
    """Delete an alert rule."""
    await db.delete(rule)
    await db.flush()


async def delete_rule_by_id(db: AsyncSession, rule_id: int) -> bool:
    """Delete an alert rule by ID. Returns True if a rule was deleted."""
    stmt = delete(AlertRule).where(AlertRule.id == rule_id)
    cursor_result = await db.execute(stmt)
    await db.flush()
    rowcount = cursor_result.rowcount  # type: ignore[attr-defined]
    return rowcount is not None and rowcount > 0


async def delete_rules_by_network_id(
    db: AsyncSession,
    network_id: int,
    source: str | None = None,
) -> None:
    """Delete all rules for a network."""
    stmt = delete(AlertRule).where(AlertRule.network_id == network_id)
    if source is not None:
        stmt = stmt.where(AlertRule.source == source)
    await db.execute(stmt)
    await db.flush()


async def update_rule(
    db: AsyncSession,
    rule: AlertRule,
    match_criteria: dict[str, Any] | None = None,
    rule_type: RuleType | None = None,
    description: str | None = None,
    enabled: bool | None = None,
) -> AlertRule:
    """Update an alert rule."""
    if description is not None:
        if rule.network_id is None and not description.strip():
            raise ValueError(
                "A reason/description is required for transparency in global security rules."
            )
        rule.description = description.strip()

    if match_criteria is not None:
        rule.match_criteria = match_criteria

    if rule_type is not None:
        rule.rule_type = rule_type

    if enabled is not None:
        rule.enabled = enabled

    await db.flush()
    await db.refresh(rule)
    return rule


# ---------------------------------------------------------------------------
# Port-source convenience helpers (backward compatible)
# ---------------------------------------------------------------------------


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


def port_rule_matches_alert(
    rule: AlertRule,
    ip: str,
    port: int,
) -> bool:
    """Check if a port-source alert rule matches a given ip:port."""
    criteria = rule.match_criteria
    rule_port_str = criteria.get("port")
    if rule_port_str is None:
        return False

    parsed = _parse_port_range(str(rule_port_str))
    if parsed is None:
        return False

    start, end = parsed
    if not (start <= port <= end):
        return False

    rule_ip = criteria.get("ip")
    if rule_ip is not None and rule_ip != ip:
        return False

    return True


def ssh_rule_matches_alert(
    rule: AlertRule,
    ip: str,
    port: int | None,
    alert_type: str | None = None,
) -> bool:
    """Check if an SSH-source alert rule matches a given alert."""
    criteria = rule.match_criteria

    # IP match
    rule_ip = criteria.get("ip")
    if rule_ip is not None and rule_ip != ip:
        return False

    # Port match (optional)
    rule_port_str = criteria.get("port")
    if rule_port_str is not None and port is not None:
        parsed = _parse_port_range(str(rule_port_str))
        if parsed is not None:
            start, end = parsed
            if not (start <= port <= end):
                return False

    # Alert type match (optional)
    rule_alert_type = criteria.get("alert_type")
    if rule_alert_type is not None and alert_type is not None:
        if rule_alert_type != alert_type:
            return False

    return True


async def is_port_accepted(
    db: AsyncSession,
    ip: str,
    port: int,
) -> bool:
    """Check if a port is accepted by global alert rules."""
    rules = await get_global_rules(db, source="port")
    for rule in rules:
        if not rule.enabled or rule.rule_type != RuleType.ACCEPTED:
            continue
        if port_rule_matches_alert(rule, ip, port):
            return True
    return False


async def is_port_blocked(
    db: AsyncSession,
    ip: str,
    port: int,
) -> bool:
    """Check if a port is blocked by global alert rules."""
    rules = await get_global_rules(db, source="port")
    for rule in rules:
        if not rule.enabled or rule.rule_type != RuleType.CRITICAL:
            continue
        if port_rule_matches_alert(rule, ip, port):
            return True
    return False


def nse_rule_matches_alert(
    rule: AlertRule,
    ip: str,
    port: int | None,
    alert_type: str | None = None,
    script_name: str | None = None,
) -> bool:
    """Check if an NSE-source alert rule matches a given alert."""
    criteria = rule.match_criteria

    # IP match
    rule_ip = criteria.get("ip")
    if rule_ip is not None and rule_ip != ip:
        return False

    # Port match (optional)
    rule_port_str = criteria.get("port")
    if rule_port_str is not None and port is not None:
        parsed = _parse_port_range(str(rule_port_str))
        if parsed is not None:
            start, end = parsed
            if not (start <= port <= end):
                return False

    # Alert type match (optional)
    rule_alert_type = criteria.get("alert_type")
    if rule_alert_type is not None and alert_type is not None:
        if rule_alert_type != alert_type:
            return False

    # Script name match (optional)
    rule_script = criteria.get("script_name")
    if rule_script is not None and script_name is not None:
        if rule_script != script_name:
            return False

    return True


async def is_nse_accepted(
    db: AsyncSession,
    ip: str,
    port: int | None,
    alert_type: str | None = None,
    script_name: str | None = None,
) -> bool:
    """Check if an NSE alert is accepted by global alert rules."""
    rules = await get_global_rules(db, source="nse")
    for rule in rules:
        if not rule.enabled or rule.rule_type != RuleType.ACCEPTED:
            continue
        if nse_rule_matches_alert(rule, ip, port, alert_type, script_name):
            return True
    return False


async def is_ssh_accepted(
    db: AsyncSession,
    ip: str,
    port: int | None,
    alert_type: str | None = None,
) -> bool:
    """Check if an SSH alert is accepted by global alert rules."""
    rules = await get_global_rules(db, source="ssh")
    for rule in rules:
        if not rule.enabled or rule.rule_type != RuleType.ACCEPTED:
            continue
        if ssh_rule_matches_alert(rule, ip, port, alert_type):
            return True
    return False


async def bulk_replace_port_rules(
    db: AsyncSession,
    network_id: int,
    rules: list[tuple[str, RuleType, str | None, str | None]],
) -> list[AlertRule]:
    """Replace all port-source rules for a network (bulk import/update).

    Args:
        db: Database session
        network_id: Network ID to update rules for
        rules: List of tuples (port, rule_type, description, ip)

    Returns:
        List of newly created AlertRule objects
    """
    await delete_rules_by_network_id(db, network_id, source="port")

    new_rules = []
    for port, rule_type, description, ip in rules:
        criteria: dict[str, Any] = {"port": port}
        if ip:
            criteria["ip"] = ip
        rule = AlertRule(
            network_id=network_id,
            source="port",
            rule_type=rule_type,
            match_criteria=criteria,
            description=description.strip() if description else description,
        )
        db.add(rule)
        new_rules.append(rule)

    await db.flush()
    for rule in new_rules:
        await db.refresh(rule)

    return new_rules


async def get_accepted_rules(
    db: AsyncSession,
    source: str | None = None,
) -> list[AlertRule]:
    """Get all ACCEPTED rules, optionally filtered by source."""
    stmt = select(AlertRule).where(AlertRule.rule_type == RuleType.ACCEPTED).order_by(AlertRule.id)
    if source is not None:
        stmt = stmt.where(AlertRule.source == source)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_blocklist_rules(
    db: AsyncSession,
    source: str | None = None,
) -> list[AlertRule]:
    """Get all CRITICAL rules, optionally filtered by source."""
    stmt = select(AlertRule).where(AlertRule.rule_type == RuleType.CRITICAL).order_by(AlertRule.id)
    if source is not None:
        stmt = stmt.where(AlertRule.source == source)
    result = await db.execute(stmt)
    return list(result.scalars().all())
