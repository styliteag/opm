"""Organization service for managing single-org settings."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.organization import Organization
from app.repositories.base import BaseRepository
from app.schemas.organization import OrganizationUpdateRequest


class OrganizationRepository(BaseRepository[Organization]):
    model = Organization


async def get_organization(db: AsyncSession) -> Organization:
    """Get the organization, creating a default one if none exists."""
    repo = OrganizationRepository(db)
    orgs = await repo.get_all()
    if not orgs:
        return await repo.create(name="My Organization")
    return orgs[0]


async def update_organization(
    db: AsyncSession,
    org: Organization,
    update: OrganizationUpdateRequest,
) -> Organization:
    """Update organization settings with provided fields."""
    update_data = update.model_dump(exclude_unset=True)
    return await OrganizationRepository(db).update(org, **update_data)
