"""Alert event schemas for API responses."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class AlertEventResponse(BaseModel):
    """Response schema for an alert event."""

    id: int
    alert_id: int
    event_type: str
    user_id: int | None
    user_email: str | None = None
    scan_id: int | None
    description: str | None
    extra: dict[str, Any] | None
    occurred_at: datetime

    model_config = {"from_attributes": True}


class AlertEventListResponse(BaseModel):
    """Response schema for list of alert events."""

    events: list[AlertEventResponse]
