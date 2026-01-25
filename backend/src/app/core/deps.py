"""FastAPI dependencies for authentication and database access."""

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.scanner import Scanner
from app.models.user import User, UserRole
from app.services.auth import get_user_by_id

# HTTP Bearer token security scheme
security = HTTPBearer()


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    """Dependency to get the current authenticated user from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise credentials_exception

    user_id_str = payload.get("sub")
    if user_id_str is None:
        raise credentials_exception

    try:
        user_id = int(user_id_str)
    except ValueError:
        raise credentials_exception

    user = await get_user_by_id(db, user_id)
    if user is None:
        raise credentials_exception

    return user


# Type alias for dependency injection
CurrentUser = Annotated[User, Depends(get_current_user)]
DbSession = Annotated[AsyncSession, Depends(get_db)]


async def require_admin(
    current_user: CurrentUser,
) -> User:
    """Dependency to require admin role for access."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


# Type alias for admin-only access
AdminUser = Annotated[User, Depends(require_admin)]


async def get_current_scanner(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(security)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Scanner:
    """Dependency to get the current authenticated scanner from JWT token."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate scanner credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = credentials.credentials
    payload = decode_access_token(token)

    if payload is None:
        raise credentials_exception

    # Check that this is a scanner-scoped token
    scope = payload.get("scope")
    if scope != "scanner":
        raise credentials_exception

    scanner_id_str = payload.get("sub")
    if scanner_id_str is None:
        raise credentials_exception

    try:
        scanner_id = int(scanner_id_str)
    except ValueError:
        raise credentials_exception

    # Fetch the scanner from database
    result = await db.execute(select(Scanner).where(Scanner.id == scanner_id))
    scanner = result.scalar_one_or_none()

    if scanner is None:
        raise credentials_exception

    return scanner


# Type alias for scanner dependency injection
CurrentScanner = Annotated[Scanner, Depends(get_current_scanner)]
