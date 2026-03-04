"""rename rule types allow/block to accepted/critical

Revision ID: 010
Revises: 009
Create Date: 2026-03-03 18:00:00.000000

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = '010'
down_revision = '009'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Step 1: Expand ENUM to accept both old and new values
    op.execute(sa.text(
        "ALTER TABLE port_rules MODIFY COLUMN rule_type "
        "ENUM('allow','block','accepted','critical') NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE global_port_rules MODIFY COLUMN rule_type "
        "ENUM('allow','block','accepted','critical') NOT NULL"
    ))

    # Step 2: Migrate data
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

    # Step 3: Shrink ENUM to only new values
    op.execute(sa.text(
        "ALTER TABLE port_rules MODIFY COLUMN rule_type "
        "ENUM('accepted','critical') NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE global_port_rules MODIFY COLUMN rule_type "
        "ENUM('accepted','critical') NOT NULL"
    ))


def downgrade() -> None:
    op.execute(sa.text(
        "ALTER TABLE port_rules MODIFY COLUMN rule_type "
        "ENUM('allow','block','accepted','critical') NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE global_port_rules MODIFY COLUMN rule_type "
        "ENUM('allow','block','accepted','critical') NOT NULL"
    ))

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

    op.execute(sa.text(
        "ALTER TABLE port_rules MODIFY COLUMN rule_type "
        "ENUM('allow','block') NOT NULL"
    ))
    op.execute(sa.text(
        "ALTER TABLE global_port_rules MODIFY COLUMN rule_type "
        "ENUM('allow','block') NOT NULL"
    ))
