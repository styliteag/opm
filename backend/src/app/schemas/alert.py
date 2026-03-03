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


class AlertSSHSummary(BaseModel):
    """Lightweight SSH security summary attached to alerts on SSH ports."""

    ssh_version: str | None
    publickey_enabled: bool
    password_enabled: bool
    keyboard_interactive_enabled: bool
    has_weak_ciphers: bool
    has_weak_kex: bool
    last_scanned: datetime


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
    # Latest comment (if any)
    last_comment: str | None = None
    last_comment_by: str | None = None
    last_comment_at: datetime | None = None
    # SSH context (for alerts on ports with SSH scan data)
    ssh_summary: AlertSSHSummary | None = None
    related_ssh_alert_count: int = 0
    related_ssh_alerts_acknowledged: bool = True


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
    include_ssh_findings: bool = False


class BulkAcknowledgeRequest(BaseModel):
    """Request schema for bulk acknowledging alerts with optional reason."""

    alert_ids: list[int]
    reason: str | None = None


class AlertStatusRequest(BaseModel):
    """Request schema for updating alert resolution status."""

    resolution_status: ResolutionStatus
