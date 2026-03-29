"""NSE scan result model for storing vulnerability findings."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.nse_template import NseTemplate
    from app.models.scan import Scan


class NseResult(Base):
    """Individual NSE script finding from a vulnerability scan."""

    __tablename__ = "nse_results"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scan_id: Mapped[int] = mapped_column(
        ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    port: Mapped[int] = mapped_column(Integer, nullable=False)
    protocol: Mapped[str] = mapped_column(String(10), nullable=False, default="tcp")
    script_name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    script_output: Mapped[str] = mapped_column(Text, nullable=False)
    cve_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("nse_templates.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )

    # Relationships
    scan: Mapped["Scan"] = relationship("Scan", back_populates="nse_results")
    template: Mapped["NseTemplate | None"] = relationship(
        "NseTemplate", back_populates="results"
    )
