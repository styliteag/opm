"""Hostname lookup cache & rate-limit budget models.

Backs the SNI-aware reverse-IP hostname discovery pipeline. One
``HostnameLookup`` row per IP stores the full hostname list returned by
an external source (e.g. HackerTarget's ``reverseiplookup`` endpoint);
``HostnameLookupBudget`` tracks per-source daily API usage so the
background filler job can honour free-tier rate limits without writing
its own counter file.

The TTL lives on the row (``expires_at``) rather than being derived from
``queried_at`` + a global constant, so the filler service can apply
different retention policies per outcome — for example, a short TTL for
failed lookups that should retry soon, a medium TTL for `no_results`
entries that rarely change, and a long TTL for stable `success` rows.
"""

from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HostnameLookup(Base):
    """Cached reverse-IP hostname list for a single IP.

    Unique on ``ip`` — we store at most one row per IP and let the source
    column record provenance. If we ever introduce a second reverse-IP
    source that should merge with HackerTarget instead of overwriting,
    this schema will need a sub-table or a switch to ``UNIQUE(ip, source)``.
    """

    __tablename__ = "hostname_lookup_cache"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    ip: Mapped[str] = mapped_column(
        String(45), nullable=False, unique=True, index=True
    )
    hostnames_json: Mapped[list[str]] = mapped_column(
        JSON, nullable=False, default=list
    )
    source: Mapped[str] = mapped_column(
        String(32),
        nullable=False,
        comment="Provider that populated this row (e.g. 'hackertarget')",
    )
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        comment="'success' | 'no_results' | 'failed'",
    )
    queried_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class HostnameLookupBudget(Base):
    """Per-source, per-UTC-day API call counter.

    Filler job increments ``used`` atomically before each outbound call and
    refuses to proceed once ``used >= daily_limit`` for the current
    ``day``. A new row materialises automatically at UTC midnight; old
    rows stay as an audit trail and can be GC'd offline.
    """

    __tablename__ = "hostname_lookup_budget"
    __table_args__ = (
        UniqueConstraint("source", "day", name="uq_hostname_budget_source_day"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    day: Mapped[date] = mapped_column(Date, nullable=False)
    used: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
