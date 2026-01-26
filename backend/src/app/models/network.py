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
    host_discovery_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default="1"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
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
