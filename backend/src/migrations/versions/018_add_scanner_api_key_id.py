"""add scanner api key id

Revision ID: 018_add_scanner_api_key_id
Revises: 017
Create Date: 2026-04-13
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "018_add_scanner_api_key_id"
down_revision: str | Sequence[str] | None = "017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("scanners", sa.Column("api_key_id", sa.String(length=32), nullable=True))
    op.create_index(op.f("ix_scanners_api_key_id"), "scanners", ["api_key_id"], unique=True)


def downgrade() -> None:
    op.drop_index(op.f("ix_scanners_api_key_id"), table_name="scanners")
    op.drop_column("scanners", "api_key_id")
