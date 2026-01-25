"""Schemas for open port query endpoints."""

from datetime import datetime

from pydantic import BaseModel, field_validator

from app.schemas.port_rule import validate_ip_address, validate_port_or_range


class OpenPortListItem(BaseModel):
    """Open port information for list responses."""

    ip: str
    port: int
    protocol: str
    ttl: int | None
    banner: str | None
    service_guess: str | None
    mac_address: str | None
    mac_vendor: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    network_id: int


class OpenPortListResponse(BaseModel):
    """Response schema for list of open ports."""

    ports: list[OpenPortListItem]


class PortWhitelistRequest(BaseModel):
    """Request schema for whitelisting a port."""

    network_id: int
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
