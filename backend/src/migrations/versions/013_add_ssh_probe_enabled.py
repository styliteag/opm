"""add ssh_probe_enabled to networks

Adds a per-network opt-out flag controlling whether the scanner runs SSH
probes (ssh-audit + nmap ssh-auth-methods) on open ports after the port
scan phase. Default is enabled to preserve the previous always-on
behaviour; operators who want to suppress SSH probing per-network can now
flip this off.

Revision ID: 013
Revises: 012
Create Date: 2026-04-11 14:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "013"
down_revision: Union[str, None] = "012"
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
    if not _column_exists("networks", "ssh_probe_enabled"):
        op.add_column(
            "networks",
            sa.Column(
                "ssh_probe_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("1"),
                comment="Run SSH probe (ssh-audit + auth methods) on open ports after port scan",
            ),
        )


def downgrade() -> None:
    if _column_exists("networks", "ssh_probe_enabled"):
        op.drop_column("networks", "ssh_probe_enabled")
