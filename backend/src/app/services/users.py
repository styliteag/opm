"""User management service for CRUD operations."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.repositories.base import BaseRepository


class UserRepository(BaseRepository[User]):
    model = User


async def get_all_users(db: AsyncSession) -> list[User]:
    """Get all users."""
    return await UserRepository(db).get_all(order_by=User.created_at)


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """Get a user by their ID."""
    return await UserRepository(db).get_by_id(user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Get a user by their email."""
    return await UserRepository(db).get_by_field(User.email, email)


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    role: UserRole = UserRole.VIEWER,
) -> User:
    """Create a new user."""
    hashed_password = hash_password(password)
    return await UserRepository(db).create(
        email=email,
        password_hash=hashed_password,
        role=role,
    )


async def update_user(
    db: AsyncSession,
    user: User,
    email: str | None = None,
    password: str | None = None,
    role: UserRole | None = None,
    is_active: bool | None = None,
) -> User:
    """Update an existing user."""
    if email is not None:
        user.email = email
    if password is not None:
        user.password_hash = hash_password(password)
        user.token_version += 1
    if role is not None:
        user.role = role
    if is_active is not None:
        user.is_active = is_active

    return await UserRepository(db).flush_and_refresh(user)


async def delete_user(db: AsyncSession, user: User) -> None:
    """Delete a user."""
    await UserRepository(db).delete(user)
