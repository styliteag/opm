"""HostDiscoveryScan model for tracking host discovery scan jobs."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.network import Network
    from app.models.scanner import Scanner


class HostDiscoveryScanStatus(str, Enum):
    """Host discovery scan status values."""

    PLANNED = "planned"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class HostDiscoveryTriggerType(str, Enum):
    """How the host discovery scan was triggered."""

    MANUAL = "manual"
    SCHEDULED = "scheduled"


class HostDiscoveryScan(Base):
    """Model for tracking host discovery scan executions."""

    __tablename__ = "host_discovery_scans"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id"), nullable=False, index=True)
    scanner_id: Mapped[int] = mapped_column(ForeignKey("scanners.id"), nullable=False, index=True)
    status: Mapped[HostDiscoveryScanStatus] = mapped_column(
        SQLEnum(HostDiscoveryScanStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=HostDiscoveryScanStatus.PLANNED,
        index=True,
    )
    trigger_type: Mapped[HostDiscoveryTriggerType] = mapped_column(
        SQLEnum(HostDiscoveryTriggerType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=HostDiscoveryTriggerType.MANUAL,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hosts_discovered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    network: Mapped["Network"] = relationship("Network", back_populates="host_discovery_scans")
    scanner: Mapped["Scanner"] = relationship("Scanner", back_populates="host_discovery_scans")
