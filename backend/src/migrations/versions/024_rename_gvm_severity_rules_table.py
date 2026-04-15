"""rename gvm_severity_rules table to severity_rules

Revision ID: 024_rename_severity_rules
Revises: 023_add_gvm_severity_rules
Create Date: 2026-04-15 19:55:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "024_rename_severity_rules"
down_revision: Union[str, None] = "023_add_gvm_severity_rules"
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


def _index_exists(index_name: str, table_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name "
            "AND index_name = :index_name"
        ),
        {"table_name": table_name, "index_name": index_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def _table_count(table_name: str) -> int:
    conn = op.get_bind()
    result = conn.execute(sa.text(f"SELECT COUNT(*) FROM {table_name}"))
    row = result.fetchone()
    return int(row[0] if row else 0)


def upgrade() -> None:
    if _table_exists("severity_rules") and _table_exists("gvm_severity_rules"):
        if _table_count("severity_rules") == 0 and _table_count("gvm_severity_rules") > 0:
            columns = (
                "id, oid, network_id, severity_override, "
                "reason, created_by_user_id, created_at, updated_at"
            )
            op.execute(
                f"INSERT IGNORE INTO severity_rules ({columns}) "
                f"SELECT {columns} FROM gvm_severity_rules"
            )
        return
    if _table_exists("severity_rules"):
        return
    if not _table_exists("gvm_severity_rules"):
        return

    op.rename_table("gvm_severity_rules", "severity_rules")
    op.execute(
        "ALTER TABLE severity_rules "
        "RENAME INDEX uq_gvm_severity_rules_oid_network "
        "TO uq_severity_rules_oid_network"
    )
    if _index_exists("ix_gvm_severity_rules_oid", "severity_rules"):
        op.execute(
            "ALTER TABLE severity_rules "
            "RENAME INDEX ix_gvm_severity_rules_oid TO ix_severity_rules_oid"
        )
    if _index_exists("ix_gvm_severity_rules_network_id", "severity_rules"):
        op.execute(
            "ALTER TABLE severity_rules "
            "RENAME INDEX ix_gvm_severity_rules_network_id "
            "TO ix_severity_rules_network_id"
        )


def downgrade() -> None:
    if _table_exists("gvm_severity_rules"):
        return
    if not _table_exists("severity_rules"):
        return

    op.execute(
        "ALTER TABLE severity_rules "
        "RENAME INDEX uq_severity_rules_oid_network "
        "TO uq_gvm_severity_rules_oid_network"
    )
    if _index_exists("ix_severity_rules_oid", "severity_rules"):
        op.execute(
            "ALTER TABLE severity_rules "
            "RENAME INDEX ix_severity_rules_oid TO ix_gvm_severity_rules_oid"
        )
    if _index_exists("ix_severity_rules_network_id", "severity_rules"):
        op.execute(
            "ALTER TABLE severity_rules "
            "RENAME INDEX ix_severity_rules_network_id "
            "TO ix_gvm_severity_rules_network_id"
        )
    op.rename_table("severity_rules", "gvm_severity_rules")
