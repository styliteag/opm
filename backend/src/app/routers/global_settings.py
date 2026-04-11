"""Global settings API endpoints."""

from fastapi import APIRouter, status

from app.core.deps import AdminUser, DbSession
from app.schemas.global_settings import (
    ApplyToAllResponse,
    OverridingNetwork,
    OverridingNetworksResponse,
    SSHAlertDefaults,
    UpdateSSHAlertDefaultsRequest,
)
from app.services import global_settings as settings_service

router = APIRouter(prefix="/api/settings", tags=["settings"])


@router.get("/ssh-alert-defaults", response_model=SSHAlertDefaults)
async def get_ssh_alert_defaults(
    user: AdminUser,
    db: DbSession,
) -> SSHAlertDefaults:
    """
    Get global default settings for SSH security alerts.

    These defaults are used when a network's alert_config is null
    (i.e., when "use defaults" is enabled for a network).
    """
    defaults = await settings_service.get_ssh_alert_defaults(db)
    return SSHAlertDefaults(**defaults)


@router.put(
    "/ssh-alert-defaults",
    response_model=SSHAlertDefaults,
    status_code=status.HTTP_200_OK,
)
async def update_ssh_alert_defaults(
    user: AdminUser,
    db: DbSession,
    request: UpdateSSHAlertDefaultsRequest,
) -> SSHAlertDefaults:
    """
    Update global default settings for SSH security alerts.

    Only provided fields will be updated; others will remain unchanged.
    """
    updates = request.model_dump(exclude_unset=True)
    updated = await settings_service.update_ssh_alert_defaults(db, updates)
    return SSHAlertDefaults(**updated)


@router.get(
    "/ssh-alert-defaults/overriding-networks",
    response_model=OverridingNetworksResponse,
)
async def list_networks_overriding_ssh_defaults(
    user: AdminUser,
    db: DbSession,
) -> OverridingNetworksResponse:
    """
    List networks whose `alert_config` overrides one or more SSH defaults.

    A network "overrides" if any of the six SSH-related keys is present in
    its alert_config. The response reports which keys are overridden so the
    UI can summarize per-network divergence from globals.
    """
    overriding = await settings_service.find_networks_overriding_ssh(db)
    return OverridingNetworksResponse(
        total_count=len(overriding),
        networks=[OverridingNetwork(**entry) for entry in overriding],
    )


@router.post(
    "/ssh-alert-defaults/apply-to-all",
    response_model=ApplyToAllResponse,
    status_code=status.HTTP_200_OK,
)
async def apply_ssh_defaults_to_all_networks(
    user: AdminUser,
    db: DbSession,
) -> ApplyToAllResponse:
    """
    Strip every per-network SSH alert override so all networks fall back to
    the global SSH alert defaults.

    Only the SSH-related keys are removed from each network's `alert_config`;
    unrelated keys (e.g. `email_recipients`) are preserved. Networks whose
    config becomes empty get `alert_config = NULL`.
    """
    cleared = await settings_service.clear_ssh_overrides_from_all_networks(db)
    return ApplyToAllResponse(cleared_count=cleared)
