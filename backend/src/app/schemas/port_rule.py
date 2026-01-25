"""Port rule management schemas for CRUD operations."""

import ipaddress

from pydantic import BaseModel, field_validator

from app.models.port_rule import RuleType


def validate_port_or_range(value: str) -> str:
    """Validate port or port range format (e.g., '80' or '80-443').

    Supports:
    - Single ports: 80, 443
    - Port ranges: 80-443
    """
    if not value or value.strip() == "" or value.strip() == "*" or value.strip().upper() == "ALL":
        return "*"

    cleaned = value.strip()
    # Check for range
    if "-" in cleaned:
        parts = cleaned.split("-")
        if len(parts) != 2:
            raise ValueError(f"Invalid port range format: {cleaned}")
        try:
            start = int(parts[0])
            end = int(parts[1])
            if not (1 <= start <= 65535 and 1 <= end <= 65535):
                raise ValueError(f"Port out of range (1-65535): {cleaned}")
            if start > end:
                raise ValueError(f"Invalid port range (start > end): {cleaned}")
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError(f"Invalid port number in range: {cleaned}") from e
            raise
    else:
        # Single port
        try:
            port = int(cleaned)
            if not (1 <= port <= 65535):
                raise ValueError(f"Port out of range (1-65535): {cleaned}")
        except ValueError as e:
            if "invalid literal" in str(e):
                raise ValueError(f"Invalid port number: {cleaned}") from e
            raise

    return cleaned


def validate_ip_address(value: str | None) -> str | None:
    """Validate IP address format if provided."""
    if value is None or value == "":
        return None
    try:
        ipaddress.ip_address(value)
    except ValueError as e:
        raise ValueError(f"Invalid IP address: {value}") from e
    return value


class PortRuleCreateRequest(BaseModel):
    """Request schema for creating a new port rule."""

    ip: str | None = None
    port: str  # Can be single port or range (e.g., "80" or "80-443")
    rule_type: RuleType
    description: str | None = None

    @field_validator("port")
    @classmethod
    def validate_port_format(cls, v: str) -> str:
        return validate_port_or_range(v)

    @field_validator("ip")
    @classmethod
    def validate_ip_format(cls, v: str | None) -> str | None:
        return validate_ip_address(v)


class PortRuleBulkRequest(BaseModel):
    """Request schema for bulk import/update of port rules."""

    rules: list[PortRuleCreateRequest]


class PortRuleResponse(BaseModel):
    """Port rule information response."""

    id: int
    network_id: int
    ip: str | None
    port: str
    rule_type: RuleType
    description: str | None

    model_config = {"from_attributes": True}


class PortRuleListResponse(BaseModel):
    """Response schema for list of port rules."""

    rules: list[PortRuleResponse]
