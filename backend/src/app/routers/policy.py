"""Unified port rule management router for global and network-specific port rules."""

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.models.global_port_rule import GlobalRuleType
from app.models.network import Network
from app.models.port_rule import PortRule, RuleType
from app.schemas.policy import (
    PortRuleUnifiedCreateRequest,
    PortRuleUnifiedListResponse,
    PortRuleUnifiedResponse,
    PortRuleUnifiedUpdateRequest,
)
from app.services import alerts as alerts_service
from app.services import global_port_rules as global_rules_service
from app.services import networks as networks_service
from app.services import port_rules as network_rules_service

router = APIRouter(prefix="/api/port-rules", tags=["port-rules"])


@router.get("", response_model=PortRuleUnifiedListResponse)
async def list_port_rules(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None),
) -> PortRuleUnifiedListResponse:
    """List all port rules (global and optionally filtered by network)."""

    rules = []

    # Fetch global rules
    global_rules = await global_rules_service.get_all_global_rules(db)
    for g_rule in global_rules:
        rules.append(
            PortRuleUnifiedResponse(
                id=g_rule.id,
                network_id=None,
                network_name="Global",
                ip=g_rule.ip,
                port=g_rule.port,
                rule_type=GlobalRuleType(g_rule.rule_type.value),
                description=g_rule.description,
                created_at=g_rule.created_at,
                created_by=g_rule.created_by,
            )
        )

    # Fetch network rules
    if network_id:
        network_rules = await network_rules_service.get_rules_by_network_id(db, network_id)
        network = await networks_service.get_network_by_id(db, network_id)
        network_name = network.name if network else f"Network {network_id}"
        for n_rule in network_rules:
            rules.append(
                PortRuleUnifiedResponse(
                    id=n_rule.id,
                    network_id=n_rule.network_id,
                    network_name=network_name,
                    ip=n_rule.ip,
                    port=n_rule.port,
                    rule_type=GlobalRuleType(n_rule.rule_type.value),
                    description=n_rule.description,
                )
            )
    else:
        # Fetch all network rules if no network_id filter
        stmt = select(PortRule).options(joinedload(PortRule.network))
        result = await db.execute(stmt)
        all_network_rules = list(result.scalars().all())
        for n_rule in all_network_rules:
            rules.append(
                PortRuleUnifiedResponse(
                    id=n_rule.id,
                    network_id=n_rule.network_id,
                    network_name=n_rule.network.name,
                    ip=n_rule.ip,
                    port=n_rule.port,
                    rule_type=GlobalRuleType(n_rule.rule_type.value),
                    description=n_rule.description,
                )
            )

    # Sort: Global first, then by network name, then by port
    rules.sort(key=lambda x: (x.network_id is not None, x.network_name or "", x.port))

    return PortRuleUnifiedListResponse(rules=rules)


@router.post("", response_model=PortRuleUnifiedResponse, status_code=status.HTTP_201_CREATED)
async def create_port_rule(
    admin: AdminUser,
    db: DbSession,
    request: PortRuleUnifiedCreateRequest,
) -> PortRuleUnifiedResponse:
    """Create a new port rule (global if network_id is null, otherwise network-specific)."""

    reason = request.description or "Manual rule"

    if request.network_id is None:
        # Create global rule
        try:
            g_rule = await global_rules_service.create_global_rule(
                db=db,
                port=request.port,
                rule_type=request.rule_type,
                ip=request.ip,
                description=reason,
                created_by=admin.id,
            )
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

        # Auto-dismiss matching alerts when creating an ACCEPTED rule
        if request.rule_type == GlobalRuleType.ACCEPTED:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db, ip=request.ip, port_str=request.port, reason=reason,
            )

        await db.commit()
        return PortRuleUnifiedResponse(
            id=g_rule.id,
            network_id=None,
            network_name="Global",
            ip=g_rule.ip,
            port=g_rule.port,
            rule_type=GlobalRuleType(g_rule.rule_type.value),
            description=g_rule.description,
            created_at=g_rule.created_at,
            created_by=g_rule.created_by,
        )
    else:
        # Create network rule
        network = await networks_service.get_network_by_id(db, request.network_id)
        if not network:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Network not found")

        n_rule = await network_rules_service.create_rule(
            db=db,
            network_id=request.network_id,
            port=request.port,
            rule_type=RuleType(request.rule_type.value),
            ip=request.ip,
            description=request.description,
        )

        # Auto-dismiss matching alerts when creating an ACCEPTED rule
        if request.rule_type == GlobalRuleType.ACCEPTED:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db,
                ip=request.ip,
                port_str=request.port,
                reason=request.description or "Accepted by network rule",
                network_id=request.network_id,
            )

        await db.commit()
        return PortRuleUnifiedResponse(
            id=n_rule.id,
            network_id=n_rule.network_id,
            network_name=network.name,
            ip=n_rule.ip,
            port=n_rule.port,
            rule_type=GlobalRuleType(n_rule.rule_type.value),
            description=n_rule.description,
        )


