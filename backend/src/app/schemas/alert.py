"""Alert schemas for list and acknowledge endpoints."""

from datetime import datetime

from pydantic import BaseModel

from app.models.alert import AlertType


class AlertResponse(BaseModel):
    """Alert response payload."""

    id: int
    type: AlertType
    network_id: int
    network_name: str
    ip: str
    port: int
    message: str
    acknowledged: bool
    created_at: datetime


class AlertListResponse(BaseModel):
    """Response schema for list of alerts."""

    alerts: list[AlertResponse]


class AlertBulkAcknowledgeResponse(BaseModel):
    """Response schema for bulk acknowledge results."""

    acknowledged_ids: list[int]
    missing_ids: list[int]
