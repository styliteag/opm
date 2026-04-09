"""add source_key to alerts for stable source-side dedupe

Revision ID: 009
Revises: 008
Create Date: 2026-04-10 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("alerts", sa.Column("source_key", sa.String(length=255), nullable=True))
    op.create_index(op.f("ix_alerts_source_key"), "alerts", ["source_key"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_alerts_source_key"), table_name="alerts")
    op.drop_column("alerts", "source_key")
