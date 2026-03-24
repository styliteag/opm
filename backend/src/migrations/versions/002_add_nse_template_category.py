"""Add category column to nse_templates.

Revision ID: 002
Revises: 001
Create Date: 2026-03-24

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
    op.add_column(
        "nse_templates",
        sa.Column("category", sa.String(50), nullable=True),
    )
    op.create_index("ix_nse_templates_category", "nse_templates", ["category"])


def downgrade() -> None:
    op.drop_index("ix_nse_templates_category", table_name="nse_templates")
    op.drop_column("nse_templates", "category")
