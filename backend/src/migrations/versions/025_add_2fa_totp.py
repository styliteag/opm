"""add TOTP 2FA columns to users and user_backup_codes table

Revision ID: 025_add_2fa_totp
Revises: 024_rename_severity_rules
Create Date: 2026-04-21

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "025_add_2fa_totp"
down_revision: Union[str, None] = "024_rename_severity_rules"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.columns "
            "WHERE table_schema = DATABASE() "
            "AND table_name = :t AND column_name = :c"
        ),
        {"t": table_name, "c": column_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT COUNT(*) FROM information_schema.tables "
            "WHERE table_schema = DATABASE() AND table_name = :t"
        ),
        {"t": table_name},
    )
    row = result.fetchone()
    return bool(row and row[0] > 0)


def upgrade() -> None:
    if not _column_exists("users", "totp_secret"):
        op.add_column("users", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    if not _column_exists("users", "totp_secret_pending"):
        op.add_column(
            "users", sa.Column("totp_secret_pending", sa.String(length=64), nullable=True)
        )
    if not _column_exists("users", "totp_enabled"):
        op.add_column(
            "users",
            sa.Column(
                "totp_enabled",
                sa.Boolean(),
                nullable=False,
                server_default=sa.text("0"),
            ),
        )
    if not _column_exists("users", "totp_last_used_step"):
        op.add_column(
            "users", sa.Column("totp_last_used_step", sa.BigInteger(), nullable=True)
        )

    if not _table_exists("user_backup_codes"):
        op.create_table(
            "user_backup_codes",
            sa.Column("id", sa.Integer(), nullable=False, autoincrement=True),
            sa.Column("user_id", sa.Integer(), nullable=False),
            sa.Column("code_hash", sa.String(length=255), nullable=False),
            sa.Column("used_at", sa.DateTime(), nullable=True),
            sa.Column(
                "created_at",
                sa.DateTime(),
                nullable=False,
                server_default=sa.text("UTC_TIMESTAMP()"),
            ),
            sa.ForeignKeyConstraint(
                ["user_id"], ["users.id"], ondelete="CASCADE"
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_user_backup_codes_user_id", "user_backup_codes", ["user_id"]
        )


def downgrade() -> None:
    if _table_exists("user_backup_codes"):
        op.drop_index("ix_user_backup_codes_user_id", table_name="user_backup_codes")
        op.drop_table("user_backup_codes")
    if _column_exists("users", "totp_last_used_step"):
        op.drop_column("users", "totp_last_used_step")
    if _column_exists("users", "totp_enabled"):
        op.drop_column("users", "totp_enabled")
    if _column_exists("users", "totp_secret_pending"):
        op.drop_column("users", "totp_secret_pending")
    if _column_exists("users", "totp_secret"):
        op.drop_column("users", "totp_secret")
