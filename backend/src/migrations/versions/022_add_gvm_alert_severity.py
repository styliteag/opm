"""add gvm_alert_severity column to networks

Adds a per-network minimum severity threshold for GVM alert generation,
mirroring the existing ``nuclei_severity`` knob. Null means "medium"
(matches legacy behavior).

Revision ID: 022
Revises: 021
Create Date: 2026-04-15 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "022_add_gvm_alert_severity"
down_revision: Union[str, None] = "021_widen_scan_schedule_column"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name AND column_name = :column_name"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def upgrade() -> None:
    if not _column_exists("networks", "gvm_alert_severity"):
        op.add_column(
            "networks",
            sa.Column(
                "gvm_alert_severity",
                sa.String(16),
                nullable=True,
                comment="Minimum GVM severity to raise alerts: "
                "info/low/medium/high/critical (null = medium)",
            ),
        )


def downgrade() -> None:
    if _column_exists("networks", "gvm_alert_severity"):
        op.drop_column("networks", "gvm_alert_severity")
