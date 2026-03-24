"""Scan profile management router — phase-aware profiles."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession, OperatorUser
from app.schemas.nse import (
    ScanProfileCreate,
    ScanProfileListResponse,
    ScanProfileResponse,
    ScanProfileUpdate,
)
from app.services import nse_templates as profile_service

router = APIRouter(prefix="/api/scan-profiles", tags=["scan-profiles"])


@router.get("", response_model=ScanProfileListResponse)
async def list_profiles(
    _user: CurrentUser,
    db: DbSession,
    search: str | None = Query(None),
    severity: str | None = Query(None),
    platform: str | None = Query(None),
    type: str | None = Query(None),
) -> ScanProfileListResponse:
    """List all scan profiles with optional filtering."""
    profiles = await profile_service.get_all_profiles(
        db, search=search, severity=severity, platform=platform,
        profile_type=type,
    )
    return ScanProfileListResponse(
        profiles=[ScanProfileResponse.model_validate(p) for p in profiles],
        total=len(profiles),
    )


@router.get("/{profile_id}", response_model=ScanProfileResponse)
async def get_profile(
    _user: CurrentUser,
    db: DbSession,
    profile_id: int,
) -> ScanProfileResponse:
    """Get a single scan profile by ID."""
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )
    return ScanProfileResponse.model_validate(profile)


@router.post(
    "",
    response_model=ScanProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_profile(
    _user: OperatorUser,
    db: DbSession,
    request: ScanProfileCreate,
) -> ScanProfileResponse:
    """Create a scan profile with phases."""
    phases = [p.model_dump() for p in request.phases]
    profile = await profile_service.create_profile_with_phases(
        db,
        name=request.name,
        description=request.description,
        phases=phases,
        severity=request.severity,
        platform=request.platform,
        category=request.category,
        enabled=request.enabled,
        priority=request.priority,
    )
    await db.commit()
    await db.refresh(profile)
    return ScanProfileResponse.model_validate(profile)


@router.put("/{profile_id}", response_model=ScanProfileResponse)
async def update_profile(
    _user: OperatorUser,
    db: DbSession,
    profile_id: int,
    request: ScanProfileUpdate,
) -> ScanProfileResponse:
    """Update a scan profile. Built-in profiles cannot be edited."""
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    if profile.type == "builtin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Built-in profiles cannot be edited. Create a copy.",
        )

    if request.name is not None:
        profile.name = request.name
    if request.description is not None:
        profile.description = request.description
    if request.phases is not None:
        profile.phases = [p.model_dump() for p in request.phases]
    if request.severity is not None:
        profile.severity = request.severity
    if request.platform is not None:
        profile.platform = request.platform
    if request.category is not None:
        profile.category = request.category
    if request.enabled is not None:
        profile.enabled = request.enabled
    if request.priority is not None:
        profile.priority = request.priority

    await db.commit()
    await db.refresh(profile)
    return ScanProfileResponse.model_validate(profile)


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    _user: OperatorUser,
    db: DbSession,
    profile_id: int,
) -> None:
    """Delete a scan profile. Built-in profiles cannot be deleted."""
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    if profile.type == "builtin":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Built-in profiles cannot be deleted.",
        )

    await profile_service.delete_profile(db, profile)
    await db.commit()


@router.post(
    "/{profile_id}/clone",
    response_model=ScanProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_profile(
    _user: OperatorUser,
    db: DbSession,
    profile_id: int,
    name: str = Query(..., description="Name for the cloned profile"),
) -> ScanProfileResponse:
    """Clone an existing profile into a new custom profile."""
    source = await profile_service.get_profile_by_id(db, profile_id)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Profile not found",
        )

    cloned = await profile_service.clone_profile(db, source, name)
    await db.commit()
    await db.refresh(cloned)
    return ScanProfileResponse.model_validate(cloned)
