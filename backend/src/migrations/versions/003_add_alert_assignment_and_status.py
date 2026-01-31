"""Add assignment and resolution status fields to alerts table.

Revision ID: 003
Revises: 002
Create Date: 2026-01-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists on a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = inspector.get_indexes(table_name)
    return any(idx["name"] == index_name for idx in indexes)


def fk_exists(table_name: str, fk_name: str) -> bool:
    """Check if a foreign key constraint exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    fks = inspector.get_foreign_keys(table_name)
    return any(fk["name"] == fk_name for fk in fks)


def upgrade() -> None:
    # Add assigned_to_user_id column (nullable FK to users) - idempotent
    if not column_exists("alerts", "assigned_to_user_id"):
        op.add_column(
            "alerts",
            sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        )
    if not fk_exists("alerts", "fk_alerts_assigned_to_user_id"):
        op.create_foreign_key(
            "fk_alerts_assigned_to_user_id",
            "alerts",
            "users",
            ["assigned_to_user_id"],
            ["id"],
        )
    if not index_exists("alerts", "ix_alerts_assigned_to_user_id"):
        op.create_index(
            "ix_alerts_assigned_to_user_id", "alerts", ["assigned_to_user_id"]
        )

    # Add resolution_status column (enum: open/in_progress/resolved, default open) - idempotent
    if not column_exists("alerts", "resolution_status"):
        op.add_column(
            "alerts",
            sa.Column(
                "resolution_status",
                sa.Enum("open", "in_progress", "resolved", name="resolution_status_enum"),
                nullable=False,
                server_default="open",
            ),
        )
    if not index_exists("alerts", "ix_alerts_resolution_status"):
        op.create_index("ix_alerts_resolution_status", "alerts", ["resolution_status"])


def downgrade() -> None:
    # Drop resolution_status column and enum
    op.drop_index("ix_alerts_resolution_status", table_name="alerts")
    op.drop_column("alerts", "resolution_status")
    # Drop the enum type in MySQL (not needed but good practice for PostgreSQL)
    op.execute("DROP TYPE IF EXISTS resolution_status_enum")

    # Drop assigned_to_user_id column and FK
    op.drop_index("ix_alerts_assigned_to_user_id", table_name="alerts")
    op.drop_constraint("fk_alerts_assigned_to_user_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "assigned_to_user_id")
