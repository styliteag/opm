"""User management router for admin CRUD operations."""

from fastapi import APIRouter, HTTPException, status

from app.core.deps import AdminUser, DbSession
from app.schemas.user import (
    UserCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdateRequest,
)
from app.services import users as users_service

router = APIRouter(prefix="/api/users", tags=["users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    admin: AdminUser,
    db: DbSession,
) -> UserListResponse:
    """Get list of all users (admin only)."""
    users = await users_service.get_all_users(db)
    return UserListResponse(
        users=[UserResponse.model_validate(user) for user in users]
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    admin: AdminUser,
    db: DbSession,
    request: UserCreateRequest,
) -> UserResponse:
    """Create a new user (admin only)."""
    # Check if email already exists
    existing_user = await users_service.get_user_by_email(db, request.email)
    if existing_user is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with this email already exists",
        )

    user = await users_service.create_user(
        db=db,
        email=request.email,
        password=request.password,
        role=request.role,
    )
    await db.commit()
    return UserResponse.model_validate(user)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    admin: AdminUser,
    db: DbSession,
    user_id: int,
) -> UserResponse:
    """Get user details by ID (admin only)."""
    user = await users_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    admin: AdminUser,
    db: DbSession,
    user_id: int,
    request: UserUpdateRequest,
) -> UserResponse:
    """Update user email, role, or password (admin only)."""
    user = await users_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # If updating email, check it doesn't conflict with another user
    if request.email is not None and request.email != user.email:
        existing_user = await users_service.get_user_by_email(db, request.email)
        if existing_user is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A user with this email already exists",
            )

    updated_user = await users_service.update_user(
        db=db,
        user=user,
        email=request.email,
        password=request.password,
        role=request.role,
    )
    await db.commit()
    return UserResponse.model_validate(updated_user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    admin: AdminUser,
    db: DbSession,
    user_id: int,
) -> None:
    """Delete a user (admin only)."""
    user = await users_service.get_user_by_id(db, user_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    await users_service.delete_user(db, user)
    await db.commit()
