"""add target_ip to scans

Revision ID: 006
Revises: 005
Create Date: 2026-02-02 15:45:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '006'
down_revision = '005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add target_ip column to scans table
    op.add_column('scans', sa.Column('target_ip', sa.Text(), nullable=True, comment='Target IP for single-host scan; NULL for full network scan'))


def downgrade() -> None:
    # Remove target_ip column from scans table
    op.drop_column('scans', 'target_ip')
