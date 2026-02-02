"""Add global_settings table for application configuration.

Revision ID: 006
Revises: 005
Create Date: 2026-02-02

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create global_settings table
    op.create_table(
        "global_settings",
        sa.Column("key", sa.String(length=255), nullable=False),
        sa.Column("value", mysql.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    # Drop global_settings table
    op.drop_table("global_settings")
