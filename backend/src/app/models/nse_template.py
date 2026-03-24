"""NSE profile model for vulnerability detection scan configurations."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.nse_result import NseResult


class NseTemplateSeverity(str, Enum):
    """Profile severity classification."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    INFO = "info"


class NseTemplateType(str, Enum):
    """Profile source type."""

    BUILTIN = "builtin"
    CUSTOM = "custom"


class NseTemplate(Base):
    """NSE scan profile — a named group of NSE scripts to run together."""

    __tablename__ = "nse_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    nse_scripts: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    severity: Mapped[NseTemplateSeverity | None] = mapped_column(
        SQLEnum(NseTemplateSeverity, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        default=None,
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False, default="any")
    type: Mapped[NseTemplateType] = mapped_column(
        SQLEnum(NseTemplateType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=NseTemplateType.CUSTOM,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    script_args: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
    results: Mapped[list["NseResult"]] = relationship(
        "NseResult", back_populates="template"
    )
