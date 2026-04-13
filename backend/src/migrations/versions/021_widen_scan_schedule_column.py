"""widen scan_schedule column for structured JSON schedules

The scan_schedule column previously held only 5/6-field cron strings
(max ~30 chars). Structured JSON schedules (e.g. monthly_nth with
weekday lists) can be longer. Widen to VARCHAR(255) for margin.

Revision ID: 021_widen_scan_schedule_column
Revises: 020_add_nuclei_alert_types
Create Date: 2026-04-14
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "021_widen_scan_schedule_column"
down_revision: str | Sequence[str] | None = "020_add_nuclei_alert_types"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "networks",
        "scan_schedule",
        type_=sa.String(255),
        existing_type=sa.String(100),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "networks",
        "scan_schedule",
        type_=sa.String(100),
        existing_type=sa.String(255),
        existing_nullable=True,
    )
