"""Alert schemas for list and acknowledge endpoints."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from app.models.alert import AlertType, ResolutionStatus


class Severity(str, Enum):
    """Alert severity levels for risk-based triage."""

    CRITICAL = "critical"  # Blocked port detected
    HIGH = "high"  # New port not in whitelist
    MEDIUM = "medium"  # Port not allowed by policy
    INFO = "info"  # Acknowledged/monitoring


class AlertResponse(BaseModel):
    """Alert response payload."""

    id: int
    type: AlertType
    network_id: int | None
    network_name: str | None
    global_open_port_id: int | None = None
    ip: str
    port: int
    message: str
    acknowledged: bool
    assigned_to_user_id: int | None = None
    assigned_to_email: str | None = None
    resolution_status: ResolutionStatus = ResolutionStatus.OPEN
    created_at: datetime
    severity: Severity = Severity.MEDIUM  # Computed field
    # Host information (if available)
    host_id: int | None = None
    hostname: str | None = None
    user_comment: str | None = None


class AlertListResponse(BaseModel):
    """Response schema for list of alerts."""

    alerts: list[AlertResponse]


class AlertBulkAcknowledgeResponse(BaseModel):
    """Response schema for bulk acknowledge results."""

    acknowledged_ids: list[int]
    missing_ids: list[int]


class AlertBulkWhitelistRequest(BaseModel):
    """Request schema for bulk whitelist operations."""

    alert_ids: list[int]
    reason: str


class AlertBulkWhitelistResponse(BaseModel):
    """Response schema for bulk whitelist results."""

    whitelisted_count: int
    acknowledged_ids: list[int]
    missing_ids: list[int]
    errors: list[str] = []
