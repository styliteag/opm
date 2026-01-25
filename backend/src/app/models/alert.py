"""Alert model for security notifications."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.global_open_port import GlobalOpenPort
    from app.models.network import Network
    from app.models.scan import Scan


class AlertType(str, Enum):
    """Alert type values."""

    NEW_PORT = "new_port"
    NOT_ALLOWED = "not_allowed"
    BLOCKED = "blocked"


class Alert(Base):
    """Alert model for tracking security notifications."""

    __tablename__ = "alerts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scan_id: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), nullable=True, index=True)
    network_id: Mapped[int | None] = mapped_column(
        ForeignKey("networks.id"), nullable=True, index=True
    )
    global_open_port_id: Mapped[int | None] = mapped_column(
        ForeignKey("global_open_ports.id"), nullable=True, index=True
    )
    alert_type: Mapped[AlertType] = mapped_column(
        SQLEnum(AlertType, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    port: Mapped[int] = mapped_column(nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    scan: Mapped["Scan | None"] = relationship("Scan", back_populates="alerts")
    network: Mapped["Network | None"] = relationship("Network", back_populates="alerts")
    global_open_port: Mapped["GlobalOpenPort | None"] = relationship("GlobalOpenPort")
