"""Create complete initial schema (consolidates migrations 000-024).

Revision ID: 001
Revises:
Create Date: 2026-03-23

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── organizations (standalone) ──
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column(
            "name", sa.String(255), nullable=False, server_default="My Organization"
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("contact_email", sa.String(255), nullable=True),
        sa.Column("security_policy_url", sa.String(500), nullable=True),
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
    )

    # ── users (standalone) ──
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column(
            "role",
            sa.Enum("admin", "operator", "analyst", "viewer", name="userrole"),
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

    # ── scanners (standalone) ──
    op.create_table(
        "scanners",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("api_key_hash", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(255), nullable=True),
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

    # ── hosts (standalone) ──
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
    op.create_index("ix_hosts_ip", "hosts", ["ip"], unique=True)

    # ── global_settings (standalone) ──
    op.create_table(
        "global_settings",
        sa.Column("key", sa.String(255), nullable=False),
        sa.Column("value", sa.JSON(), nullable=True),
        sa.PrimaryKeyConstraint("key"),
    )

    # ── nse_templates (standalone) ──
    op.create_table(
        "nse_templates",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("nse_scripts", sa.JSON(), nullable=False),
        sa.Column(
            "severity",
            sa.Enum("critical", "high", "medium", "info", name="nsetemplateseveritytype"),
            nullable=True,
            server_default=None,
        ),
        sa.Column("platform", sa.String(50), nullable=False, server_default="any"),
        sa.Column(
            "type",
            sa.Enum("builtin", "custom", name="nsetemplatetypetype"),
            nullable=False,
            server_default="custom",
        ),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("script_args", sa.JSON(), nullable=True),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="10"),
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
    )

    # ── nse_scripts (standalone) ──
    op.create_table(
        "nse_scripts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("categories", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("severity", sa.String(20), nullable=True),
        sa.Column("type", sa.String(20), nullable=False, server_default="custom"),
        sa.Column("cloned_from", sa.String(200), nullable=True),
        sa.Column("author", sa.String(200), nullable=False, server_default=""),
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
        sa.UniqueConstraint("name"),
    )

    # ── networks (FK -> scanners, nse_templates) ──
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
        sa.Column("scanner_type", sa.String(20), nullable=False, server_default="masscan"),
        sa.Column("scan_protocol", sa.String(10), nullable=False, server_default="tcp"),
        sa.Column("alert_config", sa.JSON(), nullable=True),
        sa.Column("nse_profile_id", sa.Integer(), nullable=True),
        sa.Column("host_discovery_enabled", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("scan_schedule_enabled", sa.Boolean(), nullable=False, server_default="1"),
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
        sa.ForeignKeyConstraint(
            ["nse_profile_id"],
            ["nse_templates.id"],
            name="fk_networks_nse_profile_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_networks_scanner_id", "networks", ["scanner_id"])
    op.create_index("ix_networks_nse_profile_id", "networks", ["nse_profile_id"])

    # ── scans (FK -> networks, scanners, users, nse_templates) ──
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
        sa.Column("actual_rate", sa.Float(), nullable=True),
        sa.Column(
            "trigger_type",
            sa.Enum("manual", "scheduled", name="triggertype"),
            nullable=False,
            server_default="manual",
        ),
        sa.Column("hidden", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column(
            "target_ip",
            sa.Text(),
            nullable=True,
            comment="Target IP for single-host scan; NULL for full network scan",
        ),
        sa.Column(
            "nse_template_id",
            sa.Integer(),
            nullable=True,
            comment="NSE template used for this scan; NULL for non-NSE scans",
        ),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
        sa.ForeignKeyConstraint(["scanner_id"], ["scanners.id"]),
        sa.ForeignKeyConstraint(
            ["cancelled_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["nse_template_id"],
            ["nse_templates.id"],
            name="fk_scans_nse_template_id",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_scans_network_id", "scans", ["network_id"])
    op.create_index("ix_scans_scanner_id", "scans", ["scanner_id"])
    op.create_index("ix_scans_status", "scans", ["status"])
    op.create_index("ix_scans_hidden", "scans", ["hidden"])
    op.create_index("ix_scans_nse_template_id", "scans", ["nse_template_id"])

    # ── open_ports (FK -> scans) ──
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

    # ── scan_logs (FK -> scans) ──
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

    # ── ssh_scan_results (FK -> scans) ──
    op.create_table(
        "ssh_scan_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scan_id", sa.Integer(), nullable=False),
        sa.Column("host_ip", sa.String(45), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False, server_default="22"),
        sa.Column(
            "timestamp",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.Column("publickey_enabled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("password_enabled", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column(
            "keyboard_interactive_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="0",
        ),
        sa.Column("ssh_version", sa.String(100), nullable=True),
        sa.Column("protocol_version", sa.String(20), nullable=True),
        sa.Column("server_banner", sa.Text(), nullable=True),
        sa.Column("supported_ciphers", sa.JSON(), nullable=True),
        sa.Column("kex_algorithms", sa.JSON(), nullable=True),
        sa.Column("host_key_types", sa.JSON(), nullable=True),
        sa.Column("mac_algorithms", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_ssh_scan_results_scan_id", "ssh_scan_results", ["scan_id"])
    op.create_index("ix_ssh_scan_results_host_ip", "ssh_scan_results", ["host_ip"])

    # ── nse_results (FK -> scans, nse_templates) ──
    op.create_table(
        "nse_results",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scan_id", sa.Integer(), nullable=False),
        sa.Column("ip", sa.String(45), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("protocol", sa.String(10), nullable=False, server_default="tcp"),
        sa.Column("script_name", sa.String(200), nullable=False),
        sa.Column("script_output", sa.Text(), nullable=False),
        sa.Column("cve_ids", sa.JSON(), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("template_id", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["template_id"], ["nse_templates.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_nse_results_scan_id", "nse_results", ["scan_id"])
    op.create_index("ix_nse_results_ip", "nse_results", ["ip"])
    op.create_index("ix_nse_results_script_name", "nse_results", ["script_name"])
    op.create_index("ix_nse_results_template_id", "nse_results", ["template_id"])

    # ── global_open_ports (FK -> hosts) ──
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
        sa.Column("user_comment", sa.Text(), nullable=True),
        sa.Column("host_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(
            ["host_id"], ["hosts.id"], name="fk_global_open_ports_host_id"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "ip", "port", "protocol", name="uq_global_open_ports_ip_port_protocol"
        ),
    )
    op.create_index("ix_global_open_ports_ip", "global_open_ports", ["ip"])
    op.create_index("ix_global_open_ports_port", "global_open_ports", ["port"])
    op.create_index("ix_global_open_ports_ip_port", "global_open_ports", ["ip", "port"])
    op.create_index("ix_global_open_ports_host_id", "global_open_ports", ["host_id"])

    # ── alerts (FK -> scans, networks, global_open_ports, users) ──
    op.create_table(
        "alerts",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("scan_id", sa.Integer(), nullable=True),
        sa.Column("network_id", sa.Integer(), nullable=True),
        sa.Column("global_open_port_id", sa.Integer(), nullable=True),
        sa.Column(
            "alert_type",
            sa.Enum(
                "new_port", "not_allowed", "blocked",
                "ssh_insecure_auth", "ssh_weak_cipher", "ssh_weak_kex",
                "ssh_outdated_version", "ssh_config_regression",
                "nse_vulnerability", "nse_cve_detected",
                name="alerttype",
            ),
            nullable=False,
        ),
        sa.Column("source", sa.String(50), nullable=False, server_default="port"),
        sa.Column("ip", sa.String(45), nullable=False),
        sa.Column("port", sa.Integer(), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("dismissed", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("dismiss_reason", sa.Text(), nullable=True),
        sa.Column("assigned_to_user_id", sa.Integer(), nullable=True),
        sa.Column(
            "resolution_status",
            sa.Enum(
                "open", "in_progress", "resolved", "fix_planned",
                name="resolutionstatustype",
            ),
            nullable=False,
            server_default="open",
        ),
        sa.Column("severity_override", sa.String(20), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"]),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
        sa.ForeignKeyConstraint(["global_open_port_id"], ["global_open_ports.id"]),
        sa.ForeignKeyConstraint(
            ["assigned_to_user_id"],
            ["users.id"],
            name="fk_alerts_assigned_to_user_id",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alerts_scan_id", "alerts", ["scan_id"])
    op.create_index("ix_alerts_network_id", "alerts", ["network_id"])
    op.create_index("ix_alerts_global_open_port_id", "alerts", ["global_open_port_id"])
    op.create_index("ix_alerts_ip", "alerts", ["ip"])
    op.create_index("ix_alerts_port", "alerts", ["port"])
    op.create_index("ix_alerts_source", "alerts", ["source"])
    op.create_index("ix_alerts_assigned_to_user_id", "alerts", ["assigned_to_user_id"])

    # ── alert_comments (FK -> alerts, users) ──
    op.create_table(
        "alert_comments",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(["alert_id"], ["alerts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_comments_alert_id", "alert_comments", ["alert_id"])
    op.create_index("ix_alert_comments_user_id", "alert_comments", ["user_id"])

    # ── port_rules (FK -> networks) ──
    op.create_table(
        "port_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("port", sa.String(20), nullable=False),
        sa.Column(
            "rule_type",
            sa.Enum("accepted", "critical", name="ruletype"),
            nullable=False,
        ),
        sa.Column("description", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_port_rules_network_id", "port_rules", ["network_id"])
    op.create_index("ix_port_rules_ip", "port_rules", ["ip"])
    # Generated column and unique constraint for dedup
    op.execute(
        "ALTER TABLE port_rules "
        "ADD COLUMN ip_key VARCHAR(45) AS (COALESCE(ip, '')) STORED"
    )
    op.create_unique_constraint(
        "uq_port_rules_network_ip_port_type",
        "port_rules",
        ["network_id", "ip_key", "port", "rule_type"],
    )

    # ── global_port_rules (FK -> users) ──
    op.create_table(
        "global_port_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("ip", sa.String(45), nullable=True),
        sa.Column("port", sa.String(20), nullable=False),
        sa.Column(
            "rule_type",
            sa.Enum("accepted", "critical", name="globalruletype"),
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
    op.create_index("ix_global_port_rules_created_by", "global_port_rules", ["created_by"])
    # Generated column and unique constraint for dedup
    op.execute(
        "ALTER TABLE global_port_rules "
        "ADD COLUMN ip_key VARCHAR(45) AS (COALESCE(ip, '')) STORED"
    )
    op.create_unique_constraint(
        "uq_global_port_rules_ip_port_type",
        "global_port_rules",
        ["ip_key", "port", "rule_type"],
    )

    # ── alert_rules (FK -> networks, users) ──
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column(
            "rule_type",
            sa.Enum("accepted", "critical", name="alert_rule_type"),
            nullable=False,
        ),
        sa.Column("match_criteria", sa.JSON(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["network_id"], ["networks.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_rules_network_id", "alert_rules", ["network_id"])
    op.create_index("ix_alert_rules_source", "alert_rules", ["source"])
    op.create_index("ix_alert_rules_created_by", "alert_rules", ["created_by"])

    # ── host_discovery_scans (FK -> networks, scanners) ──
    op.create_table(
        "host_discovery_scans",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("network_id", sa.Integer(), nullable=False),
        sa.Column("scanner_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "planned", "running", "completed", "failed",
                name="hostdiscoveryscanstatus",
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
    op.create_index(
        "ix_host_discovery_scans_network_id", "host_discovery_scans", ["network_id"]
    )
    op.create_index(
        "ix_host_discovery_scans_scanner_id", "host_discovery_scans", ["scanner_id"]
    )
    op.create_index(
        "ix_host_discovery_scans_status", "host_discovery_scans", ["status"]
    )


def downgrade() -> None:
    op.drop_table("host_discovery_scans")
    op.drop_table("alert_rules")
    op.drop_table("global_port_rules")
    op.drop_table("port_rules")
    op.drop_table("alert_comments")
    op.drop_table("alerts")
    op.drop_table("global_open_ports")
    op.drop_table("nse_results")
    op.drop_table("ssh_scan_results")
    op.drop_table("scan_logs")
    op.drop_table("open_ports")
    op.drop_table("scans")
    op.drop_table("networks")
    op.drop_table("nse_scripts")
    op.drop_table("nse_templates")
    op.drop_table("global_settings")
    op.drop_table("hosts")
    op.drop_table("scanners")
    op.drop_table("users")
    op.drop_table("organizations")
