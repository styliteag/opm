"""Network model for network configuration."""

import ipaddress
from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.host_discovery_scan import HostDiscoveryScan
    from app.models.port_rule import PortRule
    from app.models.scan import Scan
    from app.models.scanner import Scanner


class Network(Base):
    """Network model for defining scan targets."""

    __tablename__ = "networks"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    cidr: Mapped[str] = mapped_column(String(43), nullable=False)  # IPv6 CIDR max length
    port_spec: Mapped[str] = mapped_column(String(1000), nullable=False)  # e.g., "80-443,8080,!88"
    scanner_id: Mapped[int] = mapped_column(ForeignKey("scanners.id"), nullable=False, index=True)
    scan_schedule: Mapped[str | None] = mapped_column(String(100), nullable=True)  # cron format
    scan_rate: Mapped[int | None] = mapped_column(Integer, nullable=True)  # packets per second
    scan_timeout: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default="3600"
    )  # seconds
    port_timeout: Mapped[int | None] = mapped_column(
        Integer, nullable=True, server_default="1500"
    )  # milliseconds
    scanner_type: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="masscan"
    )  # 'masscan' | 'nmap'
    scan_protocol: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="tcp"
    )  # 'tcp' | 'udp' | 'both'
    alert_config: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    nse_profile_id: Mapped[int | None] = mapped_column(
        ForeignKey("nse_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Default NSE profile for scheduled scans when scanner_type is nse",
    )
    host_discovery_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    scan_schedule_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    phases: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True, comment="Multi-phase scan pipeline config"
    )
    gvm_scan_config: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="GVM scan config preset for greenbone scanner type",
    )
    gvm_port_list: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="GVM port list name for greenbone scanner type; when set, "
        "scanner uses port_list_id instead of raw port_range",
    )
    gvm_keep_reports: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="1",
        comment="Keep GVM task/target/report in the Greenbone instance after scan "
        "(visible in GSA); when false, scanner deletes them post-scan",
    )
    ssh_probe_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default="1",
        comment="Run SSH probe (ssh-audit + auth methods) on open ports after port scan",
    )
    nuclei_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        comment="Run nuclei as a post-phase after port scan (masscan/nmap only)",
    )
    nuclei_tags: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Comma-separated nuclei template tags (empty = all default tags)",
    )
    nuclei_exclude_tags: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
        comment="Comma-separated nuclei template tags to exclude (empty = scanner default)",
    )
    nuclei_severity: Mapped[str | None] = mapped_column(
        String(16),
        nullable=True,
        comment="Minimum nuclei severity to report: info/low/medium/high/critical",
    )
    nuclei_timeout: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="Wall-clock timeout for the nuclei subprocess in seconds "
        "(null = scanner default 1800)",
    )
    nuclei_sni_enabled: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        comment="SNI fan-out: expand nuclei targets per cached vhost via "
        "hostname_lookup_cache. Only effective when nuclei_enabled is true.",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp(), onupdate=func.utc_timestamp()
    )

    # Relationships
    scanner: Mapped["Scanner"] = relationship("Scanner", back_populates="networks")
    port_rules: Mapped[list["PortRule"]] = relationship(
        "PortRule", back_populates="network", cascade="all, delete-orphan"
    )
    scans: Mapped[list["Scan"]] = relationship(
        "Scan", back_populates="network", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(
        "Alert", back_populates="network", cascade="all, delete-orphan"
    )
    host_discovery_scans: Mapped[list["HostDiscoveryScan"]] = relationship(
        "HostDiscoveryScan", back_populates="network", cascade="all, delete-orphan"
    )

    @property
    def is_ipv6(self) -> bool:
        """Determine if the network CIDR is IPv6 based on the address format."""
        try:
            network = ipaddress.ip_network(self.cidr, strict=False)
            return network.version == 6
        except ValueError:
            # If CIDR is invalid, default to IPv4
            return False
