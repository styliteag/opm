"""Organization service for managing single-org settings."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.schemas.organization import OrganizationUpdateRequest


async def get_organization(db: AsyncSession) -> Organization:
    """Get the organization, creating a default one if none exists."""
    result = await db.execute(select(Organization).limit(1))
    org = result.scalar_one_or_none()

    if org is None:
        org = Organization(name="My Organization")
        db.add(org)
        await db.flush()

    return org


async def update_organization(
    db: AsyncSession,
    org: Organization,
    update: OrganizationUpdateRequest,
) -> Organization:
    """Update organization settings with provided fields."""
    update_data = update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(org, field, value)
    await db.flush()
    return org
