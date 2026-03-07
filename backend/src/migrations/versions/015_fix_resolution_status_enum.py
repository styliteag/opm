"""Fix resolution_status enum to include fix_planned.

Revision ID: 015
Revises: 014
Create Date: 2026-03-07 00:00:00.000000

"""
from alembic import op

# revision identifiers, used by Alembic.
revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE alerts MODIFY COLUMN resolution_status "
        "ENUM('open','in_progress','resolved','fix_planned') NOT NULL DEFAULT 'open'"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE alerts MODIFY COLUMN resolution_status "
        "ENUM('open','in_progress','resolved') NOT NULL DEFAULT 'open'"
    )
