"""add is_active column to users

Revision ID: 004
Revises: 003
Create Date: 2026-04-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
    )


def downgrade() -> None:
    op.drop_column("users", "is_active")
