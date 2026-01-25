"""Add global_open_ports and global_port_rules tables.

Revision ID: 001_add_global_tables
Revises:
Create Date: 2026-01-25

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "001_add_global_tables"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create global_open_ports table
    op.create_table(
        "global_open_ports",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ip", sa.String(45), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("protocol", sa.String(10), nullable=False, server_default="tcp"),
        sa.Column("banner", sa.Text(), nullable=True),
        sa.Column("service_guess", sa.String(100), nullable=True),
        sa.Column("mac_address", sa.String(17), nullable=True),
        sa.Column("mac_vendor", sa.String(255), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("seen_by_networks", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ip", "port", "protocol", name="uq_global_open_ports_ip_port_protocol"),
    )
    op.create_index("ix_global_open_ports_ip", "global_open_ports", ["ip"])
    op.create_index("ix_global_open_ports_port", "global_open_ports", ["port"])
    op.create_index("ix_global_open_ports_ip_port", "global_open_ports", ["ip", "port"])

    # Create global_port_rules table
    op.create_table(
        "global_port_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("port", sa.String(20), nullable=False),
        sa.Column(
            "rule_type",
            sa.Enum("allow", "block", name="globalruletype"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_global_port_rules_ip", "global_port_rules", ["ip"])
    op.create_index("ix_global_port_rules_created_by", "global_port_rules", ["created_by"])

    # Add global_open_port_id to alerts table
    op.add_column(
        "alerts",
        sa.Column("global_open_port_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_alerts_global_open_port_id",
        "alerts",
        "global_open_ports",
        ["global_open_port_id"],
        ["id"],
    )
    op.create_index("ix_alerts_global_open_port_id", "alerts", ["global_open_port_id"])

    # Make scan_id nullable (for global alerts)
    op.alter_column("alerts", "scan_id", existing_type=sa.Integer(), nullable=True)

    # Make network_id nullable (for global alerts)
    op.alter_column("alerts", "network_id", existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Make network_id non-nullable again
    op.alter_column("alerts", "network_id", existing_type=sa.Integer(), nullable=False)

    # Make scan_id non-nullable again
    op.alter_column("alerts", "scan_id", existing_type=sa.Integer(), nullable=False)

    # Remove global_open_port_id from alerts
    op.drop_index("ix_alerts_global_open_port_id", table_name="alerts")
    op.drop_constraint("fk_alerts_global_open_port_id", "alerts", type_="foreignkey")
    op.drop_column("alerts", "global_open_port_id")

    # Drop global_port_rules table
    op.drop_index("ix_global_port_rules_created_by", table_name="global_port_rules")
    op.drop_index("ix_global_port_rules_ip", table_name="global_port_rules")
    op.drop_table("global_port_rules")

    # Drop enum type
    op.execute("DROP TYPE IF EXISTS globalruletype")

    # Drop global_open_ports table
    op.drop_index("ix_global_open_ports_ip_port", table_name="global_open_ports")
    op.drop_index("ix_global_open_ports_port", table_name="global_open_ports")
    op.drop_index("ix_global_open_ports_ip", table_name="global_open_ports")
    op.drop_table("global_open_ports")
