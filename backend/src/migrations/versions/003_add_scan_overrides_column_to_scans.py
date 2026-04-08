"""add scan_overrides column to scans

Revision ID: 3c597f90f9a7
Revises: 002
Create Date: 2026-04-06 14:12:55.021282

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scans",
        sa.Column(
            "scan_overrides",
            sa.JSON(),
            nullable=True,
            comment="Per-scan overrides for port_spec, scanner_type, rate, protocol, timeouts",
        ),
    )


def downgrade() -> None:
    op.drop_column("scans", "scan_overrides")
