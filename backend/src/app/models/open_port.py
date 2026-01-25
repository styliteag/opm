"""Open port model for storing discovered open ports from scans."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.scan import Scan


class OpenPort(Base):
    """Open port model for recording ports discovered during scans."""

    __tablename__ = "open_ports"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(ForeignKey("scans.id"), nullable=False, index=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)  # IPv6 max length
    port: Mapped[int] = mapped_column(nullable=False, index=True)
    protocol: Mapped[str] = mapped_column(String(10), nullable=False, default="tcp")
    ttl: Mapped[int | None] = mapped_column(nullable=True)
    banner: Mapped[str | None] = mapped_column(Text, nullable=True)
    service_guess: Mapped[str | None] = mapped_column(String(100), nullable=True)
    mac_address: Mapped[str | None] = mapped_column(String(17), nullable=True)  # XX:XX:XX:XX:XX:XX
    mac_vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    scan: Mapped["Scan"] = relationship("Scan", back_populates="open_ports")
