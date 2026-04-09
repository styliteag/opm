"""Service layer for global settings management."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_setting import GlobalSetting
from app.repositories.base import BaseRepository

# Constants for setting keys
SSH_ALERT_DEFAULTS_KEY = "ssh_alert_defaults"


class GlobalSettingRepository(BaseRepository[GlobalSetting]):
    model = GlobalSetting


async def get_setting(db: AsyncSession, key: str) -> dict[str, Any] | None:
    """Get a global setting by key."""
    setting = await GlobalSettingRepository(db).get_by_field(GlobalSetting.key, key)
    return setting.value if setting else None


async def set_setting(db: AsyncSession, key: str, value: dict[str, Any] | None) -> GlobalSetting:
    """Set or update a global setting."""
    repo = GlobalSettingRepository(db)
    setting = await repo.get_by_field(GlobalSetting.key, key)

    if setting:
        return await repo.update(setting, value=value)
    return await repo.create(key=key, value=value)


async def get_ssh_alert_defaults(db: AsyncSession) -> dict[str, Any]:
    """Get SSH alert defaults configuration."""
    value = await get_setting(db, SSH_ALERT_DEFAULTS_KEY)
    if value is None:
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
    """Update SSH alert defaults configuration."""
    current = await get_ssh_alert_defaults(db)

    for key, value in updates.items():
        if value is not None:
            current[key] = value

    await set_setting(db, SSH_ALERT_DEFAULTS_KEY, current)
    await db.commit()

    return current
