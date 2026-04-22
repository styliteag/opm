"""Authentication router for login, logout, and user info endpoints."""

import time
from collections import defaultdict
from threading import Lock
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.permissions import ROLE_PERMISSIONS
from app.core.security import verify_password
from app.schemas.auth import LoginRequest, UserResponse, UserThemeUpdateRequest
from app.schemas.two_factor import (
    BackupCodesRegenerateRequest,
    BackupCodesRegenerateResponse,
    LoginResponse,
    TotpDisableRequest,
    TotpEnrollStartRequest,
    TotpEnrollStartResponse,
    TotpEnrollVerifyRequest,
    TotpEnrollVerifyResponse,
    Verify2FARequest,
)
from app.services.auth import authenticate_user, create_user_token, get_user_by_id
from app.services.two_factor import (
    build_otpauth_uri,
    check_verify_rate_limit,
    consume_backup_code,
    create_2fa_challenge_token,
    decode_2fa_challenge_token,
    delete_all_backup_codes,
    generate_backup_codes,
    generate_totp_secret,
    remaining_backup_codes,
    replace_backup_codes,
    verify_totp_and_advance_step,
    verify_totp_code,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Rate limiting for login endpoint
_LOGIN_RATE_LIMIT_MAX = 10
_LOGIN_RATE_LIMIT_WINDOW = 60
_login_rate_store: dict[str, list[float]] = defaultdict(list)
_login_rate_lock = Lock()


def _check_login_rate_limit(request: Request) -> None:
    """Enforce sliding-window rate limit on login attempts."""
    client_ip = request.client.host if request.client else "unknown"
    if settings.trust_proxy_headers:
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        else:
            client_ip = request.headers.get("X-Real-IP") or client_ip

    now = time.time()
    window_start = now - _LOGIN_RATE_LIMIT_WINDOW

    with _login_rate_lock:
        _login_rate_store[client_ip] = [
            ts for ts in _login_rate_store[client_ip] if ts > window_start
        ]
        if len(_login_rate_store[client_ip]) >= _LOGIN_RATE_LIMIT_MAX:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many login attempts. Try again later.",
            )
        _login_rate_store[client_ip].append(now)


async def _build_user_response(db: DbSession, user: Any) -> UserResponse:
    remaining = await remaining_backup_codes(db, user)
    return UserResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        theme_preference=user.theme_preference,
        totp_enabled=user.totp_enabled,
        backup_codes_remaining=remaining,
    )


@router.post("/login", response_model=LoginResponse)
async def login(
    login_request: LoginRequest,
    db: DbSession,
    request: Request,
) -> LoginResponse:
    """Authenticate user.

    If the user has no 2FA enabled, returns a full access token.
    If 2FA is enabled, returns a short-lived challenge_token to be exchanged
    via /login/verify-2fa for the real access token.
    """
    _check_login_rate_limit(request)

    user = await authenticate_user(db, login_request.email, login_request.password)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.totp_enabled:
        challenge = create_2fa_challenge_token(user)
        return LoginResponse(requires_2fa=True, challenge_token=challenge)

    token = create_user_token(user)
    return LoginResponse(access_token=token.access_token, token_type=token.token_type)


@router.post("/login/verify-2fa", response_model=LoginResponse)
async def verify_2fa(
    verify_request: Verify2FARequest,
    db: DbSession,
) -> LoginResponse:
    """Exchange a challenge_token + TOTP or backup code for a real access token."""
    payload = decode_2fa_challenge_token(verify_request.challenge_token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired 2FA challenge",
        )

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge")
    try:
        user_id = int(user_id_str)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge")

    if not check_verify_rate_limit(user_id):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many 2FA attempts. Try again later.",
        )

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active or not user.totp_enabled or user.totp_secret is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge")

    # Token version must still match — prevents reuse across password/2FA changes
    if payload.get("tv") != user.token_version:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid challenge")

    code = verify_request.code.strip()
    ok = False
    if code.isdigit() and len(code) == 6:
        ok = verify_totp_and_advance_step(user, code)
    if not ok:
        ok = await consume_backup_code(db, user, code.upper())

    if not ok:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid 2FA code",
        )

    # Invalidate the challenge token by bumping token_version — the same
    # challenge_token carries the old tv and will fail on re-submission.
    user.token_version += 1
    db.add(user)
    await db.commit()
    token = create_user_token(user)
    return LoginResponse(access_token=token.access_token, token_type=token.token_type)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser,
    db: DbSession,
) -> UserResponse:
    """Get current user information."""
    return await _build_user_response(db, current_user)


