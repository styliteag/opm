"""deduplicate port rules and add unique constraints

Revision ID: 009
Revises: 008
Create Date: 2026-03-03 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '009'
down_revision = '008'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Remove duplicate global port rules, keeping the oldest (lowest id)
    op.execute(sa.text("""
        DELETE g1 FROM global_port_rules g1
        INNER JOIN global_port_rules g2
        ON COALESCE(g1.ip, '') = COALESCE(g2.ip, '')
            AND g1.port = g2.port
            AND g1.rule_type = g2.rule_type
            AND g1.id > g2.id
    """))

    # Remove duplicate network port rules, keeping the oldest (lowest id)
    op.execute(sa.text("""
        DELETE p1 FROM port_rules p1
        INNER JOIN port_rules p2
        ON p1.network_id = p2.network_id
            AND COALESCE(p1.ip, '') = COALESCE(p2.ip, '')
            AND p1.port = p2.port
            AND p1.rule_type = p2.rule_type
            AND p1.id > p2.id
    """))

    # MariaDB does not support functional indexes. Use a generated
    # (virtual) column that normalizes NULL ip to '' so we can build
    # a regular UNIQUE index on it.

    # --- global_port_rules ---
    op.execute(sa.text("""
        ALTER TABLE global_port_rules
        ADD COLUMN ip_key VARCHAR(45) AS (COALESCE(ip, '')) STORED
    """))
    op.create_unique_constraint(
        'uq_global_port_rules_ip_port_type',
        'global_port_rules',
        ['ip_key', 'port', 'rule_type'],
    )

    # --- port_rules ---
    op.execute(sa.text("""
        ALTER TABLE port_rules
        ADD COLUMN ip_key VARCHAR(45) AS (COALESCE(ip, '')) STORED
    """))
    op.create_unique_constraint(
        'uq_port_rules_network_ip_port_type',
        'port_rules',
        ['network_id', 'ip_key', 'port', 'rule_type'],
    )


def downgrade() -> None:
    op.drop_constraint('uq_port_rules_network_ip_port_type', 'port_rules', type_='unique')
    op.drop_column('port_rules', 'ip_key')
    op.drop_constraint('uq_global_port_rules_ip_port_type', 'global_port_rules', type_='unique')
    op.drop_column('global_port_rules', 'ip_key')
