"""Schemas for global port rule endpoints."""

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.global_port_rule import GlobalRuleType
from app.schemas.port_rule import validate_ip_address, validate_port_or_range


class GlobalPortRuleCreateRequest(BaseModel):
    """Request schema for creating a global port rule."""

    ip: str | None = None
    port: str  # Can be single port or range (e.g., "80" or "80-443")
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


class GlobalPortRuleResponse(BaseModel):
    """Global port rule information response."""

    id: int
    ip: str | None
    port: str
    rule_type: GlobalRuleType
    description: str | None
    created_by: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class GlobalPortRuleListResponse(BaseModel):
    """Response schema for list of global port rules."""

    rules: list[GlobalPortRuleResponse]


class GlobalWhitelistRequest(BaseModel):
    """Request schema for quickly whitelisting a port globally."""

    ip: str | None = None
    port: str
    description: str | None = None

    @field_validator("port")
    @classmethod
    def validate_port_format(cls, v: str) -> str:
        return validate_port_or_range(v)

    @field_validator("ip")
    @classmethod
    def validate_ip_format(cls, v: str | None) -> str | None:
        return validate_ip_address(v)


class GlobalPortRuleUpdateRequest(BaseModel):
    """Request schema for updating a global port rule."""

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

