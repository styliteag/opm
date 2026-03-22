"""Authentication router for login, logout, and user info endpoints."""

from typing import Any

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.core.permissions import ROLE_PERMISSIONS
from app.schemas.auth import LoginRequest, TokenResponse, UserResponse, UserThemeUpdateRequest
from app.services.auth import authenticate_user, create_user_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login(
    request: LoginRequest,
    db: DbSession,
) -> TokenResponse:
    """Authenticate user and return JWT token."""
    user = await authenticate_user(db, request.email, request.password)

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
) -> None:
    """Logout endpoint (no-op, token invalidation handled client-side)."""
    # JWT tokens are stateless, so logout is handled by the client
    # discarding the token. This endpoint exists for API completeness.
    pass
