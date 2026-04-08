"""Authentication router for login, logout, and user info endpoints."""

import time
from collections import defaultdict
from threading import Lock
from typing import Any

from fastapi import APIRouter, HTTPException, Request, status

from app.core.deps import CurrentUser, DbSession
from app.core.permissions import ROLE_PERMISSIONS
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse, UserThemeUpdateRequest
from app.services.auth import authenticate_user, create_user_token

router = APIRouter(prefix="/api/auth", tags=["auth"])

# Rate limiting for login endpoint
_LOGIN_RATE_LIMIT_MAX = 10
_LOGIN_RATE_LIMIT_WINDOW = 60
_login_rate_store: dict[str, list[float]] = defaultdict(list)
_login_rate_lock = Lock()


def _check_login_rate_limit(request: Request) -> None:
    """Enforce sliding-window rate limit on login attempts."""
    forwarded = request.headers.get("X-Forwarded-For")
    client_ip = (
        forwarded.split(",")[0].strip()
        if forwarded
        else (
            request.headers.get("X-Real-IP")
            or (request.client.host if request.client else "unknown")
        )
    )

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


@router.post("/login", response_model=TokenResponse)
async def login(
    login_request: LoginRequest,
    db: DbSession,
    request: Request,
) -> TokenResponse:
    """Authenticate user and return JWT token."""
    _check_login_rate_limit(request)

    user = await authenticate_user(db, login_request.email, login_request.password)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return create_user_token(user)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUser,
) -> UserResponse:
    """Get current user information."""
    return UserResponse.model_validate(current_user)


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
    return UserResponse.model_validate(current_user)


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
