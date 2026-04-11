"""Service layer for global settings management."""

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_setting import GlobalSetting
from app.models.network import Network
from app.repositories.base import BaseRepository

# Constants for setting keys
SSH_ALERT_DEFAULTS_KEY = "ssh_alert_defaults"

# Keys in a network's alert_config that override SSH alert defaults.
# Order matches the form layout (toggles first, then threshold).
SSH_ALERT_KEYS: tuple[str, ...] = (
    "ssh_insecure_auth",
    "ssh_weak_cipher",
    "ssh_weak_kex",
    "ssh_outdated_version",
    "ssh_config_regression",
    "ssh_version_threshold",
)


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


async def find_networks_overriding_ssh(
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """Return networks whose alert_config overrides any SSH alert default.

    Loads networks with a non-null alert_config and filters in Python so the
    logic stays portable across MariaDB / SQLite (used by tests). Each entry
    reports the subset of SSH keys that are explicitly set on that network.
    """
    result = await db.execute(
        select(Network)
        .where(Network.alert_config.is_not(None))
        .order_by(Network.name)
    )
    networks = result.scalars().all()

    overriding: list[dict[str, Any]] = []
    for network in networks:
        config = network.alert_config or {}
        overridden = [k for k in SSH_ALERT_KEYS if k in config]
        if overridden:
            overriding.append(
                {
                    "id": network.id,
                    "name": network.name,
                    "overridden_keys": overridden,
                }
            )
    return overriding


async def clear_ssh_overrides_from_all_networks(db: AsyncSession) -> int:
    """Strip SSH-related keys from every network's alert_config.

    Preserves non-SSH keys (e.g., email_recipients). When the resulting config
    is empty, sets alert_config to NULL so the network falls fully back to
    global defaults. Returns the number of networks actually changed.
    """
    result = await db.execute(
        select(Network).where(Network.alert_config.is_not(None))
    )
    networks = result.scalars().all()

    cleared_count = 0
    for network in networks:
        config = dict(network.alert_config or {})
        before = len(config)
        for key in SSH_ALERT_KEYS:
            config.pop(key, None)
        if len(config) == before:
            continue
        # Re-assign so SQLAlchemy detects the JSON column mutation reliably.
        network.alert_config = config if config else None
        cleared_count += 1

    if cleared_count:
        await db.commit()
    return cleared_count
