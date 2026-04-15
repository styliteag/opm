"""Network management schemas for CRUD operations."""

import ipaddress
import re
from datetime import datetime
from typing import Any, Self

from pydantic import BaseModel, field_validator, model_validator

from app.core.scanner_types import get_valid_scanner_types

NUCLEI_ELIGIBLE_SCANNER_TYPES = frozenset({"masscan", "nmap"})
VALID_NUCLEI_SEVERITIES = ("info", "low", "medium", "high", "critical")
NUCLEI_TIMEOUT_MIN = 60
NUCLEI_TIMEOUT_MAX = 86400


def validate_cidr(value: str) -> str:
    """Validate CIDR format (e.g., 192.168.1.0/24)."""
    try:
        ipaddress.ip_network(value, strict=False)
        return value
    except ValueError as e:
        raise ValueError(f"Invalid CIDR format: {e}") from e


def validate_port_spec(value: str) -> str:
    """Validate port_spec format: '80-443,1000-1020,8080,!88'.

    Supports:
    - Single ports: 80, 443
    - Port ranges: 80-443
    - Excluded ports (prefixed with !): !88
    - Comma-separated combinations
    """
    if not value:
        raise ValueError("port_spec cannot be empty")

    # Split by comma and validate each segment
    segments = [s.strip() for s in value.split(",")]

    for segment in segments:
        if not segment:
            raise ValueError("Invalid port_spec: empty segment")

        # Handle exclusion prefix
        port_str = segment.lstrip("!")

        # Check for range
        if "-" in port_str:
            parts = port_str.split("-")
            if len(parts) != 2:
                raise ValueError(f"Invalid port range format: {segment}")
            try:
                start = int(parts[0])
                end = int(parts[1])
                if not (1 <= start <= 65535 and 1 <= end <= 65535):
                    raise ValueError(f"Port out of range (1-65535): {segment}")
                if start > end:
                    raise ValueError(f"Invalid port range (start > end): {segment}")
            except ValueError as e:
                if "invalid literal" in str(e):
                    raise ValueError(f"Invalid port number in range: {segment}") from e
                raise
        else:
            # Single port
            try:
                port = int(port_str)
                if not (1 <= port <= 65535):
                    raise ValueError(f"Port out of range (1-65535): {segment}")
            except ValueError as e:
                if "invalid literal" in str(e):
                    raise ValueError(f"Invalid port number: {segment}") from e
                raise

    return value


def _validate_legacy_cron(value: str) -> str:
    """Validate legacy 5/6-field cron format."""
    parts = value.split()
    if len(parts) < 5 or len(parts) > 6:
        raise ValueError(
            "Invalid cron format: expected 5 or 6 fields "
            "(minute hour day_of_month month day_of_week [year])"
        )
    cron_field_pattern = re.compile(r"^[\d\*\/\-\,]+$")
    for i, part in enumerate(parts):
        if not cron_field_pattern.match(part):
            raise ValueError(f"Invalid cron field at position {i}: {part}")
    return value


def validate_cron_schedule(value: str | None) -> str | None:
    """Validate scan schedule — accepts JSON structured format or legacy cron.

    JSON format: ``{"type": "daily", "hour": 2, "minute": 0}``
    Legacy cron: ``0 2 * * *``
    """
    if value is None or value == "":
        return None

    stripped = value.strip()
    if stripped.startswith("{"):
        import json

        from app.schemas.schedule import parse_structured_schedule

        try:
            data = json.loads(stripped)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid schedule JSON: {exc}") from exc
        parse_structured_schedule(data)
        return stripped

    return _validate_legacy_cron(stripped)


VALID_SCAN_PROTOCOLS = ("tcp", "udp", "both")


def validate_scanner_type(value: str) -> str:
    """Validate scanner_type is one of the registered types."""
    valid = get_valid_scanner_types()
    if value not in valid:
        raise ValueError(f"Invalid scanner_type: must be one of {valid}")
    return value


def validate_scan_protocol(value: str) -> str:
    """Validate scan_protocol is one of the allowed values."""
    if value not in VALID_SCAN_PROTOCOLS:
        raise ValueError(f"Invalid scan_protocol: must be one of {VALID_SCAN_PROTOCOLS}")
    return value


def validate_nuclei_severity(value: str | None) -> str | None:
    """Validate nuclei_severity is one of the allowed labels."""
    if value is None:
        return None
    if value not in VALID_NUCLEI_SEVERITIES:
        raise ValueError(
            f"Invalid nuclei_severity: must be one of {VALID_NUCLEI_SEVERITIES}"
        )
    return value


def validate_gvm_alert_severity(value: str | None) -> str | None:
    """Validate gvm_alert_severity is one of the allowed severity labels."""
    if value is None:
        return None
    if value not in VALID_NUCLEI_SEVERITIES:
        raise ValueError(
            f"Invalid gvm_alert_severity: must be one of {VALID_NUCLEI_SEVERITIES}"
        )
    return value


