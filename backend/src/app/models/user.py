"""User model for authentication and access control."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base

if TYPE_CHECKING:
    pass


class UserRole(str, Enum):
    """User roles for access control."""

    ADMIN = "admin"
    VIEWER = "viewer"


class ThemePreference(str, Enum):
    """User theme preferences."""

    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class User(Base):
    """User model for authentication and authorization."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        SQLEnum(UserRole, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=UserRole.VIEWER,
    )
    theme_preference: Mapped[ThemePreference] = mapped_column(
        SQLEnum(ThemePreference, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=ThemePreference.SYSTEM,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )

    # Relationships
