"""add gvm_severity_rules table

Per-OID severity overrides for GVM findings. A rule maps an OID (optionally
scoped to a network) to an override severity. The alert generator resolves
the effective severity via (network rule → global rule → native) and then
applies the network-level alert threshold.

Revision ID: 023_add_gvm_severity_rules
Revises: 022_add_gvm_alert_severity
Create Date: 2026-04-15 13:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "023_add_gvm_severity_rules"
down_revision: Union[str, None] = "022_add_gvm_alert_severity"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = :t"
        ),
        {"t": table_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def upgrade() -> None:
    if _table_exists("gvm_severity_rules"):
        return
    op.create_table(
        "gvm_severity_rules",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "oid",
            sa.String(255),
            nullable=False,
            comment="GVM NVT OID or nuclei composite 'template_id:matcher_name'",
        ),
        sa.Column(
            "network_id",
            sa.Integer(),
            sa.ForeignKey("networks.id", ondelete="CASCADE"),
            nullable=True,
            comment="Null = global rule; set = network-scoped rule",
        ),
        sa.Column(
            "severity_override",
            sa.String(16),
            nullable=False,
            comment="Effective severity: info/low/medium/high/critical",
        ),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column(
            "created_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.utc_timestamp(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            nullable=False,
            server_default=sa.func.utc_timestamp(),
            onupdate=sa.func.utc_timestamp(),
        ),
        sa.UniqueConstraint("oid", "network_id", name="uq_gvm_severity_rules_oid_network"),
    )
    op.create_index(
        "ix_gvm_severity_rules_oid",
        "gvm_severity_rules",
        ["oid"],
    )
    op.create_index(
        "ix_gvm_severity_rules_network_id",
        "gvm_severity_rules",
        ["network_id"],
    )


def downgrade() -> None:
    if not _table_exists("gvm_severity_rules"):
        return
    op.drop_index("ix_gvm_severity_rules_network_id", table_name="gvm_severity_rules")
    op.drop_index("ix_gvm_severity_rules_oid", table_name="gvm_severity_rules")
    op.drop_table("gvm_severity_rules")
