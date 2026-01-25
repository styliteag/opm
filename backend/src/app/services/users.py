"""User management service for CRUD operations."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole


async def get_all_users(db: AsyncSession) -> list[User]:
    """Get all users."""
    stmt = select(User).order_by(User.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    """Get a user by their ID."""
    stmt = select(User).where(User.id == user_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    """Get a user by their email."""
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    password: str,
    role: UserRole = UserRole.VIEWER,
) -> User:
    """Create a new user."""
    hashed_password = hash_password(password)
    user = User(
        email=email,
        password_hash=hashed_password,
        role=role,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user


async def update_user(
    db: AsyncSession,
    user: User,
    email: str | None = None,
    password: str | None = None,
    role: UserRole | None = None,
) -> User:
    """Update an existing user."""
    if email is not None:
        user.email = email
    if password is not None:
        user.password_hash = hash_password(password)
    if role is not None:
        user.role = role

    await db.flush()
    await db.refresh(user)
    return user


async def delete_user(db: AsyncSession, user: User) -> None:
    """Delete a user."""
    await db.delete(user)
    await db.flush()
