"""Schemas for global settings management."""

import re
from typing import Any

from pydantic import BaseModel, field_validator

# Accepts "8", "8.0", "8.0.0", "10.12.3" — refuses "foo", "8.x", empty, etc.
# Applies only to OpenSSH version threshold; other SSH implementations
# (Dropbear, libssh) are not version-checked.
_OPENSSH_VERSION_RE = re.compile(r"^\d+(\.\d+){1,2}$")


def _validate_openssh_version(value: str) -> str:
    if not _OPENSSH_VERSION_RE.match(value):
        raise ValueError(
            "ssh_version_threshold must look like '8.0' or '8.0.0' "
            "(OpenSSH version, digits and dots only)"
        )
    return value


class SSHAlertDefaults(BaseModel):
    """Default SSH alert configuration."""

    ssh_insecure_auth: bool = True
    ssh_weak_cipher: bool = False
    ssh_weak_kex: bool = False
    ssh_outdated_version: bool = False
    ssh_config_regression: bool = True
    ssh_version_threshold: str = "8.0.0"

    @field_validator("ssh_version_threshold")
    @classmethod
    def _check_version(cls, v: str) -> str:
        return _validate_openssh_version(v)


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

    @field_validator("ssh_version_threshold")
    @classmethod
    def _check_version(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return _validate_openssh_version(v)


class OverridingNetwork(BaseModel):
    """A network whose alert_config overrides one or more SSH defaults."""

    id: int
    name: str
    overridden_keys: list[str]


class OverridingNetworksResponse(BaseModel):
    """List of networks overriding the global SSH alert defaults."""

    total_count: int
    networks: list[OverridingNetwork]


class ApplyToAllResponse(BaseModel):
    """Result of clearing SSH overrides from every network."""

    cleared_count: int