@router.put("/me", response_model=UserResponse)
async def update_current_user_info(
    request: UserThemeUpdateRequest,
    db: DbSession,
    current_user: CurrentUser,
) -> UserResponse:
    """Update current user preferences."""
    current_user.theme_preference = request.theme_preference
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return await _build_user_response(db, current_user)


@router.get("/permissions")
async def get_current_user_permissions(
    current_user: CurrentUser,
) -> dict[str, Any]:
    """Get the current user's permissions based on their role."""
    permissions = ROLE_PERMISSIONS.get(current_user.role, frozenset())
    return {
        "role": current_user.role.value,
        "permissions": sorted(p.value for p in permissions),
    }


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Logout by incrementing token_version, invalidating all existing tokens."""
    current_user.token_version += 1
    db.add(current_user)
    await db.commit()


# ---------------------------------------------------------------------------
# 2FA management (self-service)
# ---------------------------------------------------------------------------


@router.post("/2fa/enroll/start", response_model=TotpEnrollStartResponse)
async def enroll_2fa_start(
    request: TotpEnrollStartRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TotpEnrollStartResponse:
    """Begin 2FA enrollment — generate a new pending TOTP secret + QR URI."""
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="2FA is already enabled. Disable it first to re-enroll.",
        )
    if not verify_password(request.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
        )
    secret = generate_totp_secret()
    current_user.totp_secret_pending = secret
    db.add(current_user)
    await db.commit()
    uri = build_otpauth_uri(current_user.email, secret)
    return TotpEnrollStartResponse(secret=secret, otpauth_uri=uri)


@router.post("/2fa/enroll/verify", response_model=TotpEnrollVerifyResponse)
async def enroll_2fa_verify(
    request: TotpEnrollVerifyRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> TotpEnrollVerifyResponse:
    """Verify 6-digit code and activate 2FA. Returns plaintext backup codes once."""
    if current_user.totp_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is already enabled"
        )
    if current_user.totp_secret_pending is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No 2FA enrollment in progress. Start enrollment first.",
        )
    if not verify_password(request.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
        )
    if not verify_totp_code(current_user.totp_secret_pending, request.code.strip()):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code"
        )

    current_user.totp_secret = current_user.totp_secret_pending
    current_user.totp_secret_pending = None
    current_user.totp_enabled = True
    # Keep the current session alive — the user needs to stay logged in to see
    # the backup codes that are about to be returned in this response body.
    # token_version is bumped on disable + admin reset where invalidation is
    # the intent.

    codes = generate_backup_codes()
    await replace_backup_codes(db, current_user, codes)
    db.add(current_user)
    await db.commit()
    return TotpEnrollVerifyResponse(backup_codes=codes)


@router.post("/2fa/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_2fa(
    request: TotpDisableRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> None:
    """Disable 2FA — requires password + current TOTP code."""
    if not current_user.totp_enabled or current_user.totp_secret is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled"
        )
    if not verify_password(request.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
        )
    if not verify_totp_code(current_user.totp_secret, request.code.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code"
        )

    current_user.totp_enabled = False
    current_user.totp_secret = None
    current_user.totp_secret_pending = None
    current_user.totp_last_used_step = None
    current_user.token_version += 1
    await delete_all_backup_codes(db, current_user)
    db.add(current_user)
    await db.commit()


@router.post("/2fa/backup-codes/regenerate", response_model=BackupCodesRegenerateResponse)
async def regenerate_backup_codes(
    request: BackupCodesRegenerateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> BackupCodesRegenerateResponse:
    """Generate a fresh set of backup codes — invalidates all previous ones."""
    if not current_user.totp_enabled or current_user.totp_secret is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="2FA is not enabled"
        )
    if not verify_password(request.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect password"
        )
    if not verify_totp_code(current_user.totp_secret, request.code.strip()):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid 2FA code"
        )

    codes = generate_backup_codes()
    await replace_backup_codes(db, current_user, codes)
    await db.commit()
    return BackupCodesRegenerateResponse(backup_codes=codes)
