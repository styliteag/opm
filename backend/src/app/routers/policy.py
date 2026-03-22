"""Unified alert rule management router for global and network-specific rules."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession, OperatorUser
from app.models.alert_rule import RuleType as AlertRuleType
from app.models.global_port_rule import GlobalRuleType
from app.schemas.policy import (
    PortRuleUnifiedCreateRequest,
    PortRuleUnifiedListResponse,
    PortRuleUnifiedResponse,
    PortRuleUnifiedUpdateRequest,
)
from app.services import alert_rules as alert_rules_service
from app.services import alerts as alerts_service
from app.services import networks as networks_service

router = APIRouter(prefix="/api/port-rules", tags=["port-rules"])


@router.get("", response_model=PortRuleUnifiedListResponse)
async def list_port_rules(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None),
) -> PortRuleUnifiedListResponse:
    """List all alert rules (global and optionally filtered by network)."""

    rules = []

    # Fetch global rules (port source for backward compat, but also include ssh)
    global_rules = await alert_rules_service.get_global_rules(db)
    for rule in global_rules:
        criteria = rule.match_criteria
        rules.append(
            PortRuleUnifiedResponse(
                id=rule.id,
                network_id=None,
                network_name="Global",
                ip=criteria.get("ip"),
                port=criteria.get("port", ""),
                rule_type=GlobalRuleType(rule.rule_type.value),
                description=rule.description,
                source=rule.source,
                created_at=rule.created_at,
                created_by=rule.created_by,
            )
        )

    # Fetch network rules
    if network_id:
        network_rules = await alert_rules_service.get_rules_by_network_id(db, network_id)
        network = await networks_service.get_network_by_id(db, network_id)
        network_name = network.name if network else f"Network {network_id}"
        for rule in network_rules:
            criteria = rule.match_criteria
            rules.append(
                PortRuleUnifiedResponse(
                    id=rule.id,
                    network_id=rule.network_id,
                    network_name=network_name,
                    ip=criteria.get("ip"),
                    port=criteria.get("port", ""),
                    rule_type=GlobalRuleType(rule.rule_type.value),
                    description=rule.description,
                    source=rule.source,
                )
            )
    else:
        # Fetch all network rules
        all_network_rules = await alert_rules_service.get_all_rules(db)
        # Collect unique network IDs for name lookup
        net_ids = {r.network_id for r in all_network_rules if r.network_id is not None}
        net_names: dict[int, str] = {}
        for nid in net_ids:
            net = await networks_service.get_network_by_id(db, nid)
            if net:
                net_names[nid] = net.name
        for rule in all_network_rules:
            if rule.network_id is None:
                continue  # Skip globals, already added above
            criteria = rule.match_criteria
            rules.append(
                PortRuleUnifiedResponse(
                    id=rule.id,
                    network_id=rule.network_id,
                    network_name=net_names.get(rule.network_id, f"Network {rule.network_id}"),
                    ip=criteria.get("ip"),
                    port=criteria.get("port", ""),
                    rule_type=GlobalRuleType(rule.rule_type.value),
                    description=rule.description,
                    source=rule.source,
                )
            )

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
                alert_type=None,
                reason=reason,
                network_id=request.network_id,
            )

    await db.commit()

    net_name = "Global"
    if request.network_id:
        net = await networks_service.get_network_by_id(db, request.network_id)
        net_name = net.name if net else f"Network {request.network_id}"

    return PortRuleUnifiedResponse(
        id=rule.id,
        network_id=rule.network_id,
        network_name=net_name,
        ip=criteria.get("ip"),
        port=criteria.get("port", ""),
        rule_type=GlobalRuleType(rule.rule_type.value),
        description=rule.description,
        source=rule.source,
        created_at=rule.created_at,
        created_by=rule.created_by,
    )


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )

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
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Auto-dismiss matching alerts if rule is now ACCEPTED
    if updated.rule_type == AlertRuleType.ACCEPTED:
        port_str = updated.match_criteria.get("port")
        ip = updated.match_criteria.get("ip")
        if updated.source == "port" and port_str:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db,
                ip=ip,
                port_str=str(port_str),
                reason=updated.description or "Accepted by rule",
                network_id=updated.network_id,
            )
        elif updated.source == "ssh":
            await alerts_service.auto_dismiss_alerts_for_ssh_rule(
                db,
                ip=ip,
                port=int(port_str) if port_str else None,
                alert_type=updated.match_criteria.get("alert_type"),
                reason=updated.description or "Accepted by rule",
                network_id=updated.network_id,
            )

    await db.commit()

    net_name = "Global" if rule.network_id is None else None
    if rule.network_id is not None:
        net = await networks_service.get_network_by_id(db, rule.network_id)
        net_name = net.name if net else f"Network {rule.network_id}"

    criteria = updated.match_criteria
    return PortRuleUnifiedResponse(
        id=updated.id,
        network_id=updated.network_id,
        network_name=net_name,
        ip=criteria.get("ip"),
        port=criteria.get("port", ""),
        rule_type=GlobalRuleType(updated.rule_type.value),
        description=updated.description,
        source=updated.source,
        created_at=updated.created_at,
        created_by=updated.created_by,
    )


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
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found"
        )

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
