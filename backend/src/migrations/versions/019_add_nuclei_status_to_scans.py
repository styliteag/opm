"""add nuclei_status to scans

Revision ID: 019_add_nuclei_status_to_scans
Revises: 018_add_scanner_api_key_id
Create Date: 2026-04-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "019_add_nuclei_status_to_scans"
down_revision: str | Sequence[str] | None = "018_add_scanner_api_key_id"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "scans",
        sa.Column("nuclei_status", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scans", "nuclei_status")