@router.patch("/{scope}/{rule_id}", response_model=PortRuleUnifiedResponse)
async def update_port_rule(
    admin: AdminUser,
    db: DbSession,
    scope: str,  # 'global' or 'network'
    rule_id: int,
    request: PortRuleUnifiedUpdateRequest,
) -> PortRuleUnifiedResponse:
    """Update an existing port rule."""

    if scope == "global":
        g_rule = await global_rules_service.get_global_rule_by_id(db, rule_id)
        if not g_rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global rule not found"
            )

        updated = await global_rules_service.update_global_rule(
            db=db,
            rule=g_rule,
            ip=request.ip,
            port=request.port,
            rule_type=request.rule_type,
            description=request.description,
        )

        # Auto-dismiss matching alerts if rule is now ACCEPTED
        if updated.rule_type == GlobalRuleType.ACCEPTED:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db,
                ip=updated.ip,
                port_str=updated.port,
                reason=updated.description or "Accepted by global rule",
            )

        await db.commit()
        return PortRuleUnifiedResponse(
            id=updated.id,
            network_id=None,
            network_name="Global",
            ip=updated.ip,
            port=updated.port,
            rule_type=GlobalRuleType(updated.rule_type.value),
            description=updated.description,
            created_at=updated.created_at,
            created_by=updated.created_by,
        )
    elif scope == "network":
        n_rule = await network_rules_service.get_rule_by_id(db, rule_id)
        if not n_rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Network rule not found"
            )

        if request.ip is not None:
            n_rule.ip = request.ip if request.ip.strip() else None
        if request.port is not None:
            n_rule.port = request.port
        if request.rule_type is not None:
            n_rule.rule_type = RuleType(request.rule_type.value)
        if request.description is not None:
            n_rule.description = request.description

        await db.flush()
        await db.refresh(n_rule)

        # Auto-dismiss matching alerts if rule is now ACCEPTED
        if n_rule.rule_type == RuleType.ACCEPTED:
            await alerts_service.auto_dismiss_alerts_for_accepted_rule(
                db,
                ip=n_rule.ip,
                port_str=n_rule.port,
                reason=n_rule.description or "Accepted by network rule",
                network_id=n_rule.network_id,
            )

        # Need to load network name
        stmt = select(Network).where(Network.id == n_rule.network_id)
        result = await db.execute(stmt)
        network = result.scalar_one_or_none()

        await db.commit()
        return PortRuleUnifiedResponse(
            id=n_rule.id,
            network_id=n_rule.network_id,
            network_name=network.name if network else f"Network {n_rule.network_id}",
            ip=n_rule.ip,
            port=n_rule.port,
            rule_type=GlobalRuleType(n_rule.rule_type.value),
            description=n_rule.description,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid scope. Use 'global' or 'network'.",
        )


@router.delete("/{scope}/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_port_rule(
    admin: AdminUser,
    db: DbSession,
    scope: str,
    rule_id: int,
) -> None:
    """Delete a port rule."""

    if scope == "global":
        g_rule = await global_rules_service.get_global_rule_by_id(db, rule_id)
        if not g_rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global rule not found"
            )
        await global_rules_service.delete_global_rule(db, g_rule)
    elif scope == "network":
        n_rule = await network_rules_service.get_rule_by_id(db, rule_id)
        if not n_rule:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Network rule not found"
            )
        await network_rules_service.delete_rule(db, n_rule)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid scope.")

    await db.commit()
