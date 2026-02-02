"""Global settings model for application-wide configuration."""

from typing import Any

from sqlalchemy import JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class GlobalSetting(Base):
    """Global settings model for storing application configuration."""

    __tablename__ = "global_settings"

    key: Mapped[str] = mapped_column(String(255), primary_key=True)
    value: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
