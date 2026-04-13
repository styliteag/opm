"""add nuclei_vulnerability and nuclei_cve_detected alert types

Migration 011 added nuclei scanning support but missed extending the
alert_type ENUM to include nuclei-specific alert types.  This caused
``DataError: Data truncated for column 'alert_type'`` when the backend
tried to persist nuclei alerts.

Revision ID: 020_add_nuclei_alert_types
Revises: 019_add_nuclei_status_to_scans
Create Date: 2026-04-13
"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "020_add_nuclei_alert_types"
down_revision: str | Sequence[str] | None = "019_add_nuclei_status_to_scans"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE alerts MODIFY COLUMN alert_type "
        "ENUM('new_port','not_allowed','blocked',"
        "'ssh_insecure_auth','ssh_weak_cipher','ssh_weak_kex',"
        "'ssh_outdated_version','ssh_config_regression',"
        "'nse_vulnerability','nse_cve_detected',"
        "'gvm_vulnerability','gvm_cve_detected',"
        "'nuclei_vulnerability','nuclei_cve_detected') NOT NULL"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM alerts WHERE alert_type IN "
        "('nuclei_vulnerability','nuclei_cve_detected')"
    )
    op.execute(
        "ALTER TABLE alerts MODIFY COLUMN alert_type "
        "ENUM('new_port','not_allowed','blocked',"
        "'ssh_insecure_auth','ssh_weak_cipher','ssh_weak_kex',"
        "'ssh_outdated_version','ssh_config_regression',"
        "'nse_vulnerability','nse_cve_detected',"
        "'gvm_vulnerability','gvm_cve_detected') NOT NULL"
    )
