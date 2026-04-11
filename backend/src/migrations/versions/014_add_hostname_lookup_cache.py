"""add hostname lookup cache and budget tables

Two new tables backing the SNI-aware reverse-IP hostname cache:

- `hostname_lookup_cache`: one row per IP, holds the full list of hostnames
  returned by an external reverse-IP source (e.g. HackerTarget). `status`
  distinguishes success / no_results / failed; `expires_at` drives the
  background refresh job. Keeping no_results + failed cached (with shorter
  TTL, decided service-side) avoids burning the daily API budget on dead
  IPs.
- `hostname_lookup_budget`: per-source, per-UTC-day API call counter, used
  by the filler job to enforce free-tier rate limits (e.g. HackerTarget's
  20 req/day without API key).

Motivated by: SNI fan-out for nuclei — a Plesk-style shared-hosting IP may
serve 100+ vhosts, and we need the real hostname list per IP so nuclei can
hit each vhost individually instead of only probing the default cert.

Revision ID: 014
Revises: 013
Create Date: 2026-04-11 19:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "014"
down_revision: Union[str, None] = "013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    """Check whether a table already exists."""
    conn = op.get_bind()
    result = conn.execute(sa.text(f"SHOW TABLES LIKE '{table_name}'"))
    return result.fetchone() is not None


def upgrade() -> None:
    if not _table_exists("hostname_lookup_cache"):
        op.create_table(
            "hostname_lookup_cache",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "ip",
                sa.String(45),
                nullable=False,
                unique=True,
                index=True,
                comment="IPv4 or IPv6 address — unique cache key",
            ),
            sa.Column(
                "hostnames_json",
                sa.JSON,
                nullable=False,
                comment="Full list of hostnames returned by source (possibly empty)",
            ),
            sa.Column(
                "source",
                sa.String(32),
                nullable=False,
                comment="Provider that populated this row (e.g. 'hackertarget')",
            ),
            sa.Column(
                "status",
                sa.String(16),
                nullable=False,
                comment="'success' | 'no_results' | 'failed'",
            ),
            sa.Column(
                "queried_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.text("utc_timestamp()"),
            ),
            sa.Column(
                "expires_at",
                sa.DateTime,
                nullable=False,
                index=True,
                comment="Row refresh deadline; background filler re-queries after this",
            ),
            sa.Column(
                "error_message",
                sa.Text,
                nullable=True,
                comment="Populated only when status='failed'",
            ),
        )

    if not _table_exists("hostname_lookup_budget"):
        op.create_table(
            "hostname_lookup_budget",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "source",
                sa.String(32),
                nullable=False,
                comment="Provider name (e.g. 'hackertarget')",
            ),
            sa.Column(
                "day",
                sa.Date,
                nullable=False,
                comment="UTC date bucket — one row per source per day",
            ),
            sa.Column(
                "used",
                sa.Integer,
                nullable=False,
                server_default=sa.text("0"),
                comment="Number of API calls consumed today",
            ),
            sa.UniqueConstraint(
                "source", "day", name="uq_hostname_budget_source_day"
            ),
        )


def downgrade() -> None:
    if _table_exists("hostname_lookup_budget"):
        op.drop_table("hostname_lookup_budget")
    if _table_exists("hostname_lookup_cache"):
        op.drop_table("hostname_lookup_cache")
