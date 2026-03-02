"""Alert schemas for list and acknowledge endpoints."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from app.models.alert import AlertType, ResolutionStatus


class Severity(str, Enum):
    """Alert severity levels for risk-based triage."""

    CRITICAL = "critical"  # Blocked port detected
    HIGH = "high"  # New port not in allow list
    MEDIUM = "medium"  # Port not in allow list
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
    ack_reason: str | None = None
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


class AlertAssignRequest(BaseModel):
    """Request schema for assigning an alert to a user."""

    user_id: int | None = None  # None to unassign


class AcknowledgeRequest(BaseModel):
    """Request schema for acknowledging an alert with optional reason."""

    reason: str | None = None


class BulkAcknowledgeRequest(BaseModel):
    """Request schema for bulk acknowledging alerts with optional reason."""

    alert_ids: list[int]
    reason: str | None = None


class AlertStatusRequest(BaseModel):
    """Request schema for updating alert resolution status."""

    resolution_status: ResolutionStatus
