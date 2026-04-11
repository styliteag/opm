"""Scanner management schemas for CRUD operations and API."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, field_validator

from app.schemas.gvm_library import RequiredLibraryEntry

ScannerKind = Literal["standard", "gvm"]

# --- Admin/CRUD Schemas ---


class ScannerCreateRequest(BaseModel):
    """Request schema for creating a new scanner."""

    name: str
    description: str | None = None
    location: str | None = None
    kind: ScannerKind = "standard"


class ScannerUpdateRequest(BaseModel):
    """Request schema for updating a scanner."""

    name: str | None = None
    description: str | None = None
    location: str | None = None
    kind: ScannerKind | None = None


class ScannerResponse(BaseModel):
    """Scanner information response (without API key)."""

    id: int
    name: str
    description: str | None
    location: str | None
    last_seen_at: datetime | None
    scanner_version: str | None
    kind: ScannerKind
    gvm_refresh_requested: bool
    gvm_synced_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScannerCreateResponse(BaseModel):
    """Response when creating a scanner - includes the API key (shown once)."""

    id: int
    name: str
    description: str | None
    location: str | None
    last_seen_at: datetime | None
    kind: ScannerKind
    created_at: datetime
    api_key: str  # Only shown once at creation

    model_config = {"from_attributes": True}


class ScannerRegenerateKeyResponse(BaseModel):
    """Response when regenerating a scanner's API key."""

    id: int
    name: str
    api_key: str  # New API key (shown once)


class ScannerListResponse(BaseModel):
    """Response schema for list of scanners."""

    scanners: list[ScannerResponse]


class ScannerNetworkInfo(BaseModel):
    """Network summary for scanner overview."""

    id: int
    name: str
    cidr: str
    scan_schedule: str | None


class ScannerScanSummary(BaseModel):
    """Scan summary for scanner overview."""

    id: int
    network_id: int
    network_name: str
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    trigger_type: str
    port_count: int
    duration_seconds: float | None


class ScannerOverviewResponse(BaseModel):
    """Aggregated scanner health and performance overview."""

    scanner: ScannerResponse
    networks: list[ScannerNetworkInfo]
    recent_scans: list[ScannerScanSummary]
    total_scans: int
    completed_scans: int
    failed_scans: int
    avg_scan_duration_seconds: float | None
    scans_last_24h: int
    scans_last_7d: int


# --- Scanner API Schemas ---


class ScannerAuthRequest(BaseModel):
    """Request schema for scanner authentication."""

    scanner_version: str | None = None
    scanner_kind: ScannerKind | None = None


