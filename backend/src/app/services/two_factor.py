"""Service for TOTP-based two-factor authentication."""

import secrets
import time
from collections import defaultdict
from datetime import timedelta
from threading import Lock
from typing import Any

import pyotp
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.models.user_backup_code import UserBackupCode

_TOTP_ISSUER = "STYLiTE Orbit Monitor"
_BACKUP_CODE_COUNT = 10
_BACKUP_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I
_BACKUP_CODE_LENGTH = 10
_CHALLENGE_SCOPE = "2fa_challenge"
_CHALLENGE_TTL = timedelta(minutes=5)

# Rate limit for 2FA verify step — tighter than login rate limit.
# NOTE: this is per-process memory. Production runs 4 uvicorn workers (see
# backend/start.sh), so the effective limit across the pool is ~20 attempts /
# 60s per user_id. Good enough to stop pure brute-force against a 6-digit code
# (still 1e6 / 20 = 13.9 hours per worker to cover the keyspace) but move to a
# shared store (Redis or DB) if tightening is required for compliance.
_VERIFY_LIMIT_MAX = 5
_VERIFY_LIMIT_WINDOW = 60
_verify_rate_store: dict[int, list[float]] = defaultdict(list)
_verify_rate_lock = Lock()


def generate_totp_secret() -> str:
    """Generate a new base32 TOTP secret."""
    return pyotp.random_base32()


def build_otpauth_uri(email: str, secret: str) -> str:
    """Build an otpauth:// provisioning URI for QR rendering."""
    totp = pyotp.TOTP(secret)
    return totp.provisioning_uri(name=email, issuer_name=_TOTP_ISSUER)


def verify_totp_code(secret: str, code: str) -> bool:
    """Verify a 6-digit TOTP code against a secret (±1 window / ±30s skew).

    Stateless helper — does NOT guard against replay within the valid window.
    For login verification use verify_totp_and_advance_step.
    """
    if not code.isdigit() or len(code) != 6:
        return False
    totp = pyotp.TOTP(secret)
    return bool(totp.verify(code, valid_window=1))


def verify_totp_and_advance_step(user: User, code: str) -> bool:
    """Verify TOTP code and reject replay within the ±1 step window.

    Sets `user.totp_last_used_step` on success so the same code can't be
    re-submitted until it falls outside the valid window.
    """
    if user.totp_secret is None:
        return False
    if not code.isdigit() or len(code) != 6:
        return False
    totp = pyotp.TOTP(user.totp_secret)
    now = int(time.time())
    # pyotp TOTP step is 30s; look at current ±1.
    for offset in (-1, 0, 1):
        step = now // 30 + offset
        candidate = totp.at(step * 30)
        if secrets.compare_digest(candidate, code):
            if user.totp_last_used_step is not None and step <= user.totp_last_used_step:
                return False
            user.totp_last_used_step = step
            return True
    return False


def generate_backup_codes() -> list[str]:
    """Generate N plaintext backup codes (shown to user once)."""
    return [
        "".join(secrets.choice(_BACKUP_CODE_ALPHABET) for _ in range(_BACKUP_CODE_LENGTH))
        for _ in range(_BACKUP_CODE_COUNT)
    ]


async def replace_backup_codes(
    db: AsyncSession, user: User, plaintext_codes: list[str]
) -> None:
    """Delete existing backup codes for user and store new (hashed) ones."""
    await db.execute(delete(UserBackupCode).where(UserBackupCode.user_id == user.id))
    for plain in plaintext_codes:
        db.add(UserBackupCode(user_id=user.id, code_hash=hash_password(plain)))


async def delete_all_backup_codes(db: AsyncSession, user: User) -> None:
    """Delete all backup codes for a user."""
    await db.execute(delete(UserBackupCode).where(UserBackupCode.user_id == user.id))


async def consume_backup_code(db: AsyncSession, user: User, plaintext_code: str) -> bool:
    """Try to consume an unused backup code. Returns True if matched + consumed."""
    from datetime import datetime, timezone

    stmt = select(UserBackupCode).where(
        UserBackupCode.user_id == user.id, UserBackupCode.used_at.is_(None)
    )
    result = await db.execute(stmt)
    for bc in result.scalars():
        if verify_password(plaintext_code, bc.code_hash):
            bc.used_at = datetime.now(timezone.utc)
            db.add(bc)
            return True
    return False


async def remaining_backup_codes(db: AsyncSession, user: User) -> int:
    """Count unused backup codes for a user."""
    from sqlalchemy import func

    stmt = select(func.count(UserBackupCode.id)).where(
        UserBackupCode.user_id == user.id, UserBackupCode.used_at.is_(None)
    )
    result = await db.execute(stmt)
    return int(result.scalar_one() or 0)


def create_2fa_challenge_token(user: User) -> str:
    """Create a short-lived JWT that authorizes the /login/verify-2fa call."""
    return create_access_token(
        data={
            "sub": str(user.id),
            "scope": _CHALLENGE_SCOPE,
            "tv": user.token_version,
        },
        expires_delta=_CHALLENGE_TTL,
    )


def decode_2fa_challenge_token(token: str) -> dict[str, Any] | None:
    """Decode a 2FA challenge token. Returns payload if valid, else None."""
    payload = decode_access_token(token)
    if payload is None:
        return None
    if payload.get("scope") != _CHALLENGE_SCOPE:
        return None
    return payload


def check_verify_rate_limit(user_id: int) -> bool:
    """Sliding-window rate limit per user_id for 2FA verify. Returns True if allowed."""
    now = time.time()
    window_start = now - _VERIFY_LIMIT_WINDOW
    with _verify_rate_lock:
        _verify_rate_store[user_id] = [
            ts for ts in _verify_rate_store[user_id] if ts > window_start
        ]
        if len(_verify_rate_store[user_id]) >= _VERIFY_LIMIT_MAX:
            return False
        _verify_rate_store[user_id].append(now)
        return True


def reset_verify_rate_limit(user_id: int) -> None:
    """Clear rate-limit counters — used in tests and on successful verification."""
    with _verify_rate_lock:
        _verify_rate_store.pop(user_id, None)
