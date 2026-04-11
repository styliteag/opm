"""add nuclei_sni_enabled to networks

Adds a per-network opt-in for SNI fan-out during nuclei scans. When
enabled and the network's hosts have cached hostnames in
``hostname_lookup_cache``, the scanner expands nuclei targets from
``IP:PORT`` to ``https://hostname:PORT`` per cached vhost, so
shared-hosting IPs get scanned once per hosted domain instead of once
per cert-default vhost.

Default is ``false`` because SNI fan-out only makes sense on networks
where hostnames actually resolve (internal vs. external DNS). Operators
explicitly opt in per-network via the Nuclei section of the Network
form after confirming the hostname cache has coverage for the target
hosts.

Revision ID: 015
Revises: 014
Create Date: 2026-04-11 19:30:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "015"
down_revision: Union[str, None] = "014"
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


def upgrade() -> None:
    if not _column_exists("networks", "nuclei_sni_enabled"):
        op.add_column(
            "networks",
            sa.Column(
                "nuclei_sni_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
                comment=(
                    "When true and nuclei_enabled is also true, the scanner "
                    "expands nuclei targets per cached vhost via SNI. Requires "
                    "populated hostname_lookup_cache entries for the host IPs."
                ),
            ),
        )


def downgrade() -> None:
    if _column_exists("networks", "nuclei_sni_enabled"):
        op.drop_column("networks", "nuclei_sni_enabled")
