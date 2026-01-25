"""Schemas for unified policy (port rule) endpoints."""

from datetime import datetime
from pydantic import BaseModel, field_validator

from app.models.global_port_rule import GlobalRuleType
from app.schemas.port_rule import validate_ip_address, validate_port_or_range


class PolicyRuleResponse(BaseModel):
    """Unified response schema for both global and network rules."""

    id: int
    network_id: int | None = None  # None means global
    network_name: str | None = None
    ip: str | None = None
    port: str
    rule_type: GlobalRuleType
    description: str | None = None
    created_at: datetime | None = None
    created_by: int | None = None

    model_config = {"from_attributes": True}


class PolicyListResponse(BaseModel):
    """Response schema for list of policy rules."""

    rules: list[PolicyRuleResponse]


class PolicyCreateRequest(BaseModel):
    """Request schema for creating a policy rule (global or network)."""

    network_id: int | None = None  # None means global
    ip: str | None = None
    port: str
    rule_type: GlobalRuleType = GlobalRuleType.ALLOW
    description: str | None = None

    @field_validator("port")
    @classmethod
    def validate_port_format(cls, v: str) -> str:
        return validate_port_or_range(v)

    @field_validator("ip")
    @classmethod
    def validate_ip_format(cls, v: str | None) -> str | None:
        return validate_ip_address(v)


class PolicyUpdateRequest(BaseModel):
    """Request schema for updating an existing policy rule."""

    ip: str | None = None
    port: str | None = None
    rule_type: GlobalRuleType | None = None
    description: str | None = None

    @field_validator("port")
    @classmethod
    def validate_port_format(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return validate_port_or_range(v)

    @field_validator("ip")
    @classmethod
    def validate_ip_format(cls, v: str | None) -> str | None:
        return validate_ip_address(v)
