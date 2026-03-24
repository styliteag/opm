"""Scan profile model for defining multi-phase scan configurations."""

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


class ScanProfileSeverity(str, Enum):
    """Profile severity classification."""

    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    INFO = "info"


class ScanProfileType(str, Enum):
    """Profile source type."""

    BUILTIN = "builtin"
    CUSTOM = "custom"


class ScanProfile(Base):
    """Scan profile — a named multi-phase scan configuration.

    Phases are stored as a JSON array of phase objects:
    [
        {"name": "host_discovery", "enabled": true, "tool": "nmap", "config": {...}},
        {"name": "port_scan", "enabled": true, "tool": "masscan", "config": {...}},
        {"name": "vulnerability", "enabled": true, "tool": "nmap_nse", "config": {...}},
    ]
    """

    __tablename__ = "nse_templates"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    phases: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    severity: Mapped[ScanProfileSeverity | None] = mapped_column(
        SQLEnum(ScanProfileSeverity, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        default=None,
    )
    platform: Mapped[str] = mapped_column(String(50), nullable=False, default="any")
    type: Mapped[ScanProfileType] = mapped_column(
        SQLEnum(ScanProfileType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ScanProfileType.CUSTOM,
    )
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    category: Mapped[str | None] = mapped_column(String(50), nullable=True, default=None)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Legacy columns — kept for migration compatibility, removed in migration 004
    nse_scripts: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    script_args: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Relationships
    results: Mapped[list["NseResult"]] = relationship(
        "NseResult", back_populates="template"
    )
