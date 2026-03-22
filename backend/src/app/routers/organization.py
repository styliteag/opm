"""Organization management router."""

from fastapi import APIRouter

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.schemas.organization import OrganizationResponse, OrganizationUpdateRequest
from app.services.organization import get_organization, update_organization

router = APIRouter(prefix="/api/organization", tags=["organization"])


@router.get("", response_model=OrganizationResponse)
async def get_org(
    db: DbSession,
    _user: CurrentUser,
) -> OrganizationResponse:
    """Get organization settings."""
    org = await get_organization(db)
    await db.commit()
    return OrganizationResponse.model_validate(org)


@router.put("", response_model=OrganizationResponse)
async def update_org(
    db: DbSession,
    admin: AdminUser,
    body: OrganizationUpdateRequest,
) -> OrganizationResponse:
    """Update organization settings. Admin only."""
    org = await get_organization(db)
    updated = await update_organization(db, org, body)
    await db.commit()
    return OrganizationResponse.model_validate(updated)
