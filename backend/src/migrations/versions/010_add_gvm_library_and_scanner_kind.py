"""add gvm library, scanner kind, and gvm_port_list

Revision ID: 010
Revises: 009
Create Date: 2026-04-10 19:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import mysql

# revision identifiers, used by Alembic.
revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    """Check whether a column already exists (dev envs may pre-create via create_all)."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name AND column_name = :column_name"
        ),
        {"table_name": table_name, "column_name": column_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def _table_exists(table_name: str) -> bool:
    """Check whether a table already exists."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(f"SHOW TABLES LIKE '{table_name}'")
    )
    return result.fetchone() is not None


def upgrade() -> None:
    # --- scanners: kind + gvm columns ----------------------------------
    if not _column_exists("scanners", "kind"):
        op.add_column(
            "scanners",
            sa.Column(
                "kind",
                sa.String(20),
                nullable=False,
                server_default="standard",
                comment="Scanner kind: 'standard' (masscan/nmap/nse) or 'gvm' (greenbone bridge)",
            ),
        )
    if not _column_exists("scanners", "gvm_refresh_requested"):
        op.add_column(
            "scanners",
            sa.Column(
                "gvm_refresh_requested",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="On-demand metadata refresh flag; cleared by scanner on next snapshot push",
            ),
        )
    if not _column_exists("scanners", "gvm_synced_at"):
        op.add_column(
            "scanners",
            sa.Column(
                "gvm_synced_at",
                sa.DateTime(),
                nullable=True,
                comment="Last time this GVM scanner posted its metadata snapshot",
            ),
        )

    # --- networks: gvm_port_list --------------------------------------
    if not _column_exists("networks", "gvm_port_list"):
        op.add_column(
            "networks",
            sa.Column(
                "gvm_port_list",
                sa.String(100),
                nullable=True,
                comment="GVM port list name for greenbone scanner type",
            ),
        )

    # --- gvm_config_library table -------------------------------------
    if not _table_exists("gvm_config_library"):
        op.create_table(
            "gvm_config_library",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "kind",
                sa.String(20),
                nullable=False,
                comment="'scan_config' or 'port_list'",
            ),
            sa.Column(
                "name",
                sa.String(100),
                nullable=False,
                comment="Identity key across all GVM scanners",
            ),
            sa.Column(
                "xml_blob",
                mysql.MEDIUMTEXT(),
                nullable=False,
            ),
            sa.Column(
                "xml_hash",
                sa.String(64),
                nullable=False,
                comment="sha256 of xml_blob",
            ),
            sa.Column(
                "uploaded_by_user_id",
                sa.Integer,
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
                index=True,
            ),
            sa.Column(
                "uploaded_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.text("utc_timestamp()"),
            ),
            sa.Column(
                "updated_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.text("utc_timestamp()"),
            ),
            sa.UniqueConstraint("kind", "name", name="uq_gvm_library_kind_name"),
        )

    # --- gvm_scanner_metadata table -----------------------------------
    if not _table_exists("gvm_scanner_metadata"):
        op.create_table(
            "gvm_scanner_metadata",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "scanner_id",
                sa.Integer,
                sa.ForeignKey("scanners.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column(
                "kind",
                sa.String(20),
                nullable=False,
                comment="'scan_config' or 'port_list'",
            ),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column(
                "gvm_uuid",
                sa.String(64),
                nullable=False,
                comment="GVM instance UUID",
            ),
            sa.Column(
                "is_builtin",
                sa.Boolean,
                nullable=False,
                server_default=sa.text("0"),
            ),
            sa.Column(
                "xml_hash",
                sa.String(64),
                nullable=True,
                comment="Parsed from [OPM:hash=...] marker in GVM <comment>",
            ),
            sa.Column("extra", sa.JSON, nullable=True),
            sa.Column(
                "synced_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.text("utc_timestamp()"),
            ),
            sa.UniqueConstraint(
                "scanner_id",
                "kind",
                "name",
                name="uq_gvm_scanner_metadata_entry",
            ),
        )


def downgrade() -> None:
    if _table_exists("gvm_scanner_metadata"):
        op.drop_table("gvm_scanner_metadata")
    if _table_exists("gvm_config_library"):
        op.drop_table("gvm_config_library")
    if _column_exists("networks", "gvm_port_list"):
        op.drop_column("networks", "gvm_port_list")
    if _column_exists("scanners", "gvm_synced_at"):
        op.drop_column("scanners", "gvm_synced_at")
    if _column_exists("scanners", "gvm_refresh_requested"):
        op.drop_column("scanners", "gvm_refresh_requested")
    if _column_exists("scanners", "kind"):
        op.drop_column("scanners", "kind")
