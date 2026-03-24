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

    # 2. Drop legacy nse_profile_id from networks
    #    MySQL requires: drop FK first, then index, then column
    op.drop_constraint(
        "fk_networks_nse_profile_id", "networks", type_="foreignkey",
    )
    op.drop_index("ix_networks_nse_profile_id", table_name="networks")
    op.drop_column("networks", "nse_profile_id")
    op.drop_column("networks", "scanner_type")
    op.drop_column("networks", "host_discovery_enabled")

    # 3. Drop legacy nse_template_id from scans
    op.drop_constraint(
        "fk_scans_nse_template_id", "scans", type_="foreignkey",
    )
    op.drop_index("ix_scans_nse_template_id", table_name="scans")
    op.drop_column("scans", "nse_template_id")

    # 4. Drop nse_results FK to nse_templates before rename
    #    (auto-generated name — MySQL uses positional ibfk names)
    conn = op.get_bind()
    # Find the actual FK constraint name for template_id
    result = conn.execute(sa.text(
        "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE "
        "WHERE TABLE_NAME = 'nse_results' "
        "AND COLUMN_NAME = 'template_id' "
        "AND REFERENCED_TABLE_NAME = 'nse_templates' "
        "AND TABLE_SCHEMA = DATABASE()"
    ))
    fk_row = result.fetchone()
    if fk_row:
        op.drop_constraint(fk_row[0], "nse_results", type_="foreignkey")

    # Also drop scan_profile_id FKs before rename
    op.drop_constraint(
        "fk_networks_scan_profile_id", "networks", type_="foreignkey",
    )
    op.drop_constraint(
        "fk_scans_scan_profile_id", "scans", type_="foreignkey",
    )

    # 5. Rename table nse_templates → scan_profiles
    op.rename_table("nse_templates", "scan_profiles")

    # 6. Recreate FK references to renamed table
    op.create_foreign_key(
        "fk_nse_results_template_id",
        "nse_results",
        "scan_profiles",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_networks_scan_profile_id",
        "networks",
        "scan_profiles",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
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
    # Drop FKs before rename
    op.drop_constraint(
        "fk_nse_results_template_id", "nse_results", type_="foreignkey",
    )
    op.drop_constraint(
        "fk_networks_scan_profile_id", "networks", type_="foreignkey",
    )
    op.drop_constraint(
        "fk_scans_scan_profile_id", "scans", type_="foreignkey",
    )

    # Reverse table rename
    op.rename_table("scan_profiles", "nse_templates")

    # Restore FK references to nse_templates
    op.create_foreign_key(
        "fk_nse_results_template_id",
        "nse_results",
        "nse_templates",
        ["template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_networks_scan_profile_id",
        "networks",
        "nse_templates",
        ["scan_profile_id"],
        ["id"],
        ondelete="SET NULL",
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
        "fk_scans_nse_template_id",
        "scans",
        "nse_templates",
        ["nse_template_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_scans_nse_template_id", "scans", ["nse_template_id"],
    )

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
        "fk_networks_nse_profile_id",
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
