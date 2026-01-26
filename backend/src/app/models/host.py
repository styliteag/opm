"""Host model for tracking discovered hosts across networks."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Host(Base):
    """Host model for storing discovered hosts with DNS and ping information."""

    __tablename__ = "hosts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ip: Mapped[str] = mapped_column(String(45), nullable=False, unique=True, index=True)
    hostname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_pingable: Mapped[bool | None] = mapped_column(nullable=True)  # null = not tested
    mac_address: Mapped[str | None] = mapped_column(String(17), nullable=True)  # XX:XX:XX:XX:XX:XX
    mac_vendor: Mapped[str | None] = mapped_column(String(255), nullable=True)
    first_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    user_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    seen_by_networks: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
