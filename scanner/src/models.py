"""Data models for the scanner agent."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal

VulnerabilitySeverityLabel = Literal["critical", "high", "medium", "low", "info"]


@dataclass(frozen=True)
class ScannerConfig:
    """Configuration for the scanner agent."""

    backend_url: str
    api_key: str
    poll_interval: int
    log_level: str


@dataclass(frozen=True)
class ScanPhase:
    """A single phase in a multi-phase scan pipeline."""

    name: str  # host_discovery, port_scan, vulnerability
    enabled: bool
    tool: str  # nmap, masscan, nmap_nse
    config: dict[str, Any]


@dataclass(frozen=True)
class ScannerJob:
    """A pending scan job from the backend."""

    network_id: int
    cidr: str
    port_spec: str
    rate: int | None
    scanner_type: str  # masscan, nmap, or nse
    scan_timeout: int  # seconds
    port_timeout: int  # milliseconds
    scan_protocol: str  # tcp, udp, or both
    is_ipv6: bool = False
    target_ip: str | None = None
    # NSE-specific fields
    nse_scripts: list[str] | None = None
    nse_script_args: dict[str, Any] | None = None
    custom_script_hashes: dict[str, str] | None = None
    # Multi-phase pipeline
    phases: list[ScanPhase] | None = None
    # GVM-specific fields
    gvm_scan_config: str | None = None


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
class VulnerabilityResult:
    """Individual vulnerability finding from a GVM/Greenbone scan."""

    ip: str
    port: int | None
    protocol: str
    oid: str
    name: str
    description: str
    severity: float
    severity_label: VulnerabilitySeverityLabel
    cvss_base_vector: str | None
    cve_ids: list[str]
    solution: str | None
    solution_type: str | None
    qod: int | None

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "ip": self.ip,
            "port": self.port,
            "protocol": self.protocol,
            "oid": self.oid,
            "name": self.name,
            "description": self.description,
            "severity": self.severity,
            "severity_label": self.severity_label,
            "cvss_base_vector": self.cvss_base_vector,
            "cve_ids": self.cve_ids,
            "solution": self.solution,
            "solution_type": self.solution_type,
            "qod": self.qod,
        }


@dataclass(frozen=True)
class HostDiscoveryJob:
    """A pending host discovery job from the backend."""

    scan_id: int
    network_id: int
    cidr: str
    is_ipv6: bool = False
    known_hostnames: dict[str, str] | None = None
    ips_with_open_ports: list[str] | None = None


@dataclass(frozen=True)
class NseScriptResult:
    """Individual NSE script finding from a vulnerability scan."""

    ip: str
    port: int
    protocol: str
    script_name: str
    script_output: str
    cve_ids: list[str]
    severity: str

    def to_payload(self) -> dict[str, Any]:
        """Convert to JSON-serializable payload."""
        return {
            "ip": self.ip,
            "port": self.port,
            "protocol": self.protocol,
            "script_name": self.script_name,
            "script_output": self.script_output,
            "cve_ids": self.cve_ids,
            "severity": self.severity,
        }


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
