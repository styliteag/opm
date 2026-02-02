"""Data models for the scanner agent."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any


@dataclass(frozen=True)
class ScannerConfig:
    """Configuration for the scanner agent."""

    backend_url: str
    api_key: str
    poll_interval: int
    log_level: str


@dataclass(frozen=True)
class ScannerJob:
    """A pending scan job from the backend."""

    network_id: int
    cidr: str
    port_spec: str
    rate: int | None
    scanner_type: str  # masscan or nmap
    scan_timeout: int  # seconds
    port_timeout: int  # milliseconds
    scan_protocol: str  # tcp, udp, or both
    is_ipv6: bool = False  # whether the network CIDR is IPv6
    target_ip: str | None = None  # specific IP for single-host scan, None for full network


@dataclass(frozen=True)
class OpenPortResult:
    """Normalized open port data from masscan output."""

    ip: str
    port: int
    protocol: str
    ttl: int | None
    banner: str | None
    service_guess: str | None
    mac_address: str | None
    mac_vendor: str | None

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "ip": self.ip,
            "port": self.port,
            "protocol": self.protocol,
            "ttl": self.ttl,
            "banner": self.banner,
            "service_guess": self.service_guess,
            "mac_address": self.mac_address,
            "mac_vendor": self.mac_vendor,
        }


@dataclass(frozen=True)
class LogEntry:
    """Scanner log entry for backend submission."""

    timestamp: datetime
    level: str
    message: str

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "timestamp": self.timestamp.isoformat(),
            "level": self.level,
            "message": self.message,
        }


@dataclass(frozen=True)
class ScanRunResult:
    """Result from running a scan, including cancellation state."""

    open_ports: list[OpenPortResult]
    cancelled: bool


@dataclass(frozen=True)
class HostDiscoveryJob:
    """A pending host discovery job from the backend."""

    scan_id: int
    network_id: int
    cidr: str
    is_ipv6: bool = False


@dataclass(frozen=True)
class HostResult:
    """Discovered host data from nmap ping scan."""

    ip: str
    hostname: str | None
    is_pingable: bool
    mac_address: str | None
    mac_vendor: str | None

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "ip": self.ip,
            "hostname": self.hostname,
            "is_pingable": self.is_pingable,
            "mac_address": self.mac_address,
            "mac_vendor": self.mac_vendor,
        }
