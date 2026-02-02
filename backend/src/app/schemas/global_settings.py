"""Schemas for global settings management."""

from typing import Any

from pydantic import BaseModel


class SSHAlertDefaults(BaseModel):
    """Default SSH alert configuration."""

    ssh_insecure_auth: bool = True
    ssh_weak_cipher: bool = False
    ssh_weak_kex: bool = False
    ssh_outdated_version: bool = False
    ssh_config_regression: bool = True
    ssh_version_threshold: str = "8.0.0"


class GlobalSettingResponse(BaseModel):
    """Response schema for global settings."""

    key: str
    value: dict[str, Any] | None

    model_config = {"from_attributes": True}


class UpdateSSHAlertDefaultsRequest(BaseModel):
    """Request schema for updating SSH alert defaults."""

    ssh_insecure_auth: bool | None = None
    ssh_weak_cipher: bool | None = None
    ssh_weak_kex: bool | None = None
    ssh_outdated_version: bool | None = None
    ssh_config_regression: bool | None = None
    ssh_version_threshold: str | None = None
