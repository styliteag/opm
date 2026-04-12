"""add unified scanner kind

The scanners.kind column is String(20), so it already accepts
'unified' without a schema change. This migration updates the
column comment to document the third supported value.

Revision ID: 017
Revises: 16a
Create Date: 2026-04-12

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "017"
down_revision: Union[str, None] = "16a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "scanners",
        "kind",
        existing_type=sa.String(20),
        existing_nullable=False,
        existing_server_default="standard",
        comment="Scanner kind: 'standard', 'gvm', or 'unified' (standard + gvm)",
    )


def downgrade() -> None:
    op.alter_column(
        "scanners",
        "kind",
        existing_type=sa.String(20),
        existing_nullable=False,
        existing_server_default="standard",
        comment="Scanner kind: 'standard' (masscan/nmap/nse) or 'gvm' (greenbone bridge)",
    )
