"""Service layer for global settings management."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_setting import GlobalSetting


# Constants for setting keys
SSH_ALERT_DEFAULTS_KEY = "ssh_alert_defaults"


async def get_setting(db: AsyncSession, key: str) -> dict[str, Any] | None:
    """Get a global setting by key.

    Args:
        db: Database session
        key: Setting key

    Returns:
        Setting value as dict or None if not found
    """
    result = await db.execute(select(GlobalSetting).where(GlobalSetting.key == key))
    setting = result.scalar_one_or_none()
    return setting.value if setting else None


async def set_setting(db: AsyncSession, key: str, value: dict[str, Any] | None) -> GlobalSetting:
    """Set or update a global setting.

    Args:
        db: Database session
        key: Setting key
        value: Setting value (JSON-serializable dict)

    Returns:
        Updated or created GlobalSetting instance
    """
    result = await db.execute(select(GlobalSetting).where(GlobalSetting.key == key))
    setting = result.scalar_one_or_none()

    if setting:
        setting.value = value
    else:
        setting = GlobalSetting(key=key, value=value)
        db.add(setting)

    await db.flush()
    await db.refresh(setting)
    return setting


async def get_ssh_alert_defaults(db: AsyncSession) -> dict[str, Any]:
    """Get SSH alert defaults configuration.

    Returns default values if not set in database.

    Args:
        db: Database session

    Returns:
        SSH alert defaults configuration
    """
    value = await get_setting(db, SSH_ALERT_DEFAULTS_KEY)
    if value is None:
        # Return hardcoded defaults
        return {
            "ssh_insecure_auth": True,
            "ssh_weak_cipher": False,
            "ssh_weak_kex": False,
            "ssh_outdated_version": False,
            "ssh_config_regression": True,
            "ssh_version_threshold": "8.0.0",
        }
    return value


async def update_ssh_alert_defaults(
    db: AsyncSession, updates: dict[str, Any]
) -> dict[str, Any]:
    """Update SSH alert defaults configuration.

    Args:
        db: Database session
        updates: Partial updates to apply

    Returns:
        Updated SSH alert defaults configuration
    """
    # Get current defaults
    current = await get_ssh_alert_defaults(db)

    # Apply updates
    for key, value in updates.items():
        if value is not None:  # Only update non-None values
            current[key] = value

    # Save to database
    await set_setting(db, SSH_ALERT_DEFAULTS_KEY, current)
    await db.commit()

    return current
