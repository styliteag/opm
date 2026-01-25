"""GlobalPortRule model for global whitelist/blocklist rules."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class GlobalRuleType(str, Enum):
    """Global port rule types."""

    ALLOW = "allow"
    BLOCK = "block"


class GlobalPortRule(Base):
    """Global port rule model for defining allowed/blocked ports globally."""

    __tablename__ = "global_port_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ip: Mapped[str | None] = mapped_column(
        String(45), nullable=True, index=True
    )  # Optional IP-specific rule
    port: Mapped[str] = mapped_column(String(20), nullable=False)  # Can be single port or range
    rule_type: Mapped[GlobalRuleType] = mapped_column(
        SQLEnum(GlobalRuleType, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    creator: Mapped["User | None"] = relationship("User")
