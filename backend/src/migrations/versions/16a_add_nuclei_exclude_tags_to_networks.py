"""add nuclei_exclude_tags to networks

Revision ID: 0729132be31f
Revises: 016
Create Date: 2026-04-12 13:52:06.081240

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '16a'
down_revision: Union[str, None] = '016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'networks',
        sa.Column(
            'nuclei_exclude_tags',
            sa.String(length=255),
            nullable=True,
            comment='Comma-separated nuclei template tags to exclude (empty = scanner default)',
        ),
    )


def downgrade() -> None:
    op.drop_column('networks', 'nuclei_exclude_tags')
