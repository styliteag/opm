"""Schemas for global open port endpoints."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel

# Ports page triage status (UI v4), see services/port_status.py
PortStatus = Literal["new", "review", "expected", "snoozed", "critical"]


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
    user_comment: str | None = None
    is_stale: bool = False
    host_id: int | None = None
    # Triage enrichment — populated by the list endpoint only
    hostname: str | None = None
    status: PortStatus | None = None
    why: str | None = None
    alert_id: int | None = None

    model_config = {"from_attributes": True}


class GlobalOpenPortListResponse(BaseModel):
    """Response schema for list of global open ports."""

    ports: list[GlobalOpenPortResponse]
    # Rows matching every filter, before offset/limit
    total: int = 0


class PortCommentUpdateRequest(BaseModel):
    """Request schema for updating a port comment."""

    user_comment: str | None = None
