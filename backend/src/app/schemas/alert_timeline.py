"""Alert timeline schemas for scan-anchored grouping."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class TimelineEvent(BaseModel):
    """A single event in a scan group."""

    id: int
    event_type: str
    user_id: int | None
    user_email: str | None = None
    scan_id: int | None
    description: str | None
    extra: dict[str, Any] | None
    occurred_at: datetime

    model_config = {"from_attributes": True}


class ScanGroup(BaseModel):
    """A group of events anchored to a specific scan."""

    scan_id: int | None
    started_at: datetime | None
    completed_at: datetime | None
    status: str | None
    port_seen: bool
    events: list[TimelineEvent]


class AlertTimelineResponse(BaseModel):
    """Response schema for the alert timeline endpoint."""

    alert_id: int
    scan_groups: list[ScanGroup]
