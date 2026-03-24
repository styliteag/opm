"""Add phases JSON column to networks.

Stores multi-phase scan pipeline configuration per network.
Null means use legacy scanner_type behavior.

Revision ID: 003
Revises: 002
Create Date: 2026-03-24

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
        "networks",
        sa.Column("phases", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("networks", "phases")
