"""rename rule types allow/block to accepted/critical

Revision ID: 010
Revises: 009
Create Date: 2026-03-03 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text(
        "UPDATE port_rules SET rule_type = 'accepted' WHERE rule_type = 'allow'"
    ))
    op.execute(sa.text(
        "UPDATE port_rules SET rule_type = 'critical' WHERE rule_type = 'block'"
    ))
    op.execute(sa.text(
        "UPDATE global_port_rules SET rule_type = 'accepted' WHERE rule_type = 'allow'"
    ))
    op.execute(sa.text(
        "UPDATE global_port_rules SET rule_type = 'critical' WHERE rule_type = 'block'"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "UPDATE port_rules SET rule_type = 'allow' WHERE rule_type = 'accepted'"
    ))
    op.execute(sa.text(
        "UPDATE port_rules SET rule_type = 'block' WHERE rule_type = 'critical'"
    ))
    op.execute(sa.text(
        "UPDATE global_port_rules SET rule_type = 'allow' WHERE rule_type = 'accepted'"
    ))
    op.execute(sa.text(
        "UPDATE global_port_rules SET rule_type = 'block' WHERE rule_type = 'critical'"
    ))
