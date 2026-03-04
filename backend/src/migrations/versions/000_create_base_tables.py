"""Create base tables for initial schema.

Revision ID: 000
Revises:
Create Date: 2025-01-25

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

# revision identifiers, used by Alembic.
revision: str = "000"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def table_exists(table_name: str) -> bool:
    """Check if a table exists in the database."""
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    # --- users (standalone) ---
    if not table_exists("users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column(
                "role",
                sa.Enum("admin", "viewer", name="userrole"),
                nullable=False,
                server_default="viewer",
            ),
            sa.Column(
                "theme_preference",
                sa.Enum("light", "dark", "system", name="themepreference"),
                nullable=False,
                server_default="system",
            ),
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("email", name="uq_users_email"),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    # --- scanners (standalone) ---
    if not table_exists("scanners"):
        op.create_table(
            "scanners",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("api_key_hash", sa.String(255), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(), nullable=True),
            sa.Column("scanner_version", sa.String(50), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("name", name="uq_scanners_name"),
        )

    # --- networks (FK -> scanners) ---
    if not table_exists("networks"):
        op.create_table(
            "networks",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("name", sa.String(255), nullable=False),
            sa.Column("cidr", sa.String(43), nullable=False),
            sa.Column("port_spec", sa.String(1000), nullable=False),
            sa.Column("scanner_id", sa.Integer(), nullable=False),
            sa.Column("scan_schedule", sa.String(100), nullable=True),
            sa.Column("scan_rate", sa.Integer(), nullable=True),
            sa.Column("scan_timeout", sa.Integer(), nullable=True, server_default="3600"),
            sa.Column("port_timeout", sa.Integer(), nullable=True, server_default="1500"),
            sa.Column(
                "scanner_type", sa.String(20), nullable=False, server_default="masscan"
            ),
            sa.Column(
                "scan_protocol", sa.String(10), nullable=False, server_default="tcp"
            ),
            sa.Column("alert_config", sa.JSON(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "updated_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["scanner_id"], ["scanners.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_networks_scanner_id", "networks", ["scanner_id"])

    # --- scans (FK -> networks, scanners, users) ---
    if not table_exists("scans"):
        op.create_table(
            "scans",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("scanner_id", sa.Integer(), nullable=False),
            sa.Column(
                "status",
                sa.Enum(
                    "planned", "running", "completed", "failed", "cancelled",
                    name="scanstatus",
                ),
                nullable=False,
                server_default="planned",
            ),
            sa.Column("started_at", sa.DateTime(), nullable=True),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_at", sa.DateTime(), nullable=True),
            sa.Column("cancelled_by", sa.Integer(), nullable=True),
            sa.Column("error_message", sa.Text(), nullable=True),
            sa.Column("progress_percent", sa.Float(), nullable=True),
            sa.Column("progress_message", sa.Text(), nullable=True),
            sa.Column(
                "trigger_type",
                sa.Enum("manual", "scheduled", name="triggertype"),
                nullable=False,
                server_default="manual",
            ),
            sa.Column(
                "hidden",
                sa.Boolean(),
                nullable=False,
                server_default="0",
            ),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["scanner_id"], ["scanners.id"]),
            sa.ForeignKeyConstraint(
                ["cancelled_by"], ["users.id"], ondelete="SET NULL"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_scans_network_id", "scans", ["network_id"])
        op.create_index("ix_scans_scanner_id", "scans", ["scanner_id"])
        op.create_index("ix_scans_status", "scans", ["status"])
        op.create_index("ix_scans_hidden", "scans", ["hidden"])

    # --- open_ports (FK -> scans) ---
    if not table_exists("open_ports"):
        op.create_table(
            "open_ports",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("scan_id", sa.Integer(), nullable=False),
            sa.Column("ip", sa.String(45), nullable=False),
            sa.Column("port", sa.Integer(), nullable=False),
            sa.Column("protocol", sa.String(10), nullable=False, server_default="tcp"),
            sa.Column("ttl", sa.Integer(), nullable=True),
            sa.Column("banner", sa.Text(), nullable=True),
            sa.Column("service_guess", sa.String(100), nullable=True),
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
            sa.ForeignKeyConstraint(["scan_id"], ["scans.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_open_ports_scan_id", "open_ports", ["scan_id"])
        op.create_index("ix_open_ports_ip", "open_ports", ["ip"])
        op.create_index("ix_open_ports_port", "open_ports", ["port"])

    # --- scan_logs (FK -> scans) ---
    if not table_exists("scan_logs"):
        op.create_table(
            "scan_logs",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("scan_id", sa.Integer(), nullable=False),
            sa.Column(
                "timestamp",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.Column(
                "level",
                sa.Enum("info", "warning", "error", name="loglevel"),
                nullable=False,
                server_default="info",
            ),
            sa.Column("message", sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(["scan_id"], ["scans.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_scan_logs_scan_id", "scan_logs", ["scan_id"])

    # --- global_open_ports (standalone at this point) ---
    if not table_exists("global_open_ports"):
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
            sa.Column("seen_by_networks", sa.JSON(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint(
                "ip", "port", "protocol", name="uq_global_open_ports_ip_port_protocol"
            ),
        )
        op.create_index("ix_global_open_ports_ip", "global_open_ports", ["ip"])
        op.create_index("ix_global_open_ports_port", "global_open_ports", ["port"])
        op.create_index(
            "ix_global_open_ports_ip_port", "global_open_ports", ["ip", "port"]
        )

    # --- alerts (FK -> scans, networks, global_open_ports) ---
    if not table_exists("alerts"):
        op.create_table(
            "alerts",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("scan_id", sa.Integer(), nullable=True),
            sa.Column("network_id", sa.Integer(), nullable=True),
            sa.Column("global_open_port_id", sa.Integer(), nullable=True),
            sa.Column(
                "alert_type",
                sa.Enum("new_port", "not_allowed", "blocked", name="alerttype"),
                nullable=False,
            ),
            sa.Column("ip", sa.String(45), nullable=False),
            sa.Column("port", sa.Integer(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("acknowledged", sa.Boolean(), nullable=False, server_default="0"),
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["scan_id"], ["scans.id"]),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.ForeignKeyConstraint(["global_open_port_id"], ["global_open_ports.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_alerts_scan_id", "alerts", ["scan_id"])
        op.create_index("ix_alerts_network_id", "alerts", ["network_id"])
        op.create_index("ix_alerts_global_open_port_id", "alerts", ["global_open_port_id"])
        op.create_index("ix_alerts_ip", "alerts", ["ip"])
        op.create_index("ix_alerts_port", "alerts", ["port"])

    # --- port_rules (FK -> networks) ---
    if not table_exists("port_rules"):
        op.create_table(
            "port_rules",
            sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
            sa.Column("network_id", sa.Integer(), nullable=False),
            sa.Column("ip", sa.String(45), nullable=True),
            sa.Column("port", sa.String(20), nullable=False),
            sa.Column(
                "rule_type",
                sa.Enum("allow", "block", name="ruletype"),
                nullable=False,
            ),
            sa.Column("description", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_port_rules_network_id", "port_rules", ["network_id"])
        op.create_index("ix_port_rules_ip", "port_rules", ["ip"])

    # --- global_port_rules (FK -> users) ---
    if not table_exists("global_port_rules"):
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
            sa.Column(
                "created_at",
                sa.DateTime(),
                server_default=sa.text("CURRENT_TIMESTAMP"),
                nullable=False,
            ),
            sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_global_port_rules_ip", "global_port_rules", ["ip"])
        op.create_index(
            "ix_global_port_rules_created_by", "global_port_rules", ["created_by"]
        )


def downgrade() -> None:
    op.drop_table("global_port_rules")
    op.drop_table("port_rules")
    op.drop_table("alerts")
    op.drop_table("global_open_ports")
    op.drop_table("scan_logs")
    op.drop_table("open_ports")
    op.drop_table("scans")
    op.drop_table("networks")
    op.drop_table("scanners")
    op.drop_table("users")
