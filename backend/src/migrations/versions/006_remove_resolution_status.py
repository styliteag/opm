"""remove resolution_status column from alerts

Revision ID: 006
Revises: 005
Create Date: 2026-04-09

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("alerts", "resolution_status")


def downgrade() -> None:
    op.add_column(
        "alerts",
        sa.Column(
            "resolution_status",
            sa.Enum("open", "in_progress", "resolved", "fix_planned", name="resolutionstatus"),
            nullable=False,
            server_default="open",
        ),
    )
