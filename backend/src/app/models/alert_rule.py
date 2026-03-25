"""AlertRule model for unified alert suppression/escalation rules."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.network import Network
    from app.models.user import User


class RuleType(str, Enum):
    """Alert rule types."""

    ACCEPTED = "accepted"
    CRITICAL = "critical"


class AlertRule(Base):
    """Unified alert rule for suppression/escalation across all alert sources.

    Replaces the old port_rules and global_port_rules tables.
    Global rules have network_id=NULL. Network-scoped rules have a network_id.
    The source field determines which alert source this rule applies to.
    match_criteria is a JSON dict with source-specific fields:
      - port source: {"ip": "10.0.0.1", "port": "80-443"}
      - ssh source: {"ip": "10.0.0.1", "port": "22", "alert_type": "ssh_weak_cipher"}
    """

    __tablename__ = "alert_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    network_id: Mapped[int | None] = mapped_column(
        ForeignKey("networks.id"), nullable=True, index=True
    )
    source: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    rule_type: Mapped[RuleType] = mapped_column(
        SQLEnum(RuleType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    match_criteria: Mapped[dict[str, str | None]] = mapped_column(JSON, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="1")
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    network: Mapped["Network | None"] = relationship("Network")
    creator: Mapped["User | None"] = relationship("User")
