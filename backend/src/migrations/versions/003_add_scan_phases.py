"""Add scan phases support — new columns alongside old (backwards compatible).

Adds:
- phases JSON column to nse_templates (nullable)
- scan_profile_id FK to networks and scans (nullable)
- 'partial' value to scanstatus enum

Data migration:
- Populates phases from existing nse_scripts/script_args
- Copies nse_profile_id → scan_profile_id on networks
- Copies nse_template_id → scan_profile_id on scans

Revision ID: 003
Revises: 002
Create Date: 2026-03-24

"""

from typing import Sequence, Union

import json

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _build_phases_from_legacy(
    nse_scripts: list[str] | None,
    script_args: dict | None,
) -> list[dict]:
    """Build a phases JSON array from legacy nse_scripts/script_args columns."""
    vuln_config: dict = {
        "scripts": nse_scripts or [],
        "script_args": script_args or {},
        "aggressive": False,
        "parallel": True,
        "max_retries": 3,
    }
    return [
        {
            "name": "host_discovery",
            "enabled": True,
            "tool": "nmap",
            "config": {"aggressive": False, "max_retries": 2},
        },
        {
            "name": "port_scan",
            "enabled": True,
            "tool": "nmap",
            "config": {
                "port_range": None,
                "exclude_ports": None,
                "aggressive": False,
                "max_retries": 3,
            },
        },
        {
            "name": "vulnerability",
            "enabled": True,
            "tool": "nmap_nse",
            "config": vuln_config,
        },
    ]


def upgrade() -> None:
    # 1. Add phases column to nse_templates
    op.add_column(
        "nse_templates",
        sa.Column("phases", sa.JSON(), nullable=True),
    )

    # 2. Add scan_profile_id to networks
    op.add_column(
        "networks",
        sa.Column("scan_profile_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_networks_scan_profile_id",
        "networks",
        "nse_templates",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_networks_scan_profile_id", "networks", ["scan_profile_id"])

    # 3. Add scan_profile_id to scans
    op.add_column(
        "scans",
        sa.Column("scan_profile_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_scans_scan_profile_id",
        "scans",
        "nse_templates",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_scans_scan_profile_id", "scans", ["scan_profile_id"])

    # 4. Add 'partial' to scanstatus enum (MariaDB: ALTER COLUMN to wider enum)
    op.alter_column(
        "scans",
        "status",
        type_=sa.Enum(
            "planned", "running", "completed", "failed", "cancelled", "partial",
            name="scanstatus",
        ),
        existing_type=sa.Enum(
            "planned", "running", "completed", "failed", "cancelled",
            name="scanstatus",
        ),
        existing_nullable=False,
        existing_server_default="planned",
    )

    # 5. Data migration: populate phases from existing nse_scripts/script_args
    conn = op.get_bind()
    templates = conn.execute(
        sa.text("SELECT id, nse_scripts, script_args FROM nse_templates")
    ).fetchall()

    for row in templates:
        template_id = row[0]
        nse_scripts_raw = row[1]
        script_args_raw = row[2]

        # Parse JSON — MariaDB stores JSON as text
        nse_scripts = json.loads(nse_scripts_raw) if nse_scripts_raw else []
        script_args = json.loads(script_args_raw) if script_args_raw else {}

        phases = _build_phases_from_legacy(nse_scripts, script_args)
        conn.execute(
            sa.text("UPDATE nse_templates SET phases = :phases WHERE id = :id"),
            {"phases": json.dumps(phases), "id": template_id},
        )

    # 6. Copy nse_profile_id → scan_profile_id on networks
    conn.execute(
        sa.text(
            "UPDATE networks SET scan_profile_id = nse_profile_id "
            "WHERE nse_profile_id IS NOT NULL"
        )
    )

    # 7. Copy nse_template_id → scan_profile_id on scans
    conn.execute(
        sa.text(
            "UPDATE scans SET scan_profile_id = nse_template_id "
            "WHERE nse_template_id IS NOT NULL"
        )
    )


def downgrade() -> None:
    # Remove scan_profile_id from scans
    op.drop_index("ix_scans_scan_profile_id", table_name="scans")
    op.drop_constraint("fk_scans_scan_profile_id", "scans", type_="foreignkey")
    op.drop_column("scans", "scan_profile_id")

    # Remove scan_profile_id from networks
    op.drop_index("ix_networks_scan_profile_id", table_name="networks")
    op.drop_constraint("fk_networks_scan_profile_id", "networks", type_="foreignkey")
    op.drop_column("networks", "scan_profile_id")

    # Remove phases from nse_templates
    op.drop_column("nse_templates", "phases")

    # Revert scanstatus enum (remove 'partial')
    op.alter_column(
        "scans",
        "status",
        type_=sa.Enum(
            "planned", "running", "completed", "failed", "cancelled",
            name="scanstatus",
        ),
        existing_type=sa.Enum(
            "planned", "running", "completed", "failed", "cancelled", "partial",
            name="scanstatus",
        ),
        existing_nullable=False,
        existing_server_default="planned",
    )
