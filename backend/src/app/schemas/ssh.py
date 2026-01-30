"""SSH security scan schemas for API responses."""

from datetime import datetime
from typing import Any

from pydantic import BaseModel


class SSHAlgorithmResponse(BaseModel):
    """Algorithm information with security classification."""

    name: str
    keysize: int | None = None
    is_weak: bool = False
    notes: list[str] = []


class SSHScanResultResponse(BaseModel):
    """SSH scan result for a single host/port."""

    id: int
    scan_id: int
    host_ip: str
    port: int
    timestamp: datetime

    # Authentication methods
    publickey_enabled: bool
    password_enabled: bool
    keyboard_interactive_enabled: bool

    # SSH metadata
    ssh_version: str | None
    protocol_version: str | None
    server_banner: str | None

    # Cryptographic algorithms (raw JSON fields)
    supported_ciphers: list[dict[str, Any]] | None = None
    kex_algorithms: list[dict[str, Any]] | None = None
    host_key_types: list[str] | None = None
    mac_algorithms: list[dict[str, Any]] | None = None

    model_config = {"from_attributes": True}


class SSHScanResultListResponse(BaseModel):
    """List of SSH scan results for a scan."""

    ssh_results: list[SSHScanResultResponse]


class SSHConfigChange(BaseModel):
    """Details about a configuration change between scans."""

    field: str
    description: str
    is_regression: bool  # True if security degraded


class SSHHostSummary(BaseModel):
    """Summary of SSH security status for a host."""

    host_ip: str
    port: int
    ssh_version: str | None
    publickey_enabled: bool
    password_enabled: bool
    keyboard_interactive_enabled: bool
    has_weak_ciphers: bool
    has_weak_kex: bool
    last_scan_id: int
    last_scanned: datetime
    network_id: int | None = None
    network_name: str | None = None
    # Change tracking: "improved", "degraded", "unchanged", or None (no prior scan)
    change_status: str | None = None
    changes: list[SSHConfigChange] = []


class SSHHostListResponse(BaseModel):
    """Paginated list of SSH hosts."""

    hosts: list[SSHHostSummary]
    total: int


class SSHHostHistoryEntry(BaseModel):
    """SSH scan result entry for host history."""

    scan_id: int
    timestamp: datetime
    ssh_version: str | None
    publickey_enabled: bool
    password_enabled: bool
    keyboard_interactive_enabled: bool
    supported_ciphers: list[dict[str, Any]] | None = None
    kex_algorithms: list[dict[str, Any]] | None = None
    host_key_types: list[str] | None = None
    mac_algorithms: list[dict[str, Any]] | None = None
    network_id: int | None = None
    network_name: str | None = None

    model_config = {"from_attributes": True}


class SSHHostHistoryResponse(BaseModel):
    """SSH history for a single host."""

    host_ip: str
    port: int
    history: list[SSHHostHistoryEntry]
    total: int
