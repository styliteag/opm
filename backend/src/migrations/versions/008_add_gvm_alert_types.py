"""add gvm_vulnerability and gvm_cve_detected alert types

Revision ID: 008
Revises: 007
Create Date: 2026-04-09 18:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "008"
down_revision: Union[str, None] = "007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE alerts MODIFY COLUMN alert_type "
        "ENUM('new_port','not_allowed','blocked',"
        "'ssh_insecure_auth','ssh_weak_cipher','ssh_weak_kex',"
        "'ssh_outdated_version','ssh_config_regression',"
        "'nse_vulnerability','nse_cve_detected',"
        "'gvm_vulnerability','gvm_cve_detected') NOT NULL"
    )


def downgrade() -> None:
    # Remove any GVM alerts before shrinking the enum
    op.execute("DELETE FROM alerts WHERE alert_type IN ('gvm_vulnerability','gvm_cve_detected')")
    op.execute(
        "ALTER TABLE alerts MODIFY COLUMN alert_type "
        "ENUM('new_port','not_allowed','blocked',"
        "'ssh_insecure_auth','ssh_weak_cipher','ssh_weak_kex',"
        "'ssh_outdated_version','ssh_config_regression',"
        "'nse_vulnerability','nse_cve_detected') NOT NULL"
    )
