"""Scanner management schemas for CRUD operations and API."""

from datetime import datetime

from pydantic import BaseModel, field_validator

# --- Admin/CRUD Schemas ---


class ScannerCreateRequest(BaseModel):
    """Request schema for creating a new scanner."""

    name: str
    description: str | None = None


class ScannerUpdateRequest(BaseModel):
    """Request schema for updating a scanner."""

    name: str | None = None
    description: str | None = None


class ScannerResponse(BaseModel):
    """Scanner information response (without API key)."""

    id: int
    name: str
    description: str | None
    last_seen_at: datetime | None
    scanner_version: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScannerCreateResponse(BaseModel):
    """Response when creating a scanner - includes the API key (shown once)."""

    id: int
    name: str
    description: str | None
    last_seen_at: datetime | None
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


# --- Scanner API Schemas ---


class ScannerAuthRequest(BaseModel):
    """Request schema for scanner authentication."""

    scanner_version: str | None = None


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
    scanner_type: str = "masscan"  # masscan or nmap
    scan_timeout: int = 3600  # seconds
    port_timeout: int = 1500  # milliseconds
    scan_protocol: str = "tcp"  # tcp, udp, or both
    is_ipv6: bool = False  # whether the network CIDR is IPv6

    model_config = {"from_attributes": True}


class ScannerJobListResponse(BaseModel):
    """List of pending scan jobs."""

    jobs: list[ScannerJobResponse]


class ScannerJobClaimResponse(BaseModel):
    """Response when successfully claiming a scan job."""

    scan_id: int
    network_id: int
    message: str = "Job claimed successfully"


class OpenPortData(BaseModel):
    """Open port data from scanner results."""

    ip: str
    port: int
    protocol: str = "tcp"
    ttl: int | None = None
    banner: str | None = None
    mac_address: str | None = None
    mac_vendor: str | None = None


class ScannerResultRequest(BaseModel):
    """Request to submit scan results."""

    scan_id: int
    status: str  # "success" or "failed"
    open_ports: list[OpenPortData] = []
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
