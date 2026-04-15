"""Per-finding severity override rule endpoints."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import DbSession, OperatorUser
from app.models.severity_rule import SeverityRule
from app.schemas.severity_rule import (
    SeverityRuleCreate,
    SeverityRuleListResponse,
    SeverityRuleResponse,
    SeverityRuleUpdate,
)
from app.services import severity_rules as service

router = APIRouter(prefix="/api/severity-rules", tags=["severity-rules"])


def _shape(rule: SeverityRule) -> SeverityRuleResponse:
    network_name: str | None = None
    network = getattr(rule, "network", None)
    if network is not None:
        network_name = getattr(network, "name", None)
    created_by_username: str | None = None
    creator = getattr(rule, "created_by", None)
    if creator is not None:
        created_by_username = getattr(creator, "email", None) or getattr(
            creator, "name", None
        )
    base = SeverityRuleResponse.model_validate(rule)
    return base.model_copy(
        update={
            "network_name": network_name,
            "created_by_username": created_by_username,
        }
    )


@router.get("", response_model=SeverityRuleListResponse)
async def list_rules(
    user: OperatorUser,
    db: DbSession,
    network_id: int | None = Query(None),
    oid: str | None = Query(None),
) -> SeverityRuleListResponse:
    rules = await service.list_rules(db, network_id=network_id, oid=oid)
    return SeverityRuleListResponse(rules=[_shape(r) for r in rules])


@router.post(
    "",
    response_model=SeverityRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_rule(
    payload: SeverityRuleCreate,
    user: OperatorUser,
    db: DbSession,
) -> SeverityRuleResponse:
    rule = await service.upsert_rule(
        db,
        oid=payload.oid,
        network_id=payload.network_id,
        severity_override=payload.severity_override,
        reason=payload.reason,
        created_by_user_id=user.id,
    )
    await db.commit()
    await db.refresh(rule)
    return _shape(rule)


@router.patch("/{rule_id}", response_model=SeverityRuleResponse)
async def update_rule(
    rule_id: int,
    payload: SeverityRuleUpdate,
    user: OperatorUser,
    db: DbSession,
) -> SeverityRuleResponse:
    rule = await service.get_rule(db, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await service.update_rule(
        db,
        rule,
        severity_override=payload.severity_override,
        reason=payload.reason,
    )
    await db.commit()
    await db.refresh(rule)
    return _shape(rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: int,
    user: OperatorUser,
    db: DbSession,
) -> None:
    rule = await service.get_rule(db, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await service.delete_rule(db, rule)
    await db.commit()
