"""add ack_reason to alerts and user_comment to global_open_ports

Revision ID: 008
Revises: 007
Create Date: 2026-03-02 12:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '008'
down_revision = '007'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('alerts', sa.Column('ack_reason', sa.Text(), nullable=True))
    op.add_column('global_open_ports', sa.Column('user_comment', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('global_open_ports', 'user_comment')
    op.drop_column('alerts', 'ack_reason')
