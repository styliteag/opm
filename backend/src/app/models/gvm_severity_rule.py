"""Per-OID severity override rules for GVM / nuclei findings."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.network import Network
    from app.models.user import User


class GvmSeverityRule(Base):
    """Rule that overrides a finding's severity based on its OID.

    Scope:
        * ``network_id is None`` -> global rule, applies to every network.
        * ``network_id`` set      -> network-scoped, overrides the global rule
          for that network only.

    Resolution order at alert time: network rule -> global rule -> native
    severity. The network's ``gvm_alert_severity`` threshold is then applied
    to the *resolved* severity.
    """

    __tablename__ = "gvm_severity_rules"
    __table_args__ = (
        UniqueConstraint("oid", "network_id", name="uq_gvm_severity_rules_oid_network"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    oid: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    network_id: Mapped[int | None] = mapped_column(
        ForeignKey("networks.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    severity_override: Mapped[str] = mapped_column(String(16), nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        server_default=func.utc_timestamp(),
        onupdate=func.utc_timestamp(),
    )

    network: Mapped["Network | None"] = relationship("Network", lazy="selectin")
    created_by: Mapped["User | None"] = relationship("User", lazy="selectin")
