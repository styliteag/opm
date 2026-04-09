"""User model for authentication and access control."""

from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.alert import Alert
    from app.models.alert_comment import AlertComment


class UserRole(str, Enum):
    """User roles for access control."""

    ADMIN = "admin"
    OPERATOR = "operator"
    ANALYST = "analyst"
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
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    theme_preference: Mapped[ThemePreference] = mapped_column(
        SQLEnum(ThemePreference, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=ThemePreference.SYSTEM,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.utc_timestamp(), onupdate=func.utc_timestamp()
    )

    # Relationships
    alert_comments: Mapped[list["AlertComment"]] = relationship(
        "AlertComment", back_populates="user"
    )
    assigned_alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="assigned_to")
