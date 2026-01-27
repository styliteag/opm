"""Security utilities for password hashing and JWT tokens."""

from datetime import datetime, timedelta, timezone
from typing import TYPE_CHECKING, Any

import jwt
from jwt.exceptions import PyJWTError

if TYPE_CHECKING:
    from passlib.context import CryptContext

from .config import settings

# Password hashing context using bcrypt
# Use bcrypt_sha256 instead of bcrypt to avoid 72-byte limitation issues
# bcrypt_sha256 hashes the password with SHA256 first, eliminating the 72-byte limit
# Lazy initialization to handle passlib bug detection issues
_pwd_context: "CryptContext | None" = None


def _get_pwd_context() -> "CryptContext":
    """Get or create the password context with fallback handling."""
    global _pwd_context
    if _pwd_context is None:
        from passlib.context import CryptContext

        # Use pbkdf2_sha256 to avoid bcrypt initialization issues
        # bcrypt has a bug detection that can fail with long test passwords
        # pbkdf2_sha256 is secure and doesn't have this limitation
        _pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
    return _pwd_context


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against a hashed password."""
    return _get_pwd_context().verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return _get_pwd_context().hash(password)


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """Create a JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expiration_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)  # type: ignore[return-value]


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode a JWT access token. Returns None if invalid."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
        return payload
    except PyJWTError:
        return None
