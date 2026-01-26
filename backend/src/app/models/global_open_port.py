"""GlobalOpenPort model for deduplicated open ports across all scans."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GlobalOpenPort(Base):
    """Global open port model for storing deduplicated open ports across all scans."""

    __tablename__ = "global_open_ports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)  # IPv6 max length
    port: Mapped[int] = mapped_column(nullable=False, index=True)
    protocol: Mapped[str] = mapped_column(String(10), nullable=False, default="tcp")
    banner: Mapped[str | None] = mapped_column(Text, nullable=True)
    service_guess: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(17), nullable=True)  # XX:XX:XX:XX:XX:XX
    mac_vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    seen_by_networks: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    host_id: Mapped[int | None] = mapped_column(
        ForeignKey("hosts.id"), nullable=True, index=True
    )

    __table_args__ = (
        UniqueConstraint("ip", "port", "protocol", name="uq_global_open_ports_ip_port_protocol"),
        Index("ix_global_open_ports_ip_port", "ip", "port"),
    )
