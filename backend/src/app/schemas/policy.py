"""Schemas for unified port rule endpoints."""

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.models.global_port_rule import GlobalRuleType
from app.schemas.port_rule import validate_ip_address, validate_port_or_range


class PortRuleUnifiedResponse(BaseModel):
    """Unified response schema for both global and network rules."""

    id: int
    network_id: int | None = None  # None means global
    network_name: str | None = None
    ip: str | None = None
    port: str = ""
    rule_type: GlobalRuleType
    description: str | None = None
    source: str = "port"
    alert_type: str | None = None  # For ssh/nse rules
    script_name: str | None = None  # For nse rules
    enabled: bool = True
    created_at: datetime | None = None
    created_by: int | None = None

    model_config = {"from_attributes": True}


class PortRuleUnifiedListResponse(BaseModel):
    """Response schema for list of port rules."""

    rules: list[PortRuleUnifiedResponse]


class PortRuleUnifiedCreateRequest(BaseModel):
    """Request schema for creating an alert rule (global or network)."""

    network_id: int | None = None  # None means global
    ip: str | None = None
    port: str = ""
    rule_type: GlobalRuleType = GlobalRuleType.ACCEPTED
    description: str | None = None
    source: str = "port"
    alert_type: str | None = None  # For ssh/nse rules: specific alert type
    script_name: str | None = None  # For nse rules: specific NSE script name

    @field_validator("port")
    @classmethod
    def validate_port_format(cls, v: str) -> str:
        return validate_port_or_range(v)

    @field_validator("ip")
    @classmethod
    def validate_ip_format(cls, v: str | None) -> str | None:
        return validate_ip_address(v)


class PortRuleUnifiedUpdateRequest(BaseModel):
    """Request schema for updating an existing port rule."""

    ip: str | None = None
    port: str | None = None
    rule_type: GlobalRuleType | None = None
    description: str | None = None
    enabled: bool | None = None

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


class PortRuleBulkActionRequest(BaseModel):
    """Request schema for bulk operations on port rules."""

    rule_ids: list[int]


class PortRuleBulkActionResponse(BaseModel):
    """Response schema for bulk operations on port rules."""

    affected: int
