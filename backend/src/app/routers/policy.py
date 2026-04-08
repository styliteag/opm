"""Unified alert rule management router for global and network-specific rules."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession, OperatorUser
from app.models.alert_rule import AlertRule
from app.models.alert_rule import RuleType as AlertRuleType
from app.models.global_port_rule import GlobalRuleType
from app.schemas.policy import (
    PortRuleBulkActionRequest,
    PortRuleBulkActionResponse,
    PortRuleUnifiedCreateRequest,
    PortRuleUnifiedListResponse,
    PortRuleUnifiedResponse,
    PortRuleUnifiedUpdateRequest,
)
from app.services import alert_rules as alert_rules_service
from app.services import alerts as alerts_service
from app.services import networks as networks_service

router = APIRouter(prefix="/api/port-rules", tags=["port-rules"])


def _build_response(
    rule: AlertRule,
    network_name: str | None,
    hit_count: int = 0,
) -> PortRuleUnifiedResponse:
    """Build a unified response from an AlertRule model."""
    criteria = rule.match_criteria
    return PortRuleUnifiedResponse(
        id=rule.id,
        network_id=rule.network_id,
        network_name=network_name,
        ip=criteria.get("ip"),
        port=criteria.get("port", ""),
        rule_type=GlobalRuleType(rule.rule_type.value),
        description=rule.description,
        source=rule.source,
        alert_type=criteria.get("alert_type"),
        script_name=criteria.get("script_name"),
        enabled=rule.enabled,
        created_at=rule.created_at,
        created_by=rule.created_by,
        hit_count=hit_count,
    )


@router.get("", response_model=PortRuleUnifiedListResponse)
async def list_port_rules(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None),
) -> PortRuleUnifiedListResponse:
    """List all alert rules (global and optionally filtered by network)."""

    # Collect all AlertRule models first for hit count computation
    all_rule_models: list[AlertRule] = []

    global_rules = await alert_rules_service.get_global_rules(db)
    all_rule_models.extend(global_rules)

    network_rules_list: list[AlertRule] = []
    net_names: dict[int, str] = {}

    if network_id:
        network_rules_list = await alert_rules_service.get_rules_by_network_id(db, network_id)
        network = await networks_service.get_network_by_id(db, network_id)
        net_names[network_id] = network.name if network else f"Network {network_id}"
    else:
        network_rules_list = [
            r for r in await alert_rules_service.get_all_rules(db) if r.network_id is not None
        ]
        net_ids = {r.network_id for r in network_rules_list if r.network_id is not None}
        for nid in net_ids:
            net = await networks_service.get_network_by_id(db, nid)
            if net:
                net_names[nid] = net.name

    all_rule_models.extend(network_rules_list)

    # Compute hit counts for all rules in one pass
    hit_counts = await alert_rules_service.compute_rule_hit_counts(db, all_rule_models)

    # Build responses
    rules = []
    for rule in global_rules:
        rules.append(_build_response(rule, "Global", hit_counts.get(rule.id, 0)))
    for rule in network_rules_list:
        name = (
            net_names.get(rule.network_id, f"Network {rule.network_id}")
            if rule.network_id
            else "Global"
        )
        rules.append(_build_response(rule, name, hit_counts.get(rule.id, 0)))

    # Sort: Global first, then by network name, then by port
    rules.sort(key=lambda x: (x.network_id is not None, x.network_name or "", x.port))

    return PortRuleUnifiedListResponse(rules=rules)


@router.post("", response_model=PortRuleUnifiedResponse, status_code=status.HTTP_201_CREATED)
async def create_port_rule(
    admin: OperatorUser,
    db: DbSession,
    request: PortRuleUnifiedCreateRequest,
) -> PortRuleUnifiedResponse:
    """Create a new alert rule (global if network_id is null, otherwise network-specific)."""

    reason = request.description or "Manual rule"
    source = request.source or "port"

    # Build match_criteria from request
    criteria: dict[str, str | None] = {}
    if request.port:
        criteria["port"] = request.port
    if request.ip:
        criteria["ip"] = request.ip
    if request.alert_type and source in ("ssh", "nse"):
        criteria["alert_type"] = request.alert_type
    if request.script_name and source == "nse":
        criteria["script_name"] = request.script_name

    try:
        rule = await alert_rules_service.create_rule(
            db=db,
            source=source,
            rule_type=AlertRuleType(request.rule_type.value),
            match_criteria=criteria,
            network_id=request.network_id,
            description=reason,
            created_by=admin.id,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Auto-dismiss matching alerts when creating an ACCEPTED rule
    if request.rule_type == GlobalRuleType.ACCEPTED:
        if source == "port" and request.port:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db,
                ip=request.ip,
                port_str=request.port,
                reason=reason,
                network_id=request.network_id,
            )
        elif source == "ssh":
            await alerts_service.auto_dismiss_alerts_for_ssh_rule(
                db,
                ip=request.ip,
                port=int(request.port) if request.port else None,
                alert_type=request.alert_type,
                reason=reason,
                network_id=request.network_id,
            )
        elif source == "nse":
            await alerts_service.auto_dismiss_alerts_for_nse_rule(
                db,
                ip=request.ip,
                port=int(request.port) if request.port else None,
                alert_type=request.alert_type,
                script_name=request.script_name,
                reason=reason,
                network_id=request.network_id,
            )

    await db.commit()

    net_name = "Global"
    if request.network_id:
        net = await networks_service.get_network_by_id(db, request.network_id)
        net_name = net.name if net else f"Network {request.network_id}"

    return _build_response(rule, net_name)


@router.patch("/{scope}/{rule_id}", response_model=PortRuleUnifiedResponse)
async def update_port_rule(
    admin: OperatorUser,
    db: DbSession,
    scope: str,  # 'global' or 'network'
    rule_id: int,
    request: PortRuleUnifiedUpdateRequest,
) -> PortRuleUnifiedResponse:
    """Update an existing alert rule."""

    rule = await alert_rules_service.get_rule_by_id(db, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    # Validate scope matches
    if scope == "global" and rule.network_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule is not a global rule",
        )
    elif scope == "network" and rule.network_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule is not a network rule",
        )
    elif scope not in ("global", "network"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid scope. Use 'global' or 'network'.",
        )

    # Build updated criteria
    new_criteria = dict(rule.match_criteria)
    if request.ip is not None:
        if request.ip.strip():
            new_criteria["ip"] = request.ip.strip()
        else:
            new_criteria.pop("ip", None)
    if request.port is not None:
        new_criteria["port"] = request.port

    new_rule_type = (
        AlertRuleType(request.rule_type.value) if request.rule_type is not None else None
    )

    try:
        updated = await alert_rules_service.update_rule(
            db=db,
            rule=rule,
            match_criteria=new_criteria if new_criteria != rule.match_criteria else None,
            rule_type=new_rule_type,
            description=request.description,
            enabled=request.enabled,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Auto-dismiss matching alerts if rule is now ACCEPTED
    if updated.rule_type == AlertRuleType.ACCEPTED:
        port_str = updated.match_criteria.get("port")
        ip = updated.match_criteria.get("ip")
        dismiss_reason = updated.description or "Accepted by rule"
        if updated.source == "port" and port_str:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db,
                ip=ip,
                port_str=str(port_str),
                reason=dismiss_reason,
                network_id=updated.network_id,
            )
        elif updated.source == "ssh":
            await alerts_service.auto_dismiss_alerts_for_ssh_rule(
                db,
                ip=ip,
                port=int(port_str) if port_str else None,
                alert_type=updated.match_criteria.get("alert_type"),
                reason=dismiss_reason,
                network_id=updated.network_id,
            )
        elif updated.source == "nse":
            await alerts_service.auto_dismiss_alerts_for_nse_rule(
                db,
                ip=ip,
                port=int(port_str) if port_str else None,
                alert_type=updated.match_criteria.get("alert_type"),
                script_name=updated.match_criteria.get("script_name"),
                reason=dismiss_reason,
                network_id=updated.network_id,
            )

    await db.commit()

    net_name = "Global" if rule.network_id is None else None
    if rule.network_id is not None:
        net = await networks_service.get_network_by_id(db, rule.network_id)
        net_name = net.name if net else f"Network {rule.network_id}"

    return _build_response(updated, net_name)


@router.delete("/{scope}/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_port_rule(
    admin: OperatorUser,
    db: DbSession,
    scope: str,
    rule_id: int,
) -> None:
    """Delete an alert rule."""

    rule = await alert_rules_service.get_rule_by_id(db, rule_id)
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    if scope == "global" and rule.network_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule is not a global rule",
        )
    elif scope == "network" and rule.network_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Rule is not a network rule",
        )
    elif scope not in ("global", "network"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scope.")

    await alert_rules_service.delete_rule(db, rule)
    await db.commit()


@router.post("/bulk-delete", response_model=PortRuleBulkActionResponse)
async def bulk_delete_rules(
    admin: OperatorUser,
    db: DbSession,
    request: PortRuleBulkActionRequest,
) -> PortRuleBulkActionResponse:
    """Delete multiple alert rules at once."""
    deleted = 0
    for rule_id in request.rule_ids:
        rule = await alert_rules_service.get_rule_by_id(db, rule_id)
        if rule:
            await alert_rules_service.delete_rule(db, rule)
            deleted += 1
    await db.commit()
    return PortRuleBulkActionResponse(affected=deleted)


@router.post("/bulk-enable", response_model=PortRuleBulkActionResponse)
async def bulk_enable_rules(
    admin: OperatorUser,
    db: DbSession,
    request: PortRuleBulkActionRequest,
) -> PortRuleBulkActionResponse:
    """Enable multiple alert rules at once."""
    updated = 0
    for rule_id in request.rule_ids:
        rule = await alert_rules_service.get_rule_by_id(db, rule_id)
        if rule and not rule.enabled:
            await alert_rules_service.update_rule(db, rule, enabled=True)
            updated += 1
    await db.commit()
    return PortRuleBulkActionResponse(affected=updated)


@router.post("/bulk-disable", response_model=PortRuleBulkActionResponse)
async def bulk_disable_rules(
    admin: OperatorUser,
    db: DbSession,
    request: PortRuleBulkActionRequest,
) -> PortRuleBulkActionResponse:
    """Disable multiple alert rules at once."""
    updated = 0
    for rule_id in request.rule_ids:
        rule = await alert_rules_service.get_rule_by_id(db, rule_id)
        if rule and rule.enabled:
            await alert_rules_service.update_rule(db, rule, enabled=False)
            updated += 1
    await db.commit()
    return PortRuleBulkActionResponse(affected=updated)
