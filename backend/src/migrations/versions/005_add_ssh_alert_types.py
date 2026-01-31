"""Add SSH alert types to alerts table.

Revision ID: 005
Revises: 004
Create Date: 2026-01-31

"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Alter the alert_type enum to include SSH alert types
    # MySQL/MariaDB requires modifying the column to update ENUM values
    op.execute(
        """
        ALTER TABLE alerts MODIFY COLUMN alert_type
        ENUM('new_port', 'not_allowed', 'blocked',
             'ssh_insecure_auth', 'ssh_weak_cipher', 'ssh_weak_kex',
             'ssh_outdated_version', 'ssh_config_regression')
        NOT NULL
        """
    )


def downgrade() -> None:
    # Remove SSH alert types from the enum
    # Note: This will fail if there are any rows with SSH alert types
    op.execute(
        """
        ALTER TABLE alerts MODIFY COLUMN alert_type
        ENUM('new_port', 'not_allowed', 'blocked')
        NOT NULL
        """
    )
