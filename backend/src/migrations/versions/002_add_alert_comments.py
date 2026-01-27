"""Add alert_comments table.

Revision ID: 002
Revises: 001
Create Date: 2026-01-27

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create alert_comments table
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
    op.create_index("ix_alert_comments_alert_id", "alert_comments", ["alert_id"])
    op.create_index("ix_alert_comments_user_id", "alert_comments", ["user_id"])


def downgrade() -> None:
    # Drop alert_comments table
    op.drop_index("ix_alert_comments_user_id", table_name="alert_comments")
    op.drop_index("ix_alert_comments_alert_id", table_name="alert_comments")
    op.drop_table("alert_comments")
