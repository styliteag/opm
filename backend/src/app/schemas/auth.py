"""Authentication request and response schemas."""

from pydantic import BaseModel, EmailStr

from app.models.user import ThemePreference, UserRole


class LoginRequest(BaseModel):
    """Login request with email and password."""

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    """User information response."""

    id: int
    email: str
    role: UserRole
    theme_preference: ThemePreference

    model_config = {"from_attributes": True}


class UserThemeUpdateRequest(BaseModel):
    """Update theme preference for current user."""

    theme_preference: ThemePreference
