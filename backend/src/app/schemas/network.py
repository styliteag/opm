"""Network management schemas for CRUD operations."""

import ipaddress
import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator


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


def validate_cron_schedule(value: str | None) -> str | None:
    """Validate cron schedule format or allow null for manual-only.

    Basic cron format: minute hour day_of_month month day_of_week
    Examples: "0 * * * *" (every hour), "*/5 * * * *" (every 5 minutes)
    """
    if value is None or value == "":
        return None

    # Basic cron validation (5 or 6 fields)
    parts = value.split()
    if len(parts) < 5 or len(parts) > 6:
        raise ValueError(
            "Invalid cron format: expected 5 or 6 fields "
            "(minute hour day_of_month month day_of_week [year])"
        )

    # Basic pattern validation for cron fields
    cron_field_pattern = re.compile(r"^[\d\*\/\-\,]+$")
    for i, part in enumerate(parts):
        if not cron_field_pattern.match(part):
            raise ValueError(f"Invalid cron field at position {i}: {part}")

    return value


VALID_SCANNER_TYPES = ("masscan", "nmap")
VALID_SCAN_PROTOCOLS = ("tcp", "udp", "both")


def validate_scanner_type(value: str) -> str:
    """Validate scanner_type is one of the allowed values."""
    if value not in VALID_SCANNER_TYPES:
        raise ValueError(f"Invalid scanner_type: must be one of {VALID_SCANNER_TYPES}")
    return value


def validate_scan_protocol(value: str) -> str:
    """Validate scan_protocol is one of the allowed values."""
    if value not in VALID_SCAN_PROTOCOLS:
        raise ValueError(f"Invalid scan_protocol: must be one of {VALID_SCAN_PROTOCOLS}")
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
    is_ipv6: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class NetworkListResponse(BaseModel):
    """Response schema for list of networks."""

    networks: list[NetworkResponse]
