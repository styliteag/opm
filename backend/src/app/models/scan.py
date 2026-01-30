"""Scan model for tracking scan jobs and their status."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.network import Network
    from app.models.open_port import OpenPort
    from app.models.scan_log import ScanLog
    from app.models.scanner import Scanner
    from app.models.ssh_scan_result import SSHScanResult
    from app.models.user import User


class ScanStatus(str, Enum):
    """Scan status values."""

    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TriggerType(str, Enum):
    """How the scan was triggered."""

    MANUAL = "manual"
    SCHEDULED = "scheduled"


class Scan(Base):
    """Scan model for tracking individual scan executions."""

    __tablename__ = "scans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id"), nullable=False, index=True)
    scanner_id: Mapped[int] = mapped_column(ForeignKey("scanners.id"), nullable=False, index=True)
    status: Mapped[ScanStatus] = mapped_column(
        SQLEnum(ScanStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ScanStatus.PLANNED,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    cancelled_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    progress_percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    progress_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger_type: Mapped[TriggerType] = mapped_column(
        SQLEnum(TriggerType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=TriggerType.MANUAL,
    )
    hidden: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="0",
        index=True,
    )

    # Relationships
    network: Mapped["Network"] = relationship("Network", back_populates="scans")
    scanner: Mapped["Scanner"] = relationship("Scanner", back_populates="scans")
    cancelled_by_user: Mapped["User | None"] = relationship("User")
    logs: Mapped[list["ScanLog"]] = relationship(
        "ScanLog", back_populates="scan", cascade="all, delete-orphan"
    )
    open_ports: Mapped[list["OpenPort"]] = relationship(
        "OpenPort", back_populates="scan", cascade="all, delete-orphan"
    )
    alerts: Mapped[list["Alert"]] = relationship(
        "Alert", back_populates="scan", cascade="all, delete-orphan"
    )
    ssh_scan_results: Mapped[list["SSHScanResult"]] = relationship(
        "SSHScanResult", back_populates="scan", cascade="all, delete-orphan"
    )

    @property
    def cancelled_by_email(self) -> str | None:
        """Return the cancelling user's email when available."""
        if self.cancelled_by_user is None:
            return None
        return self.cancelled_by_user.email
