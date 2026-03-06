"""Add severity_override column to alerts.

Revision ID: 013
Revises: 012
Create Date: 2026-03-06 00:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "alerts",
        sa.Column("severity_override", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("alerts", "severity_override")
