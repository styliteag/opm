"""add vulnerabilities table and gvm_scan_config

Revision ID: 007
Revises: 006
Create Date: 2026-04-09 15:23:40.640753

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create vulnerabilities table if it doesn't already exist (may exist
    # from a prior untracked migration in dev environments).
    conn = op.get_bind()
    result = conn.execute(sa.text("SHOW TABLES LIKE 'vulnerabilities'"))
    if result.fetchone() is None:
        op.create_table(
            "vulnerabilities",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "scan_id",
                sa.Integer,
                sa.ForeignKey("scans.id", ondelete="CASCADE"),
                nullable=False,
                index=True,
            ),
            sa.Column("ip", sa.String(45), nullable=False, index=True),
            sa.Column("port", sa.Integer, nullable=True),
            sa.Column("protocol", sa.String(10), nullable=False, server_default="tcp"),
            sa.Column(
                "oid",
                sa.String(100),
                nullable=False,
                index=True,
                comment="GVM NVT OID",
            ),
            sa.Column("name", sa.String(500), nullable=False),
            sa.Column("description", sa.Text, nullable=False),
            sa.Column(
                "severity",
                sa.Float,
                nullable=False,
                comment="CVSS score 0.0-10.0",
            ),
            sa.Column(
                "severity_label",
                sa.String(20),
                nullable=False,
                comment="critical/high/medium/low/info",
            ),
            sa.Column("cvss_base_vector", sa.String(200), nullable=True),
            sa.Column("cve_ids", sa.JSON, nullable=False),
            sa.Column("solution", sa.Text, nullable=True),
            sa.Column(
                "solution_type",
                sa.String(50),
                nullable=True,
                comment="VendorFix/Workaround/Mitigation/WillNotFix",
            ),
            sa.Column(
                "qod",
                sa.Integer,
                nullable=True,
                comment="Quality of Detection 0-100",
            ),
            sa.Column(
                "created_at",
                sa.DateTime,
                nullable=False,
                server_default=sa.text("utc_timestamp()"),
            ),
        )

    op.add_column(
        "networks",
        sa.Column(
            "gvm_scan_config",
            sa.String(100),
            nullable=True,
            comment="GVM scan config preset for greenbone scanner type",
        ),
    )


def downgrade() -> None:
    op.drop_column("networks", "gvm_scan_config")
    op.drop_table("vulnerabilities")
