"""Add host discovery tables and fields.

Revision ID: 001
Revises:
Create Date: 2025-01-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def column_exists(table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col["name"] for col in inspector.get_columns(table_name)]
    return column_name in columns


def index_exists(table_name: str, index_name: str) -> bool:
    """Check if an index exists on a table."""
    bind = op.get_bind()
    inspector = inspect(bind)
    indexes = inspector.get_indexes(table_name)
    return any(idx["name"] == index_name for idx in indexes)


def fk_exists(table_name: str, fk_name: str) -> bool:
    """Check if a foreign key constraint exists."""
    bind = op.get_bind()
    inspector = inspect(bind)
    fks = inspector.get_foreign_keys(table_name)
    return any(fk["name"] == fk_name for fk in fks)


def upgrade() -> None:
    # Create hosts table (idempotent)
    if not table_exists("hosts"):
        op.create_table(
            "hosts",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("ip", sa.String(45), nullable=False),
            sa.Column("hostname", sa.String(255), nullable=True),
            sa.Column("is_pingable", sa.Boolean(), nullable=True),
            sa.Column("mac_address", sa.String(17), nullable=True),
            sa.Column("mac_vendor", sa.String(255), nullable=True),
            sa.Column(
                "first_seen_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "last_seen_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column("user_comment", sa.Text(), nullable=True),
            sa.Column("seen_by_networks", sa.JSON(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("ip", name="uq_hosts_ip"),
        )
    if not index_exists("hosts", "ix_hosts_ip"):
        op.create_index("ix_hosts_ip", "hosts", ["ip"], unique=True)

    # Create host_discovery_scans table (idempotent)
    if not table_exists("host_discovery_scans"):
        op.create_table(
            "host_discovery_scans",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("scanner_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                sa.Enum(
                    "planned", "running", "completed", "failed",
                    name="hostdiscoveryscanstatus"
                ),
                nullable=False,
                server_default="planned",
            ),
            sa.Column(
                "trigger_type",
                sa.Enum("manual", "scheduled", name="hostdiscoverytriggertype"),
                nullable=False,
                server_default="manual",
            ),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("hosts_discovered", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["scanner_id"], ["scanners.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
    if not index_exists("host_discovery_scans", "ix_host_discovery_scans_network_id"):
        op.create_index(
            "ix_host_discovery_scans_network_id", "host_discovery_scans", ["network_id"]
        )
    if not index_exists("host_discovery_scans", "ix_host_discovery_scans_scanner_id"):
        op.create_index(
            "ix_host_discovery_scans_scanner_id", "host_discovery_scans", ["scanner_id"]
        )
    if not index_exists("host_discovery_scans", "ix_host_discovery_scans_status"):
        op.create_index("ix_host_discovery_scans_status", "host_discovery_scans", ["status"])

    # Add host_id column to global_open_ports (idempotent)
    if not column_exists("global_open_ports", "host_id"):
        op.add_column(
            "global_open_ports",
            sa.Column("host_id", sa.Integer(), nullable=True),
        )
    if not index_exists("global_open_ports", "ix_global_open_ports_host_id"):
        op.create_index("ix_global_open_ports_host_id", "global_open_ports", ["host_id"])
    if not fk_exists("global_open_ports", "fk_global_open_ports_host_id"):
        op.create_foreign_key(
            "fk_global_open_ports_host_id",
            "global_open_ports",
            "hosts",
            ["host_id"],
            ["id"],
        )

    # Add host_discovery_enabled column to networks (idempotent)
    if not column_exists("networks", "host_discovery_enabled"):
        op.add_column(
            "networks",
            sa.Column(
                "host_discovery_enabled",
                sa.Boolean(),
                nullable=False,
                server_default="1",
            ),
        )


def downgrade() -> None:
    # Remove host_discovery_enabled from networks
    op.drop_column("networks", "host_discovery_enabled")

    # Remove host_id from global_open_ports
    op.drop_constraint("fk_global_open_ports_host_id", "global_open_ports", type_="foreignkey")
    op.drop_index("ix_global_open_ports_host_id", table_name="global_open_ports")
    op.drop_column("global_open_ports", "host_id")

    # Drop host_discovery_scans table
    op.drop_index("ix_host_discovery_scans_status", table_name="host_discovery_scans")
    op.drop_index("ix_host_discovery_scans_scanner_id", table_name="host_discovery_scans")
    op.drop_index("ix_host_discovery_scans_network_id", table_name="host_discovery_scans")
    op.drop_table("host_discovery_scans")

    # Drop hosts table
    op.drop_index("ix_hosts_ip", table_name="hosts")
    op.drop_table("hosts")

    # Drop enum types
    op.execute("DROP TYPE IF EXISTS hostdiscoveryscanstatus")
    op.execute("DROP TYPE IF EXISTS hostdiscoverytriggertype")
