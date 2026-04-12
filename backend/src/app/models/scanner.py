"""Scanner model for scanner registration."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.gvm_scanner_metadata import GvmScannerMetadata
    from app.models.host_discovery_scan import HostDiscoveryScan
    from app.models.network import Network
    from app.models.scan import Scan


class Scanner(Base):
    """Scanner model representing a scanner deployment location."""

    __tablename__ = "scanners"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    api_key_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    scanner_version: Mapped[str | None] = mapped_column(String(50), nullable=True)
    kind: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        server_default="standard",
        comment="Scanner kind: 'standard', 'gvm', or 'unified' (standard + gvm)",
    )
    gvm_refresh_requested: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        comment="On-demand metadata refresh flag; cleared by scanner on next snapshot push",
    )
    gvm_synced_at: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment="Last time this GVM scanner posted its metadata snapshot",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )

    # Relationships
    networks: Mapped[list["Network"]] = relationship(
        "Network", back_populates="scanner", cascade="all, delete-orphan"
    )
    scans: Mapped[list["Scan"]] = relationship(
        "Scan", back_populates="scanner", cascade="all, delete-orphan"
    )
    host_discovery_scans: Mapped[list["HostDiscoveryScan"]] = relationship(
        "HostDiscoveryScan", back_populates="scanner", cascade="all, delete-orphan"
    )
    gvm_metadata_entries: Mapped[list["GvmScannerMetadata"]] = relationship(
        "GvmScannerMetadata",
        back_populates="scanner",
        cascade="all, delete-orphan",
    )
