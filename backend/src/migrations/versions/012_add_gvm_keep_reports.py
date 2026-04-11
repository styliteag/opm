"""add gvm_keep_reports to networks

Adds a per-network opt-out flag controlling whether the OPM scanner deletes
the GVM task/target/report after a Greenbone scan completes. Default is to
KEEP the objects so they remain visible in the GSA web UI.

Revision ID: 012
Revises: 011
Create Date: 2026-04-11 13:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "012"
down_revision: Union[str, None] = "011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check whether a column already exists (dev envs may pre-create via create_all)."""
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
    if not _column_exists("networks", "gvm_keep_reports"):
        op.add_column(
            "networks",
            sa.Column(
                "gvm_keep_reports",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                comment="Keep GVM task/target/report in Greenbone after scan",
            ),
        )


def downgrade() -> None:
    if _column_exists("networks", "gvm_keep_reports"):
        op.drop_column("networks", "gvm_keep_reports")
