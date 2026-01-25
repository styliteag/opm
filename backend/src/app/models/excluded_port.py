"""Excluded port model for filtering false positives from scan results."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.network import Network
    from app.models.user import User


class ExcludedPort(Base):
    """Excluded port model for filtering ip:port from results."""

    __tablename__ = "excluded_ports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    network_id: Mapped[int] = mapped_column(ForeignKey("networks.id"), nullable=False, index=True)
    ip: Mapped[str | None] = mapped_column(
        String(45), nullable=True, index=True
    )  # IPv6 max length
    port: Mapped[int] = mapped_column(nullable=False, index=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    network: Mapped["Network"] = relationship("Network", back_populates="excluded_ports")
    created_by_user: Mapped["User"] = relationship("User", back_populates="excluded_ports")
