"""Per-scanner mirror of the GVM live state (scan_configs + port_lists)."""

from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.scanner import Scanner


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GvmScannerMetadata(Base):
    """A single scan_config or port_list known to live inside a GVM scanner.

    Rows are wiped and re-inserted wholesale on each metadata snapshot push
    from the scanner. The ``xml_hash`` column is parsed from the GVM
    ``<comment>`` element's ``[OPM:hash=...]`` marker — it's None for
    built-ins and anything not managed by OPM.
    """

    __tablename__ = "gvm_scanner_metadata"
    __table_args__ = (
        UniqueConstraint(
            "scanner_id", "kind", "name", name="uq_gvm_scanner_metadata_entry"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    scanner_id: Mapped[int] = mapped_column(
        ForeignKey("scanners.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    kind: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="'scan_config' or 'port_list'",
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    gvm_uuid: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="GVM instance UUID — per-instance, not stable across instances",
    )
    is_builtin: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="0"
    )
    xml_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="Parsed from [OPM:hash=...] marker in GVM <comment>; None if unmanaged",
    )
    extra: Mapped[dict[str, Any] | None] = mapped_column(
        JSON,
        nullable=True,
        comment="Display-only metadata: family_count, nvt_count, port_count, etc.",
    )
    synced_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=_now,
        server_default=func.utc_timestamp(),
    )

    scanner: Mapped["Scanner"] = relationship(
        "Scanner", back_populates="gvm_metadata_entries"
    )
