"""SSH scan result model for storing SSH security scan data."""

from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.scan import Scan


class SSHScanResult(Base):
    """SSH scan result model for storing SSH security analysis data."""

    __tablename__ = "ssh_scan_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(
        ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    host_ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    port: Mapped[int] = mapped_column(Integer, nullable=False, default=22)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Authentication methods
    publickey_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    password_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    keyboard_interactive_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False
    )

    # SSH metadata
    ssh_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    protocol_version: Mapped[str | None] = mapped_column(String(20), nullable=True)
    server_banner: Mapped[str | None] = mapped_column(Text, nullable=True)

    # JSON fields for cryptographic algorithms
    supported_ciphers: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True
    )
    kex_algorithms: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True
    )
    host_key_types: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    mac_algorithms: Mapped[list[dict[str, Any]] | None] = mapped_column(
        JSON, nullable=True
    )

    # Relationship to parent scan
    scan: Mapped["Scan"] = relationship("Scan", back_populates="ssh_scan_results")
