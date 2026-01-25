"""User management schemas for CRUD operations."""

from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.user import ThemePreference, UserRole


class UserCreateRequest(BaseModel):
    """Request schema for creating a new user."""

    email: EmailStr
    password: str
    role: UserRole = UserRole.VIEWER


class UserUpdateRequest(BaseModel):
    """Request schema for updating a user."""

    email: EmailStr | None = None
    password: str | None = None
    role: UserRole | None = None


class UserResponse(BaseModel):
    """User information response."""

    id: int
    email: str
    role: UserRole
    theme_preference: ThemePreference
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """Response schema for list of users."""

    users: list[UserResponse]
