"""Scan profile CRUD service."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import ScanProfile, ScanProfileSeverity, ScanProfileType
from app.schemas.nse import NseProfileCreate, NseProfileUpdate


async def get_all_profiles(
    db: AsyncSession,
    search: str | None = None,
    severity: str | None = None,
    platform: str | None = None,
    profile_type: str | None = None,
) -> list[ScanProfile]:
    """Get all profiles with optional filtering."""
    stmt = select(ScanProfile).order_by(
        ScanProfile.priority.asc(), ScanProfile.name.asc(),
    )

    if search:
        pattern = f"%{search}%"
        stmt = stmt.where(
            ScanProfile.name.ilike(pattern)
            | ScanProfile.description.ilike(pattern)
        )
    if severity:
        stmt = stmt.where(ScanProfile.severity == severity)
    if platform:
        stmt = stmt.where(ScanProfile.platform == platform)
    if profile_type:
        stmt = stmt.where(ScanProfile.type == profile_type)

    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_profile_by_id(
    db: AsyncSession, profile_id: int,
) -> ScanProfile | None:
    """Get a profile by ID."""
    result = await db.execute(
        select(ScanProfile).where(ScanProfile.id == profile_id),
    )
    return result.scalar_one_or_none()


async def create_profile(
    db: AsyncSession, data: NseProfileCreate,
) -> ScanProfile:
    """Create a new custom scan profile (legacy — no phases)."""
    profile = ScanProfile(
        name=data.name,
        description=data.description,
        severity=(
            ScanProfileSeverity(data.severity) if data.severity else None
        ),
        platform=data.platform,
        type=ScanProfileType.CUSTOM,
        enabled=data.enabled,
        priority=data.priority,
    )
    db.add(profile)
    return profile


async def create_profile_with_phases(
    db: AsyncSession,
    name: str,
    description: str = "",
    phases: list[dict[str, Any]] | None = None,
    severity: str | None = None,
    platform: str = "any",
    category: str | None = None,
    enabled: bool = True,
    priority: int = 10,
) -> ScanProfile:
    """Create a new custom scan profile with phases."""
    profile = ScanProfile(
        name=name,
        description=description,
        phases=phases,
        severity=(
            ScanProfileSeverity(severity) if severity else None
        ),
        platform=platform,
        type=ScanProfileType.CUSTOM,
        enabled=enabled,
        category=category,
        priority=priority,
    )
    db.add(profile)
    return profile


async def clone_profile(
    db: AsyncSession, source: ScanProfile, new_name: str,
) -> ScanProfile:
    """Clone an existing profile into a new custom profile."""
    cloned = ScanProfile(
        name=new_name,
        description=source.description,
        phases=list(source.phases) if source.phases else None,
        severity=source.severity,
        platform=source.platform,
        type=ScanProfileType.CUSTOM,
        enabled=source.enabled,
        category=source.category,
        priority=source.priority,
    )
    db.add(cloned)
    return cloned


async def update_profile(
    db: AsyncSession, profile: ScanProfile, data: NseProfileUpdate,
) -> ScanProfile:
    """Update a scan profile."""
    if data.name is not None:
        profile.name = data.name
    if data.description is not None:
        profile.description = data.description
    if data.severity is not None:
        profile.severity = (
            ScanProfileSeverity(data.severity) if data.severity else None
        )
    if data.platform is not None:
        profile.platform = data.platform
    if data.enabled is not None:
        profile.enabled = data.enabled
    if data.priority is not None:
        profile.priority = data.priority

    return profile


async def update_profile_phases(
    db: AsyncSession, profile: ScanProfile, phases: list[dict[str, Any]],
) -> ScanProfile:
    """Update a profile's phases."""
    profile.phases = phases
    return profile


async def delete_profile(db: AsyncSession, profile: ScanProfile) -> None:
    """Delete a scan profile."""
    await db.delete(profile)
