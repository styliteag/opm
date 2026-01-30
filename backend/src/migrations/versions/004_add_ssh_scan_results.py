"""Add ssh_scan_results table for SSH security scanning.

Revision ID: 004
Revises: 003
Create Date: 2026-01-30

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ssh_scan_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scan_id", sa.Integer(), nullable=False),
        sa.Column("host_ip", sa.String(45), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="22"),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        # Authentication methods
        sa.Column(
            "publickey_enabled", sa.Boolean(), nullable=False, server_default="0"
        ),
        sa.Column("password_enabled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column(
            "keyboard_interactive_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="0",
        ),
        # SSH metadata
        sa.Column("ssh_version", sa.String(100), nullable=True),
        sa.Column("protocol_version", sa.String(20), nullable=True),
        sa.Column("server_banner", sa.Text(), nullable=True),
        # JSON fields for cryptographic algorithms
        sa.Column("supported_ciphers", sa.JSON(), nullable=True),
        sa.Column("kex_algorithms", sa.JSON(), nullable=True),
        sa.Column("host_key_types", sa.JSON(), nullable=True),
        sa.Column("mac_algorithms", sa.JSON(), nullable=True),
        # Keys and constraints
        sa.ForeignKeyConstraint(
            ["scan_id"], ["scans.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ssh_scan_results_scan_id", "ssh_scan_results", ["scan_id"])
    op.create_index("ix_ssh_scan_results_host_ip", "ssh_scan_results", ["host_ip"])


def downgrade() -> None:
    op.drop_index("ix_ssh_scan_results_host_ip", table_name="ssh_scan_results")
    op.drop_index("ix_ssh_scan_results_scan_id", table_name="ssh_scan_results")
    op.drop_table("ssh_scan_results")