def validate_nuclei_timeout(value: int | None) -> int | None:
    """Validate nuclei_timeout is within the allowed range (seconds)."""
    if value is None:
        return None
    if not (NUCLEI_TIMEOUT_MIN <= value <= NUCLEI_TIMEOUT_MAX):
        raise ValueError(
            f"nuclei_timeout must be between {NUCLEI_TIMEOUT_MIN} and "
            f"{NUCLEI_TIMEOUT_MAX} seconds"
        )
    return value


class NetworkCreateRequest(BaseModel):
    """Request schema for creating a new network."""

    name: str
    cidr: str
    port_spec: str
    scanner_id: int
    scan_schedule: str | None = None
    scan_rate: int | None = None
    scan_timeout: int | None = 3600
    port_timeout: int | None = 1500
    scanner_type: str = "masscan"
    scan_protocol: str = "tcp"
    alert_config: dict[str, Any] | None = None
    nse_profile_id: int | None = None
    host_discovery_enabled: bool = True
    scan_schedule_enabled: bool = True
    phases: list[dict[str, Any]] | None = None
    gvm_scan_config: str | None = None
    gvm_port_list: str | None = None
    gvm_keep_reports: bool = True
    gvm_alert_severity: str | None = None
    ssh_probe_enabled: bool = True
    nuclei_enabled: bool = False
    nuclei_tags: str | None = None
    nuclei_exclude_tags: str | None = None
    nuclei_severity: str | None = None
    nuclei_timeout: int | None = None
    nuclei_sni_enabled: bool = False

    @field_validator("cidr")
    @classmethod
    def validate_cidr_format(cls, v: str) -> str:
        return validate_cidr(v)

    @field_validator("port_spec")
    @classmethod
    def validate_port_spec_format(cls, v: str) -> str:
        return validate_port_spec(v)

    @field_validator("scan_schedule")
    @classmethod
    def validate_scan_schedule_format(cls, v: str | None) -> str | None:
        return validate_cron_schedule(v)

    @field_validator("scan_rate")
    @classmethod
    def validate_scan_rate_value(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("Scan rate must be greater than 0")
        return v

    @field_validator("scan_timeout")
    @classmethod
    def validate_scan_timeout_value(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("Scan timeout must be greater than 0")
        return v

    @field_validator("port_timeout")
    @classmethod
    def validate_port_timeout_value(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("Port timeout must be greater than 0")
        return v

    @field_validator("scanner_type")
    @classmethod
    def validate_scanner_type_value(cls, v: str) -> str:
        return validate_scanner_type(v)

    @field_validator("scan_protocol")
    @classmethod
    def validate_scan_protocol_value(cls, v: str) -> str:
        return validate_scan_protocol(v)

    @field_validator("nuclei_severity")
    @classmethod
    def validate_nuclei_severity_value(cls, v: str | None) -> str | None:
        return validate_nuclei_severity(v)

    @field_validator("gvm_alert_severity")
    @classmethod
    def validate_gvm_alert_severity_value(cls, v: str | None) -> str | None:
        return validate_gvm_alert_severity(v)

    @field_validator("nuclei_timeout")
    @classmethod
    def validate_nuclei_timeout_value(cls, v: int | None) -> int | None:
        return validate_nuclei_timeout(v)

    @model_validator(mode="after")
    def validate_nuclei_scanner_compatibility(self) -> "Self":
        """Reject nuclei_enabled=True unless scanner_type is masscan or nmap."""
        if self.nuclei_enabled and self.scanner_type not in NUCLEI_ELIGIBLE_SCANNER_TYPES:
            raise ValueError(
                "nuclei_enabled is only supported for scanner_type "
                f"in {sorted(NUCLEI_ELIGIBLE_SCANNER_TYPES)}"
            )
        return self


class NetworkUpdateRequest(BaseModel):
    """Request schema for updating a network."""

    name: str | None = None
    cidr: str | None = None
    port_spec: str | None = None
    scanner_id: int | None = None
    scan_schedule: str | None = None
    scan_rate: int | None = None
    scan_timeout: int | None = None
    port_timeout: int | None = None
    scanner_type: str | None = None
    scan_protocol: str | None = None
    alert_config: dict[str, Any] | None = None
    nse_profile_id: int | None = None
    host_discovery_enabled: bool | None = None
    scan_schedule_enabled: bool | None = None
    phases: list[dict[str, Any]] | None = None
    gvm_scan_config: str | None = None
    gvm_port_list: str | None = None
    gvm_keep_reports: bool | None = None
    gvm_alert_severity: str | None = None
    ssh_probe_enabled: bool | None = None
    nuclei_enabled: bool | None = None
    nuclei_tags: str | None = None
    nuclei_exclude_tags: str | None = None
    nuclei_severity: str | None = None
    nuclei_timeout: int | None = None
    nuclei_sni_enabled: bool | None = None

    @field_validator("cidr")
    @classmethod
    def validate_cidr_format(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_cidr(v)

    @field_validator("port_spec")
    @classmethod
    def validate_port_spec_format(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_port_spec(v)

    @field_validator("scan_schedule")
    @classmethod
    def validate_scan_schedule_format(cls, v: str | None) -> str | None:
        return validate_cron_schedule(v)

    @field_validator("scan_rate")
    @classmethod
    def validate_scan_rate_value(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("Scan rate must be greater than 0")
        return v

    @field_validator("scan_timeout")
    @classmethod
    def validate_scan_timeout_value(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("Scan timeout must be greater than 0")
        return v

    @field_validator("port_timeout")
    @classmethod
    def validate_port_timeout_value(cls, v: int | None) -> int | None:
        if v is not None and v <= 0:
            raise ValueError("Port timeout must be greater than 0")
        return v

    @field_validator("scanner_type")
    @classmethod
    def validate_scanner_type_value(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_scanner_type(v)

    @field_validator("scan_protocol")
    @classmethod
    def validate_scan_protocol_value(cls, v: str | None) -> str | None:
        if v is None:
            return v
        return validate_scan_protocol(v)

    @field_validator("nuclei_severity")
    @classmethod
    def validate_nuclei_severity_value(cls, v: str | None) -> str | None:
        return validate_nuclei_severity(v)

    @field_validator("gvm_alert_severity")
    @classmethod
    def validate_gvm_alert_severity_value(cls, v: str | None) -> str | None:
        return validate_gvm_alert_severity(v)

    @field_validator("nuclei_timeout")
    @classmethod
    def validate_nuclei_timeout_value(cls, v: int | None) -> int | None:
        return validate_nuclei_timeout(v)

    @model_validator(mode="after")
    def validate_nuclei_scanner_compatibility(self) -> "Self":
        """Reject nuclei_enabled=True when updating with an incompatible scanner_type.

        Partial updates (scanner_type not provided in request) skip this check —
        the service layer is responsible for ensuring the effective post-merge
        state is valid. This check runs only when both fields are present in
        the same request or when the user is flipping nuclei_enabled on while
        scanner_type is greenbone (explicitly set in this request).
        """
        if (
            self.nuclei_enabled is True
            and self.scanner_type is not None
            and self.scanner_type not in NUCLEI_ELIGIBLE_SCANNER_TYPES
        ):
            raise ValueError(
                "nuclei_enabled is only supported for scanner_type "
                f"in {sorted(NUCLEI_ELIGIBLE_SCANNER_TYPES)}"
            )
        return self


class NetworkResponse(BaseModel):
    """Network information response."""

    id: int
    name: str
    cidr: str
    port_spec: str
    scanner_id: int
    scan_schedule: str | None
    scan_rate: int | None
    scan_timeout: int | None
    port_timeout: int | None
    scanner_type: str
    scan_protocol: str
    alert_config: dict[str, Any] | None
    nse_profile_id: int | None
    host_discovery_enabled: bool
    scan_schedule_enabled: bool
    phases: list[dict[str, Any]] | None
    gvm_scan_config: str | None
    gvm_port_list: str | None
    gvm_keep_reports: bool = True
    gvm_alert_severity: str | None = None
    ssh_probe_enabled: bool = True
    nuclei_enabled: bool = False
    nuclei_tags: str | None = None
    nuclei_exclude_tags: str | None = None
    nuclei_severity: str | None = None
    nuclei_timeout: int | None = None
    nuclei_sni_enabled: bool = False
    is_ipv6: bool
    created_at: datetime
    updated_at: datetime
    schedule_description: str | None = None
    next_fire_time: datetime | None = None

    model_config = {"from_attributes": True}


class NetworkListResponse(BaseModel):
    """Response schema for list of networks."""

    networks: list[NetworkResponse]


class LastScanSummary(BaseModel):
    """Minimal scan info for network overview."""

    id: int
    status: str
    started_at: datetime | None
    completed_at: datetime | None
    trigger_type: str
    port_count: int


class NetworkOverviewResponse(BaseModel):
    """Aggregated network health and status overview."""

    network: NetworkResponse
    host_count: int
    active_alert_count: int
    alert_severity_distribution: dict[str, int]
    open_port_count: int
    scan_success_rate: float
    total_scans_30d: int
    completed_scans_30d: int
    last_scan: LastScanSummary | None
    scanner_name: str
    scanner_online: bool
    nuclei_findings_count: int = 0
    last_nuclei_scan_id: int | None = None
