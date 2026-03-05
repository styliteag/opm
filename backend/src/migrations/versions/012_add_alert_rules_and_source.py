"""Add unified alert_rules table and source column to alerts.

Revision ID: 012
Revises: 011
Create Date: 2026-03-05 00:00:00.000000

"""
import json

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

# SSH alert types for backfill
SSH_ALERT_TYPES = {
    "ssh_insecure_auth",
    "ssh_weak_cipher",
    "ssh_weak_kex",
    "ssh_outdated_version",
    "ssh_config_regression",
}


def upgrade() -> None:
    # Drop alert_rules if exists from a previous partial run
    conn = op.get_bind()
    conn.execute(sa.text("DROP TABLE IF EXISTS alert_rules"))

    # 1. Create alert_rules table
    op.create_table(
        "alert_rules",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("network_id", sa.Integer(), sa.ForeignKey("networks.id"), nullable=True),
        sa.Column("source", sa.String(50), nullable=False),
        sa.Column(
            "rule_type",
            sa.Enum("accepted", "critical", name="alert_rule_type"),
            nullable=False,
        ),
        sa.Column("match_criteria", sa.JSON(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_alert_rules_network_id", "alert_rules", ["network_id"])
    op.create_index("ix_alert_rules_source", "alert_rules", ["source"])
    op.create_index("ix_alert_rules_created_by", "alert_rules", ["created_by"])

    # 2. Add source column to alerts (with default for backfill)
    # Check if column already exists from partial run
    from sqlalchemy import inspect
    insp = inspect(conn)
    existing_cols = {c["name"] for c in insp.get_columns("alerts")}
    if "source" not in existing_cols:
        op.add_column(
            "alerts",
            sa.Column("source", sa.String(50), nullable=False, server_default="port"),
        )
        op.create_index("ix_alerts_source", "alerts", ["source"])

    # 3. Make port column nullable on alerts
    op.alter_column(
        "alerts",
        "port",
        existing_type=sa.Integer(),
        nullable=True,
    )

    # 4. Backfill source on existing alerts
    conn = op.get_bind()
    ssh_types_list = ", ".join(f"'{t}'" for t in SSH_ALERT_TYPES)
    conn.execute(
        sa.text(f"UPDATE alerts SET source = 'ssh' WHERE alert_type IN ({ssh_types_list})")
    )

    # 5. Migrate global_port_rules -> alert_rules
    rows = conn.execute(
        sa.text(
            "SELECT id, ip, port, rule_type, description,"
            " created_by, created_at FROM global_port_rules"
        )
    ).fetchall()
    for row in rows:
        criteria = {"port": row[2]}
        if row[1] is not None:
            criteria["ip"] = row[1]
        conn.execute(
            sa.text(
                "INSERT INTO alert_rules (network_id, source,"
                " rule_type, match_criteria, description,"
                " created_by, created_at)"
                " VALUES (NULL, 'port', :rule_type, :criteria,"
                " :description, :created_by, :created_at)"
            ),
            {
                "rule_type": row[3],
                "criteria": json.dumps(criteria),
                "description": row[4],
                "created_by": row[5],
                "created_at": row[6],
            },
        )

    # 6. Migrate port_rules -> alert_rules
    rows = conn.execute(
        sa.text("SELECT id, network_id, ip, port, rule_type, description FROM port_rules")
    ).fetchall()
    for row in rows:
        criteria = {"port": row[3]}
        if row[2] is not None:
            criteria["ip"] = row[2]
        conn.execute(
            sa.text(
                "INSERT INTO alert_rules (network_id, source,"
                " rule_type, match_criteria, description,"
                " created_by, created_at)"
                " VALUES (:network_id, 'port', :rule_type,"
                " :criteria, :description, NULL, NOW())"
            ),
            {
                "network_id": row[1],
                "rule_type": row[4],
                "criteria": json.dumps(criteria),
                "description": row[5],
            },
        )

    # Remove server_default after backfill
    op.alter_column(
        "alerts",
        "source",
        server_default=None,
    )


def downgrade() -> None:
    # Remove source column from alerts
    op.drop_index("ix_alerts_source", table_name="alerts")
    op.drop_column("alerts", "source")

    # Make port non-nullable again
    op.alter_column(
        "alerts",
        "port",
        existing_type=sa.Integer(),
        nullable=False,
    )

    # Drop alert_rules table
    op.drop_index("ix_alert_rules_created_by", table_name="alert_rules")
    op.drop_index("ix_alert_rules_source", table_name="alert_rules")
    op.drop_index("ix_alert_rules_network_id", table_name="alert_rules")
    op.drop_table("alert_rules")
