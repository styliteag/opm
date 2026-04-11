"""add hostname lookup queue table

Backs the on-demand manual hostname lookup pipeline. Operators can
trigger a reverse-IP lookup for a single host from the UI; the request
is enqueued here and the next scanner poll picks it up, runs the
HackerTarget / RapidDNS chain against the IP, posts results to
``hostname_lookup_cache``, and marks the queue row completed.

This table is the missing handoff between the **backend** (which owns
storage + manual edit + observability) and the **scanner** (which is
the only egress point for external hostname API calls in the new
scanner-centric architecture). Multiple pending rows for the same IP
are allowed — de-duplication happens client-side at claim time, since
MariaDB < 10.5 cannot enforce a partial unique index on
``(ip, status='pending')``.

Lifecycle:

- ``pending``  — newly enqueued, waiting for a scanner to claim
- ``claimed``  — a scanner has reserved the row and is processing it.
                 Rows stuck in this state for > 1 hour get re-queued
                 lazily on the next read (no scheduled sweep)
- ``completed``— scanner posted results and called ``/complete``.
                 Kept for 7 days as audit trail, then GC'd lazily
- ``failed``   — scanner could not enrich (budget exhausted, network
                 error, all sources returned no results). Same 7-day
                 retention as completed

Revision ID: 016
Revises: 015
Create Date: 2026-04-11 21:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "016"
down_revision: Union[str, None] = "015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    """Check whether a table already exists."""
    conn = op.get_bind()
    result = conn.execute(sa.text(f"SHOW TABLES LIKE '{table_name}'"))
    return result.fetchone() is not None


def upgrade() -> None:
    if not _table_exists("hostname_lookup_queue"):
        op.create_table(
            "hostname_lookup_queue",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "ip",
                sa.String(45),
                nullable=False,
                comment="IPv4 or IPv6 address to enrich",
            ),
            sa.Column(
                "requested_by_user_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
                comment="User who triggered the manual lookup; null for system-enqueued jobs",
            ),
            sa.Column(
                "requested_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.text("utc_timestamp()"),
            ),
            sa.Column(
                "claimed_at",
                sa.DateTime,
                nullable=True,
                comment="Set when a scanner reserves the row via /claim",
            ),
            sa.Column(
                "completed_at",
                sa.DateTime,
                nullable=True,
                comment="Set when the scanner reports completion (success or failure)",
            ),
            sa.Column(
                "status",
                sa.String(16),
                nullable=False,
                server_default=sa.text("'pending'"),
                comment="'pending' | 'claimed' | 'completed' | 'failed'",
            ),
            sa.Column(
                "error_message",
                sa.Text,
                nullable=True,
                comment="Populated only when status='failed'",
            ),
            sa.Index(
                "idx_hostname_queue_status_requested",
                "status",
                "requested_at",
            ),
            sa.Index("idx_hostname_queue_ip", "ip"),
        )


def downgrade() -> None:
    if _table_exists("hostname_lookup_queue"):
        op.drop_table("hostname_lookup_queue")
