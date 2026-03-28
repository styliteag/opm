"""AlertEvent model for tracking alert lifecycle events."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.user import User


class AlertEventType(str, Enum):
    """Alert event type values."""

    CREATED = "created"
    DISMISSED = "dismissed"
    REOPENED = "reopened"
    ASSIGNED = "assigned"
    STATUS_CHANGED = "status_changed"
    COMMENTED = "commented"
    SEVERITY_OVERRIDDEN = "severity_overridden"
    RECURRENCE = "recurrence"


class AlertEvent(Base):
    """AlertEvent model for append-only alert lifecycle event log."""

    __tablename__ = "alert_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    alert_id: Mapped[int] = mapped_column(
        ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_type: Mapped[AlertEventType] = mapped_column(
        SQLEnum(AlertEventType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        index=True,
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    scan_id: Mapped[int | None] = mapped_column(ForeignKey("scans.id"), nullable=True, index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    extra: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    alert: Mapped["Alert"] = relationship("Alert", back_populates="events")
    user: Mapped["User | None"] = relationship("User")