class ScannerAuthResponse(BaseModel):
    """Response for scanner authentication."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds until expiration
    scanner_id: int
    scanner_name: str


class ScannerJobResponse(BaseModel):
    """A pending scan job for the scanner."""

    network_id: int
    cidr: str
    port_spec: str  # in masscan format
    rate: int | None = None
    scanner_type: str = "masscan"  # masscan, nmap, or nse
    scan_timeout: int = 3600  # seconds
    port_timeout: int = 1500  # milliseconds
    scan_protocol: str = "tcp"  # tcp, udp, or both
    is_ipv6: bool = False  # whether the network CIDR is IPv6
    target_ip: str | None = None  # specific IP for single-host scan, None for full network
    # NSE-specific fields (populated when scanner_type == "nse")
    nse_scripts: list[str] | None = None
    nse_script_args: dict[str, Any] | None = None
    custom_script_hashes: dict[str, str] | None = None
    # Multi-phase pipeline config (from network)
    phases: list[dict[str, Any]] | None = None
    # GVM-specific fields (populated when scanner_type == "greenbone")
    gvm_scan_config: str | None = None
    gvm_port_list: str | None = None
    gvm_keep_reports: bool = True
    # SSH probe gate (applies to any scanner_type that produces open_ports)
    ssh_probe_enabled: bool = True
    # Nuclei post-phase config (only meaningful for scanner_type in masscan/nmap)
    nuclei_enabled: bool = False
    nuclei_tags: str | None = None
    nuclei_severity: str | None = None
    nuclei_timeout: int | None = None
    nuclei_sni_enabled: bool = False

    model_config = {"from_attributes": True}


class ScannerJobListResponse(BaseModel):
    """List of pending scan jobs."""

    jobs: list[ScannerJobResponse]
    gvm_refresh: bool = False  # set when the scanner should re-post its metadata snapshot


class ScannerJobClaimResponse(BaseModel):
    """Response when successfully claiming a scan job."""

    scan_id: int
    network_id: int
    message: str = "Job claimed successfully"
    required_library_entries: list[RequiredLibraryEntry] = []


class ScannerHostnamesResponse(BaseModel):
    """Bulk hostname-cache read for the scanner's nuclei SNI fan-out.

    Maps each IP the scanner asked about to its cached vhost list (only
    present for IPs with a fresh, non-failed row that has at least one
    hostname). IPs without cached hostnames are simply omitted — the
    scanner falls back to ``IP:PORT`` for those.
    """

    hostnames: dict[str, list[str]]


class OpenPortData(BaseModel):
    """Open port data from scanner results."""

    ip: str
    port: int
    protocol: str = "tcp"
    ttl: int | None = None
    banner: str | None = None
    service_guess: str | None = None
    mac_address: str | None = None
    mac_vendor: str | None = None


class SSHAlgorithmInfo(BaseModel):
    """Information about a cryptographic algorithm with security classification."""

    name: str
    keysize: int | None = None
    is_weak: bool = False
    notes: list[str] = []


class SSHProbeResultData(BaseModel):
    """SSH probe result data from scanner."""

    host: str
    port: int
    success: bool
    error_message: str | None = None

    # Authentication methods
    publickey_enabled: bool = False
    password_enabled: bool = False
    keyboard_interactive_enabled: bool = False

    # SSH metadata
    ssh_version: str | None = None
    protocol_version: str | None = None
    server_banner: str | None = None

    # Cryptographic algorithms with security classification
    ciphers: list[SSHAlgorithmInfo] = []
    kex_algorithms: list[SSHAlgorithmInfo] = []
    mac_algorithms: list[SSHAlgorithmInfo] = []
    host_key_types: list[str] = []


class ScannerResultRequest(BaseModel):
    """Request to submit scan results."""

    scan_id: int
    status: str  # "success" or "failed"
    open_ports: list[OpenPortData] = []
    ssh_results: list[SSHProbeResultData] = []
    error_message: str | None = None


class ScannerResultResponse(BaseModel):
    """Response after submitting scan results."""

    scan_id: int
    status: str
    ports_recorded: int
    message: str = "Results submitted successfully"


class ScannerLogEntry(BaseModel):
    """A single log entry from the scanner."""

    timestamp: datetime
    level: str  # info, warning, error
    message: str

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        """Validate log level is one of the allowed values."""
        valid_levels = {"info", "warning", "error"}
        if v.lower() not in valid_levels:
            raise ValueError(f"Level must be one of: {', '.join(valid_levels)}")
        return v.lower()


class ScannerLogsRequest(BaseModel):
    """Request to submit scan logs."""

    scan_id: int
    logs: list[ScannerLogEntry]


class ScannerLogsResponse(BaseModel):
    """Response after submitting scan logs."""

    scan_id: int
    logs_recorded: int
    message: str = "Logs submitted successfully"


class ScannerProgressRequest(BaseModel):
    """Request to update scan progress."""

    scan_id: int
    progress_percent: float  # 0-100
    progress_message: str | None = None
    actual_rate: float | None = None  # actual packets per second

    @field_validator("progress_percent")
    @classmethod
    def validate_progress_percent(cls, v: float) -> float:
        """Validate progress percent is within 0-100 range."""
        if v < 0 or v > 100:
            raise ValueError("progress_percent must be between 0 and 100")
        return v


class ScannerProgressResponse(BaseModel):
    """Response after updating scan progress."""

    scan_id: int
    progress_percent: float
    message: str = "Progress updated successfully"


class ScannerScanStatusResponse(BaseModel):
    """Response for scan status checks."""

    scan_id: int
    status: str
    message: str = "Status retrieved successfully"


# --- Host Discovery Schemas ---


class HostDiscoveryJobResponse(BaseModel):
    """A pending host discovery job for the scanner."""

    scan_id: int
    network_id: int
    cidr: str
    is_ipv6: bool = False

    model_config = {"from_attributes": True}


class HostDiscoveryJobListResponse(BaseModel):
    """List of pending host discovery jobs."""

    jobs: list[HostDiscoveryJobResponse]


class HostDiscoveryJobClaimResponse(BaseModel):
    """Response when successfully claiming a host discovery job."""

    scan_id: int
    network_id: int
    cidr: str
    is_ipv6: bool
    known_hostnames: dict[str, str] = {}
    ips_with_open_ports: list[str] = []
    message: str = "Host discovery job claimed successfully"


class HostDiscoveryResultData(BaseModel):
    """Host discovery result data from scanner."""

    ip: str
    hostname: str | None = None
    is_pingable: bool = True
    mac_address: str | None = None
    mac_vendor: str | None = None


class HostDiscoveryResultRequest(BaseModel):
    """Request to submit host discovery results."""

    scan_id: int
    status: str  # "success" or "failed"
    hosts: list[HostDiscoveryResultData] = []
    error_message: str | None = None


class HostDiscoveryResultResponse(BaseModel):
    """Response after submitting host discovery results."""

    scan_id: int
    status: str
    hosts_recorded: int
    message: str = "Host discovery results submitted successfully"
