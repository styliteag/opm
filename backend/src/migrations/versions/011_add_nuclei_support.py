"""add nuclei support

Adds Nuclei vulnerability scanning as an opt-in post-phase on masscan/nmap
networks. Reuses the existing vulnerabilities table via a new `source`
discriminator column (`gvm` / `nuclei`), widens `oid` to fit composite
`template_id:matcher_name` identifiers, and adds per-network nuclei config.

Revision ID: 011
Revises: 010
Create Date: 2026-04-11 12:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "011"
down_revision: Union[str, None] = "010"
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


def _index_exists(table_name: str, index_name: str) -> bool:
    """Check whether an index already exists on a table."""
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.statistics "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :table_name AND index_name = :index_name"
        ),
        {"table_name": table_name, "index_name": index_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def upgrade() -> None:
    # --- vulnerabilities: widen oid to hold composite nuclei keys ------
    op.alter_column(
        "vulnerabilities",
        "oid",
        existing_type=sa.String(100),
        type_=sa.String(255),
        existing_nullable=False,
        existing_comment="GVM NVT OID",
        comment="GVM NVT OID or nuclei composite 'template_id:matcher_name'",
    )

    # --- vulnerabilities: add source discriminator --------------------
    if not _column_exists("vulnerabilities", "source"):
        op.add_column(
            "vulnerabilities",
            sa.Column(
                "source",
                sa.String(16),
                nullable=False,
                server_default="gvm",
                comment="Origin of finding: 'gvm' or 'nuclei'",
            ),
        )
    if not _index_exists("vulnerabilities", "ix_vulnerabilities_source"):
        op.create_index(
            "ix_vulnerabilities_source",
            "vulnerabilities",
            ["source"],
        )

    # --- networks: nuclei config columns ------------------------------
    if not _column_exists("networks", "nuclei_enabled"):
        op.add_column(
            "networks",
            sa.Column(
                "nuclei_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment="Run nuclei as a post-phase after port scan",
            ),
        )
    if not _column_exists("networks", "nuclei_tags"):
        op.add_column(
            "networks",
            sa.Column(
                "nuclei_tags",
                sa.String(255),
                nullable=True,
                comment="Comma-separated nuclei template tags (empty = all default tags)",
            ),
        )
    if not _column_exists("networks", "nuclei_severity"):
        op.add_column(
            "networks",
            sa.Column(
                "nuclei_severity",
                sa.String(16),
                nullable=True,
                comment="Minimum nuclei severity to report: info/low/medium/high/critical",
            ),
        )
    if not _column_exists("networks", "nuclei_timeout"):
        op.add_column(
            "networks",
            sa.Column(
                "nuclei_timeout",
                sa.Integer(),
                nullable=True,
                comment="Wall-clock timeout for the nuclei subprocess in seconds "
                "(null = scanner default 1800)",
            ),
        )


def downgrade() -> None:
    if _column_exists("networks", "nuclei_timeout"):
        op.drop_column("networks", "nuclei_timeout")
    if _column_exists("networks", "nuclei_severity"):
        op.drop_column("networks", "nuclei_severity")
    if _column_exists("networks", "nuclei_tags"):
        op.drop_column("networks", "nuclei_tags")
    if _column_exists("networks", "nuclei_enabled"):
        op.drop_column("networks", "nuclei_enabled")
    if _index_exists("vulnerabilities", "ix_vulnerabilities_source"):
        op.drop_index("ix_vulnerabilities_source", table_name="vulnerabilities")
    if _column_exists("vulnerabilities", "source"):
        op.drop_column("vulnerabilities", "source")
    op.alter_column(
        "vulnerabilities",
        "oid",
        existing_type=sa.String(255),
        type_=sa.String(100),
        existing_nullable=False,
        comment="GVM NVT OID",
    )
