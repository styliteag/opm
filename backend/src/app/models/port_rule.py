"""Port rule model for allow/block lists."""

from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.network import Network


class RuleType(str, Enum):
    """Port rule types."""

    ALLOW = "allow"
    BLOCK = "block"


class PortRule(Base):
    """Port rule model for defining allowed/blocked ports per network."""

    __tablename__ = "port_rules"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id"), nullable=False, index=True)
    ip: Mapped[str | None] = mapped_column(
        String(45), nullable=True, index=True
    )  # Optional IP-specific rule
    port: Mapped[str] = mapped_column(String(20), nullable=False)  # Can be single port or range
    rule_type: Mapped[RuleType] = mapped_column(
        SQLEnum(RuleType, values_callable=lambda x: [e.value for e in x]), nullable=False
    )
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Relationships
    network: Mapped["Network"] = relationship("Network", back_populates="port_rules")
