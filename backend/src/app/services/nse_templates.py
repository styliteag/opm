"""NSE profile CRUD service."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import NseTemplate, NseTemplateSeverity, NseTemplateType
from app.schemas.nse import NseProfileCreate, NseProfileUpdate


async def get_all_profiles(
    db: AsyncSession,
    search: str | None = None,
    severity: str | None = None,
    platform: str | None = None,
    profile_type: str | None = None,
) -> list[NseTemplate]:
    """Get all profiles with optional filtering."""
    stmt = select(NseTemplate).order_by(NseTemplate.priority.asc(), NseTemplate.name.asc())

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            NseTemplate.name.ilike(pattern) | NseTemplate.description.ilike(pattern)
        )
    if severity:
        stmt = stmt.where(NseTemplate.severity == severity)
    if platform:
        stmt = stmt.where(NseTemplate.platform == platform)
    if profile_type:
        stmt = stmt.where(NseTemplate.type == profile_type)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_profile_by_id(db: AsyncSession, profile_id: int) -> NseTemplate | None:
    """Get a profile by ID."""
    result = await db.execute(select(NseTemplate).where(NseTemplate.id == profile_id))
    return result.scalar_one_or_none()


async def create_profile(db: AsyncSession, data: NseProfileCreate) -> NseTemplate:
    """Create a new custom NSE profile."""
    profile = NseTemplate(
        name=data.name,
        description=data.description,
        nse_scripts=data.nse_scripts,
        severity=NseTemplateSeverity(data.severity) if data.severity else None,
        platform=data.platform,
        type=NseTemplateType.CUSTOM,
        enabled=data.enabled,
        script_args=data.script_args,
        priority=data.priority,
    )
    db.add(profile)
    return profile


async def clone_profile(db: AsyncSession, source: NseTemplate, new_name: str) -> NseTemplate:
    """Clone an existing profile (builtin or custom) into a new custom profile."""
    cloned = NseTemplate(
        name=new_name,
        description=source.description,
        nse_scripts=list(source.nse_scripts),  # new list, no mutation
        severity=source.severity,
        platform=source.platform,
        type=NseTemplateType.CUSTOM,
        enabled=source.enabled,
        script_args=dict(source.script_args) if source.script_args else None,
        priority=source.priority,
    )
    db.add(cloned)
    return cloned


async def update_profile(
    db: AsyncSession, profile: NseTemplate, data: NseProfileUpdate
) -> NseTemplate:
    """Update an NSE profile."""

    if data.name is not None:
        profile.name = data.name
    if data.description is not None:
        profile.description = data.description
    if data.nse_scripts is not None:
        profile.nse_scripts = data.nse_scripts
    if data.severity is not None:
        profile.severity = NseTemplateSeverity(data.severity) if data.severity else None
    if data.platform is not None:
        profile.platform = data.platform
    if data.script_args is not None:
        profile.script_args = data.script_args
    if data.enabled is not None:
        profile.enabled = data.enabled
    if data.priority is not None:
        profile.priority = data.priority

    return profile


async def delete_profile(db: AsyncSession, profile: NseTemplate) -> None:
    """Delete an NSE profile."""
    await db.delete(profile)
