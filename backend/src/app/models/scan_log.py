"""Scan log model for storing scan execution logs."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.scan import Scan


class LogLevel(str, Enum):
    """Log level values."""

    INFO = "info"
    WARNING = "warning"
    ERROR = "error"


class ScanLog(Base):
    """Scan log model for recording scan execution events."""

    __tablename__ = "scan_logs"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False, server_default=func.now())
    level: Mapped[LogLevel] = mapped_column(
        SQLEnum(LogLevel, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=LogLevel.INFO,
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)

    # Relationships
    scan: Mapped["Scan"] = relationship("Scan", back_populates="logs")
