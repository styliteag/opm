"""rename acknowledged/ack_reason to dismissed/dismiss_reason

Revision ID: 011
Revises: 010
Create Date: 2026-03-05 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "alerts",
        "acknowledged",
        new_column_name="dismissed",
        existing_type=sa.Boolean(),
        existing_nullable=False,
    )
    op.alter_column(
        "alerts",
        "ack_reason",
        new_column_name="dismiss_reason",
        existing_type=sa.Text(),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "alerts",
        "dismissed",
        new_column_name="acknowledged",
        existing_type=sa.Boolean(),
        existing_nullable=False,
    )
    op.alter_column(
        "alerts",
        "dismiss_reason",
        new_column_name="ack_reason",
        existing_type=sa.Text(),
        existing_nullable=True,
    )
