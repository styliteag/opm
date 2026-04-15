"""Alert schemas for list and dismiss endpoints."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from app.models.alert import AlertType
from app.schemas.host import PortRuleMatch


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
    source: str = "port"
    source_key: str | None = None
    network_id: int | None
    network_name: str | None
    global_open_port_id: int | None = None
    ip: str
    port: int | None
    message: str
    dismissed: bool
    assigned_to_user_id: int | None = None
    assigned_to_email: str | None = None
    created_at: datetime
    dismiss_reason: str | None = None
    severity: Severity = Severity.MEDIUM  # Computed field
    severity_override: Severity | None = None
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
    related_ssh_alerts_dismissed: bool = True
    # Port rule context
    matching_rules: list[PortRuleMatch] = []


class AlertListResponse(BaseModel):
    """Response schema for list of alerts."""

    alerts: list[AlertResponse]
    total: int = 0
    severity_counts: dict[str, int] = {}


class AlertBulkDismissResponse(BaseModel):
    """Response schema for bulk dismiss results."""

    dismissed_ids: list[int]
    missing_ids: list[int]


class AlertBulkAcceptRequest(BaseModel):
    """Request schema for bulk accept operations."""

    alert_ids: list[int]
    reason: str


class AlertBulkAcceptResponse(BaseModel):
    """Response schema for bulk accept results."""

    accepted_count: int
    dismissed_ids: list[int]
    missing_ids: list[int]
    errors: list[str] = []


class AlertAssignRequest(BaseModel):
    """Request schema for assigning an alert to a user."""

    user_id: int | None = None  # None to unassign


class DismissRequest(BaseModel):
    """Request schema for dismissing an alert with optional reason."""

    reason: str | None = None
    include_ssh_findings: bool = False


class BulkDismissRequest(BaseModel):
    """Request schema for bulk dismissing alerts with optional reason."""

    alert_ids: list[int]
    reason: str | None = None


class BulkDeleteRequest(BaseModel):
    """Request schema for bulk deleting alerts."""

    alert_ids: list[int]


class BulkDeleteResponse(BaseModel):
    """Response schema for bulk delete results."""

    deleted_ids: list[int]
    missing_ids: list[int]


class AlertSeverityRequest(BaseModel):
    """Request schema for updating alert severity override."""

    severity: Severity | None  # None to reset to computed default


class DismissSuggestion(BaseModel):
    """A previously used dismiss reason with usage metadata."""

    reason: str
    frequency: int
    last_used: str | None
    same_port: bool
    model_config = {"from_attributes": True}


class DismissSuggestionsResponse(BaseModel):
    """Response schema for dismiss reason suggestions."""

    suggestions: list[DismissSuggestion]
