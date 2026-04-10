"""GVM configuration library — user-uploaded scan configs and port lists as XML."""

from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.user import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


class GvmLibraryEntry(Base):
    """A library-stored GVM XML artifact (scan_config or port_list).

    OPM is the source of truth for uploaded configs. The XML is pushed into
    a target GVM scanner on-demand before a scan that references it by name.
    """

    __tablename__ = "gvm_config_library"
    __table_args__ = (
        UniqueConstraint("kind", "name", name="uq_gvm_library_kind_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="'scan_config' or 'port_list'",
    )
    name: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        comment="Identity key across all GVM scanners — extracted from XML <name>",
    )
    xml_blob: Mapped[str] = mapped_column(
        Text(length=(1 << 24) - 1),  # MEDIUMTEXT (16 MB) — 5 MB cap enforced at upload
        nullable=False,
    )
    xml_hash: Mapped[str] = mapped_column(
        String(64),
        nullable=False,
        comment="sha256 of xml_blob — used for drift detection on scanners",
    )
    uploaded_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=_now,
        server_default=func.utc_timestamp(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=_now,
        onupdate=_now,
        server_default=func.utc_timestamp(),
    )

    uploaded_by: Mapped["User | None"] = relationship("User", lazy="joined")
