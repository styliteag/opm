"""Global settings API endpoints."""

from fastapi import APIRouter, status

from app.core.deps import AdminUser, DbSession
from app.schemas.global_settings import SSHAlertDefaults, UpdateSSHAlertDefaultsRequest
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
