"""NSE script model for custom vulnerability detection scripts."""

from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql import func

from app.models.base import Base
from app.models.nse_template import NseTemplateType


class NseScript(Base):
    """A custom NSE script stored in the database."""

    __tablename__ = "nse_scripts"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    categories: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    severity: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    type: Mapped[str] = mapped_column(
        String(20), nullable=False, default=NseTemplateType.CUSTOM.value
    )
    cloned_from: Mapped[str | None] = mapped_column(
        String(200), nullable=True, default=None
    )
    author: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp(), onupdate=func.utc_timestamp()
    )
