"""Scan management schemas for triggering and viewing scans."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SSHScanResultSummary(BaseModel):
    """SSH scan result summary for inclusion in scan detail response."""

    id: int
    host_ip: str
    port: int
    timestamp: datetime
    publickey_enabled: bool
    password_enabled: bool
    keyboard_interactive_enabled: bool
    ssh_version: str | None
    protocol_version: str | None
    server_banner: str | None
    supported_ciphers: list[dict[str, Any]] | None = None
    kex_algorithms: list[dict[str, Any]] | None = None
    host_key_types: list[str] | None = None
    mac_algorithms: list[dict[str, Any]] | None = None

    model_config = {"from_attributes": True}


class OpenPortResponse(BaseModel):
    """Open port information for scan detail/diff responses."""

    ip: str
    port: int
    protocol: str
    ttl: int | None
    banner: str | None
    service_guess: str | None
    mac_address: str | None
    mac_vendor: str | None
    first_seen_at: datetime
    last_seen_at: datetime

    model_config = {"from_attributes": True}


class ScanTriggerResponse(BaseModel):
    """Response when triggering a manual scan."""

    scan_id: int
    network_id: int
    status: str = "planned"
    trigger_type: str = "manual"
    message: str = "Scan triggered successfully"


class ScanCancelResponse(BaseModel):
    """Response when cancelling a scan."""

    scan_id: int
    status: str = "cancelled"
    cancelled_at: datetime
    cancelled_by: int
    message: str = "Scan cancelled successfully"


class ScanResponse(BaseModel):
    """Scan information response."""

    id: int
    network_id: int
    scanner_id: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancelled_by: int | None
    cancelled_by_email: str | None = None
    error_message: str | None
    trigger_type: str
    hidden: bool = False
    progress_percent: float | None = None
    progress_message: str | None = None

    model_config = {"from_attributes": True}


class ScanSummaryResponse(ScanResponse):
    """Scan summary with port count."""

    port_count: int


class ScanDetailResponse(ScanResponse):
    """Scan detail with open ports."""

    open_ports: list[OpenPortResponse]
    ssh_scan_results: list[SSHScanResultSummary] = []


class ScanListResponse(BaseModel):
    """Response schema for list of scans."""

    scans: list[ScanSummaryResponse]


class ScanDiffResponse(BaseModel):
    """Diff response between two scans."""

    scan_id: int
    compare_to_id: int
    added_ports: list[OpenPortResponse]
    removed_ports: list[OpenPortResponse]
    unchanged_ports: list[OpenPortResponse]


class ScanLogResponse(BaseModel):
    """Scan log entry for log list responses."""

    timestamp: datetime
    level: str
    message: str

    model_config = {"from_attributes": True}


class ScanLogListResponse(BaseModel):
    """Response schema for list of scan logs."""

    logs: list[ScanLogResponse]


class ScanWithNamesResponse(BaseModel):
    """Scan summary with network name and site name."""

    id: int
    network_id: int
    network_name: str
    scanner_id: int
    scanner_name: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancelled_by: int | None
    cancelled_by_email: str | None = None
    error_message: str | None
    trigger_type: str
    progress_percent: float | None = None
    progress_message: str | None = None
    hidden: bool = False
    port_count: int


class ScanVisibilityRequest(BaseModel):
    """Request body for toggling scan visibility."""

    hidden: bool


class AllScansListResponse(BaseModel):
    """Response schema for list of all scans with names."""

    scans: list[ScanWithNamesResponse]
