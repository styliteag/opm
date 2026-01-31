"""Add alert_comments table.

Revision ID: 002
Revises: 001
Create Date: 2026-01-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists on a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = inspector.get_indexes(table_name)
    return any(idx["name"] == index_name for idx in indexes)


def upgrade() -> None:
    # Create alert_comments table (idempotent)
    if not table_exists("alert_comments"):
        op.create_table(
            "alert_comments",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("alert_id", sa.Integer(), nullable=False),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("comment", sa.Text(), nullable=False),
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    if not index_exists("alert_comments", "ix_alert_comments_alert_id"):
        op.create_index("ix_alert_comments_alert_id", "alert_comments", ["alert_id"])
    if not index_exists("alert_comments", "ix_alert_comments_user_id"):
        op.create_index("ix_alert_comments_user_id", "alert_comments", ["user_id"])


def downgrade() -> None:
    # Drop alert_comments table
    op.drop_index("ix_alert_comments_user_id", table_name="alert_comments")
    op.drop_index("ix_alert_comments_alert_id", table_name="alert_comments")
    op.drop_table("alert_comments")
