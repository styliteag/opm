"""NSE template repository model for git-based template sources."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.nse_template import NseTemplate


class NseRepositoryStatus(str, Enum):
    """Repository sync status values."""

    PENDING = "pending"
    SYNCING = "syncing"
    SYNCED = "synced"
    ERROR = "error"


class NseRepository(Base):
    """Git repository source for NSE vulnerability detection templates."""

    __tablename__ = "nse_repositories"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    url: Mapped[str] = mapped_column(String(500), nullable=False)
    branch: Mapped[str] = mapped_column(String(100), nullable=False, default="main")
    status: Mapped[NseRepositoryStatus] = mapped_column(
        SQLEnum(NseRepositoryStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=NseRepositoryStatus.PENDING,
    )
    template_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sync_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    templates: Mapped[list["NseTemplate"]] = relationship(
        "NseTemplate", back_populates="repository", cascade="all, delete-orphan"
    )
