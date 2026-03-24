"""Drop legacy scan columns and rename table.

Drops:
- nse_scripts, script_args from nse_templates
- scanner_type, nse_profile_id from networks
- nse_template_id from scans
- host_discovery_enabled from networks (now in profile phases)

Renames:
- nse_templates → scan_profiles (table)

Revision ID: 004
Revises: 003
Create Date: 2026-03-24

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "004"
down_revision: Union[str, None] = "003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop legacy columns from nse_templates
    op.drop_column("nse_templates", "nse_scripts")
    op.drop_column("nse_templates", "script_args")

    # 2. Drop legacy columns from networks
    op.drop_index("ix_networks_nse_profile_id", table_name="networks")
    op.drop_constraint(
        "networks_ibfk_2", "networks", type_="foreignkey",
    )
    op.drop_column("networks", "nse_profile_id")
    op.drop_column("networks", "scanner_type")
    op.drop_column("networks", "host_discovery_enabled")

    # 3. Drop legacy column from scans
    op.drop_index("ix_scans_nse_template_id", table_name="scans")
    op.drop_constraint(
        "scans_ibfk_4", "scans", type_="foreignkey",
    )
    op.drop_column("scans", "nse_template_id")

    # 4. Rename table nse_templates → scan_profiles
    op.rename_table("nse_templates", "scan_profiles")

    # 5. Update FK references to new table name
    # nse_results.template_id → scan_profiles
    op.drop_constraint(
        "nse_results_ibfk_2", "nse_results", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_nse_results_template_id",
        "nse_results",
        "scan_profiles",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # networks.scan_profile_id → scan_profiles
    op.drop_constraint(
        "fk_networks_scan_profile_id", "networks", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_networks_scan_profile_id",
        "networks",
        "scan_profiles",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # scans.scan_profile_id → scan_profiles
    op.drop_constraint(
        "fk_scans_scan_profile_id", "scans", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_scans_scan_profile_id",
        "scans",
        "scan_profiles",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Reverse table rename
    op.rename_table("scan_profiles", "nse_templates")

    # Restore FK references to nse_templates
    op.drop_constraint(
        "fk_nse_results_template_id", "nse_results", type_="foreignkey",
    )
    op.create_foreign_key(
        "nse_results_ibfk_2",
        "nse_results",
        "nse_templates",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(
        "fk_networks_scan_profile_id", "networks", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_networks_scan_profile_id",
        "networks",
        "nse_templates",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.drop_constraint(
        "fk_scans_scan_profile_id", "scans", type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_scans_scan_profile_id",
        "scans",
        "nse_templates",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Restore legacy columns
    op.add_column(
        "scans",
        sa.Column("nse_template_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "scans_ibfk_4",
        "scans",
        "nse_templates",
        ["nse_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_scans_nse_template_id", "scans", ["nse_template_id"])

    op.add_column(
        "networks",
        sa.Column(
            "host_discovery_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "networks",
        sa.Column(
            "scanner_type",
            sa.String(20),
            nullable=False,
            server_default="masscan",
        ),
    )
    op.add_column(
        "networks",
        sa.Column("nse_profile_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "networks_ibfk_2",
        "networks",
        "nse_templates",
        ["nse_profile_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_networks_nse_profile_id", "networks", ["nse_profile_id"],
    )

    op.add_column(
        "nse_templates",
        sa.Column("script_args", sa.JSON(), nullable=True),
    )
    op.add_column(
        "nse_templates",
        sa.Column("nse_scripts", sa.JSON(), nullable=True),
    )
