"""Schemas for host endpoints."""

from datetime import datetime

from pydantic import BaseModel


class HostResponse(BaseModel):
    """Host information response."""

    id: int
    ip: str
    hostname: str | None
    is_pingable: bool | None
    mac_address: str | None
    mac_vendor: str | None
    first_seen_at: datetime
    last_seen_at: datetime
    user_comment: str | None
    seen_by_networks: list[int]
    open_port_count: int | None = None

    model_config = {"from_attributes": True}


class HostListResponse(BaseModel):
    """Response schema for list of hosts."""

    hosts: list[HostResponse]
    total_count: int
    pingable_count: int


class HostUpdateRequest(BaseModel):
    """Request schema for updating a host."""

    user_comment: str | None = None
    hostname: str | None = None


class HostOpenPortResponse(BaseModel):
    """Open port information for a host."""

    id: int
    ip: str
    port: int
    protocol: str
    banner: str | None
    service_guess: str | None
    user_comment: str | None = None
    first_seen_at: datetime
    last_seen_at: datetime

    model_config = {"from_attributes": True}


class PortRuleMatch(BaseModel):
    """A port rule that matches a specific port on a host."""

    id: int
    scope: str  # 'global' | 'network'
    network_id: int | None = None
    network_name: str | None = None
    rule_type: str  # 'accepted' | 'critical'
    description: str | None = None


class EnrichedHostPort(BaseModel):
    """Open port with alert, rule, and SSH context for the host overview."""

    ip: str
    port: int
    protocol: str
    banner: str | None = None
    service_guess: str | None = None
    user_comment: str | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    # Alert enrichment
    alert_id: int | None = None
    alert_status: str | None = None  # 'new' | 'acknowledged'
    alert_severity: str | None = None
    ack_reason: str | None = None
    # Rule enrichment
    rule_status: str | None = None  # 'accepted' | 'critical'
    matching_rules: list[PortRuleMatch] = []
    # SSH enrichment
    ssh_summary: "HostSSHSummary | None" = None


class HostOpenPortListResponse(BaseModel):
    """Response schema for list of open ports for a host."""

    ports: list[HostOpenPortResponse]


class HostDiscoveryScanResponse(BaseModel):
    """Host discovery scan information response."""

    id: int
    network_id: int
    scanner_id: int
    status: str
    trigger_type: str
    started_at: datetime | None
    completed_at: datetime | None
    hosts_discovered: int
    error_message: str | None

    model_config = {"from_attributes": True}


class HostDiscoveryScanListResponse(BaseModel):
    """Response schema for list of host discovery scans."""

    scans: list[HostDiscoveryScanResponse]


class TriggerHostDiscoveryResponse(BaseModel):
    """Response for triggering a host discovery scan."""

    scan_id: int
    message: str


class BulkDeleteHostsRequest(BaseModel):
    """Request for bulk deleting hosts."""

    host_ids: list[int]


class BulkDeleteHostsResponse(BaseModel):
    """Response for bulk delete operation."""

    deleted_ids: list[int]
    deleted_count: int


class HostNetworkInfo(BaseModel):
    """Network info for host overview."""

    id: int
    name: str
    cidr: str


class HostAlertSummary(BaseModel):
    """Alert summary for host overview."""

    id: int
    type: str
    port: int
    message: str
    severity: str
    acknowledged: bool
    resolution_status: str
    created_at: datetime
    ack_reason: str | None = None
    network_id: int | None = None
    network_name: str | None = None
    # SSH context (for alerts on SSH ports)
    ssh_summary: "HostSSHSummary | None" = None
    related_ssh_alert_count: int = 0
    related_ssh_alerts_acknowledged: bool = True


class HostSSHSummary(BaseModel):
    """SSH security summary for host overview."""

    port: int
    ssh_version: str | None
    publickey_enabled: bool
    password_enabled: bool
    keyboard_interactive_enabled: bool
    has_weak_ciphers: bool
    has_weak_kex: bool
    last_scanned: datetime


class HostScanEntry(BaseModel):
    """Recent scan entry for host overview."""

    id: int
    network_id: int
    network_name: str | None
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    trigger_type: str
    port_count: int


class HostOverviewResponse(BaseModel):
    """Aggregated host overview dashboard data."""

    host: HostResponse
    ports: list[EnrichedHostPort]
    networks: list[HostNetworkInfo]
    alerts: list[HostAlertSummary]
    acknowledged_alerts: list[HostAlertSummary]
    acknowledged_alert_count: int
    ssh: HostSSHSummary | None
    recent_scans: list[HostScanEntry]
    matching_rules: list[PortRuleMatch] = []
