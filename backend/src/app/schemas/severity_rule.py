"""Pydantic schemas for per-finding severity override rules."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

SeverityLabel = Literal["info", "low", "medium", "high", "critical"]


class SeverityRuleCreate(BaseModel):
    """Payload to create or upsert a severity rule."""

    oid: str
    network_id: int | None = None  # null = global
    severity_override: SeverityLabel
    reason: str | None = None


class SeverityRuleUpdate(BaseModel):
    """Payload to edit an existing rule."""

    severity_override: SeverityLabel | None = None
    reason: str | None = None


class SeverityRuleResponse(BaseModel):
    """Full rule as returned by the API."""

    id: int
    oid: str
    network_id: int | None
    network_name: str | None = None
    severity_override: str
    reason: str | None
    created_by_user_id: int | None
    created_by_username: str | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class SeverityRuleListResponse(BaseModel):
    rules: list[SeverityRuleResponse]
