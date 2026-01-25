"""Authentication service for user login and token management."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User, UserRole
from app.schemas.auth import TokenResponse


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    """Authenticate a user by email and password."""
    stmt = select(User).where(User.email == email)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if user is None:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user


def create_user_token(user: User) -> TokenResponse:
    """Create a JWT token for an authenticated user."""
    token_data = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role.value,
    }
    access_token = create_access_token(data=token_data)
    return TokenResponse(access_token=access_token)


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


async def create_admin_user(db: AsyncSession, email: str, password: str) -> User:
    """Create an admin user."""
    hashed_password = hash_password(password)
    user = User(
        email=email,
        password_hash=hashed_password,
        role=UserRole.ADMIN,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)
    return user
