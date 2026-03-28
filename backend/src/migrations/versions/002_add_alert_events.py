"""add alert_events table

Revision ID: 002
Revises: 001
Create Date: 2026-03-28

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "alert_events",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("alert_id", sa.Integer(), nullable=False),
        sa.Column(
            "event_type",
            sa.Enum(
                "created",
                "dismissed",
                "reopened",
                "assigned",
                "status_changed",
                "commented",
                "severity_overridden",
                "recurrence",
                name="alerteventtype",
            ),
            nullable=False,
        ),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("scan_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("extra", sa.JSON(), nullable=True),
        sa.Column(
            "occurred_at",
            sa.DateTime(),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["alert_id"],
            ["alerts.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(
            ["scan_id"],
            ["scans.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_alert_events_alert_id"), "alert_events", ["alert_id"], unique=False)
    op.create_index(
        op.f("ix_alert_events_event_type"), "alert_events", ["event_type"], unique=False
    )
    op.create_index(op.f("ix_alert_events_user_id"), "alert_events", ["user_id"], unique=False)
    op.create_index(op.f("ix_alert_events_scan_id"), "alert_events", ["scan_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_alert_events_scan_id"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_user_id"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_event_type"), table_name="alert_events")
    op.drop_index(op.f("ix_alert_events_alert_id"), table_name="alert_events")
    op.drop_table("alert_events")
