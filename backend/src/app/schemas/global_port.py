"""Schemas for global open port endpoints."""

from datetime import datetime

from pydantic import BaseModel


class GlobalOpenPortResponse(BaseModel):
    """Global open port information response."""

    id: int
    ip: str
    port: int
    protocol: str
    banner: str | None
    service_guess: str | None
    mac_address: str | None
    mac_vendor: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    seen_by_networks: list[int]

    model_config = {"from_attributes": True}


class GlobalOpenPortListResponse(BaseModel):
    """Response schema for list of global open ports."""

    ports: list[GlobalOpenPortResponse]
