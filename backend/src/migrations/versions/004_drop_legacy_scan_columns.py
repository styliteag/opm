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


def _column_exists(table: str, column: str) -> bool:
    """Check if a column exists in a table (MySQL)."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = :table AND COLUMN_NAME = :column "
        "AND TABLE_SCHEMA = DATABASE()"
    ), {"table": table, "column": column})
    return result.scalar() > 0  # type: ignore[operator]


def _table_exists(table: str) -> bool:
    """Check if a table exists (MySQL)."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES "
        "WHERE TABLE_NAME = :table AND TABLE_SCHEMA = DATABASE()"
    ), {"table": table})
    return result.scalar() > 0  # type: ignore[operator]


def _fk_exists(table: str, constraint_name: str) -> bool:
    """Check if a FK constraint exists (MySQL)."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
        "WHERE TABLE_NAME = :table AND CONSTRAINT_NAME = :name "
        "AND CONSTRAINT_TYPE = 'FOREIGN KEY' "
        "AND TABLE_SCHEMA = DATABASE()"
    ), {"table": table, "name": constraint_name})
    return result.scalar() > 0  # type: ignore[operator]


def _index_exists(table: str, index_name: str) -> bool:
    """Check if an index exists (MySQL)."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS "
        "WHERE TABLE_NAME = :table AND INDEX_NAME = :name "
        "AND TABLE_SCHEMA = DATABASE()"
    ), {"table": table, "name": index_name})
    return result.scalar() > 0  # type: ignore[operator]


def _find_fk_name(table: str, column: str, ref_table: str) -> str | None:
    """Find the FK constraint name for a column referencing a table."""
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE "
        "WHERE TABLE_NAME = :table AND COLUMN_NAME = :column "
        "AND REFERENCED_TABLE_NAME = :ref_table "
        "AND TABLE_SCHEMA = DATABASE()"
    ), {"table": table, "column": column, "ref_table": ref_table})
    row = result.fetchone()
    return row[0] if row else None


def upgrade() -> None:
    # Determine which table name is current (handles partial prior run)
    source_table = "nse_templates" if _table_exists("nse_templates") else "scan_profiles"

    # 1. Drop legacy columns from nse_templates/scan_profiles
    if _column_exists(source_table, "nse_scripts"):
        op.drop_column(source_table, "nse_scripts")
    if _column_exists(source_table, "script_args"):
        op.drop_column(source_table, "script_args")

    # 2. Drop legacy nse_profile_id from networks
    #    MySQL requires: drop FK first, then index, then column
    if _column_exists("networks", "nse_profile_id"):
        fk_name = _find_fk_name("networks", "nse_profile_id", source_table)
        if fk_name:
            op.drop_constraint(fk_name, "networks", type_="foreignkey")
        if _index_exists("networks", "ix_networks_nse_profile_id"):
            op.drop_index("ix_networks_nse_profile_id", table_name="networks")
        op.drop_column("networks", "nse_profile_id")

    if _column_exists("networks", "scanner_type"):
        op.drop_column("networks", "scanner_type")
    if _column_exists("networks", "host_discovery_enabled"):
        op.drop_column("networks", "host_discovery_enabled")

    # 3. Drop legacy nse_template_id from scans
    if _column_exists("scans", "nse_template_id"):
        fk_name = _find_fk_name("scans", "nse_template_id", source_table)
        if fk_name:
            op.drop_constraint(fk_name, "scans", type_="foreignkey")
        if _index_exists("scans", "ix_scans_nse_template_id"):
            op.drop_index("ix_scans_nse_template_id", table_name="scans")
        op.drop_column("scans", "nse_template_id")

    # 4. Drop all FKs referencing the source table before rename
    #    nse_results.template_id
    fk_name = _find_fk_name("nse_results", "template_id", source_table)
    if fk_name:
        op.drop_constraint(fk_name, "nse_results", type_="foreignkey")

    #    networks.scan_profile_id
    fk_name = _find_fk_name("networks", "scan_profile_id", source_table)
    if fk_name:
        op.drop_constraint(fk_name, "networks", type_="foreignkey")

    #    scans.scan_profile_id
    fk_name = _find_fk_name("scans", "scan_profile_id", source_table)
    if fk_name:
        op.drop_constraint(fk_name, "scans", type_="foreignkey")

    # 5. Rename table nse_templates → scan_profiles (if not already renamed)
    if source_table == "nse_templates":
        op.rename_table("nse_templates", "scan_profiles")

    # 6. Recreate FK references to scan_profiles
    if not _fk_exists("nse_results", "fk_nse_results_template_id"):
        op.create_foreign_key(
            "fk_nse_results_template_id",
            "nse_results",
            "scan_profiles",
            ["template_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _fk_exists("networks", "fk_networks_scan_profile_id"):
        op.create_foreign_key(
            "fk_networks_scan_profile_id",
            "networks",
            "scan_profiles",
            ["scan_profile_id"],
            ["id"],
            ondelete="SET NULL",
        )
    if not _fk_exists("scans", "fk_scans_scan_profile_id"):
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
    if _fk_exists("nse_results", "fk_nse_results_template_id"):
        op.drop_constraint(
            "fk_nse_results_template_id", "nse_results", type_="foreignkey",
        )
    if _fk_exists("networks", "fk_networks_scan_profile_id"):
        op.drop_constraint(
            "fk_networks_scan_profile_id", "networks", type_="foreignkey",
        )
    if _fk_exists("scans", "fk_scans_scan_profile_id"):
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
    if not _column_exists("scans", "nse_template_id"):
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

    if not _column_exists("networks", "host_discovery_enabled"):
        op.add_column(
            "networks",
            sa.Column(
                "host_discovery_enabled",
                sa.Boolean(),
                nullable=False,
                server_default="1",
            ),
        )
    if not _column_exists("networks", "scanner_type"):
        op.add_column(
            "networks",
            sa.Column(
                "scanner_type",
                sa.String(20),
                nullable=False,
                server_default="masscan",
            ),
        )
    if not _column_exists("networks", "nse_profile_id"):
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

    if not _column_exists("nse_templates", "script_args"):
        op.add_column(
            "nse_templates",
            sa.Column("script_args", sa.JSON(), nullable=True),
        )
    if not _column_exists("nse_templates", "nse_scripts"):
        op.add_column(
            "nse_templates",
            sa.Column("nse_scripts", sa.JSON(), nullable=True),
        )
