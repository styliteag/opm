"""Scanner management router for admin CRUD operations."""

from fastapi import APIRouter, HTTPException, status

from app.core.deps import AdminUser, DbSession
from app.schemas.scanner import (
    ScannerCreateRequest,
    ScannerCreateResponse,
    ScannerListResponse,
    ScannerRegenerateKeyResponse,
    ScannerResponse,
    ScannerUpdateRequest,
)
from app.services import scanners as scanners_service

router = APIRouter(prefix="/api/scanners", tags=["scanners"])


@router.get("", response_model=ScannerListResponse)
async def list_scanners(
    admin: AdminUser,
    db: DbSession,
) -> ScannerListResponse:
    """Get list of all scanners with last_seen status (admin only)."""
    scanners = await scanners_service.get_all_scanners(db)
    return ScannerListResponse(
        scanners=[ScannerResponse.model_validate(scanner) for scanner in scanners]
    )


@router.post("", response_model=ScannerCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_scanner(
    admin: AdminUser,
    db: DbSession,
    request: ScannerCreateRequest,
) -> ScannerCreateResponse:
    """Create a new scanner and return the API key (shown once)."""
    # Check if name already exists
    existing_scanner = await scanners_service.get_scanner_by_name(db, request.name)
    if existing_scanner is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A scanner with this name already exists",
        )

    scanner, api_key = await scanners_service.create_scanner(
        db=db,
        name=request.name,
        description=request.description,
    )
    await db.commit()

    return ScannerCreateResponse(
        id=scanner.id,
        name=scanner.name,
        description=scanner.description,
        last_seen_at=scanner.last_seen_at,
        created_at=scanner.created_at,
        api_key=api_key,
    )


@router.get("/{scanner_id}", response_model=ScannerResponse)
async def get_scanner(
    admin: AdminUser,
    db: DbSession,
    scanner_id: int,
) -> ScannerResponse:
    """Get scanner details by ID (without API key)."""
    scanner = await scanners_service.get_scanner_by_id(db, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scanner not found",
        )
    return ScannerResponse.model_validate(scanner)


@router.put("/{scanner_id}", response_model=ScannerResponse)
async def update_scanner(
    admin: AdminUser,
    db: DbSession,
    scanner_id: int,
    request: ScannerUpdateRequest,
) -> ScannerResponse:
    """Update scanner name/description."""
    scanner = await scanners_service.get_scanner_by_id(db, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scanner not found",
        )

    # If updating name, check it doesn't conflict with another scanner
    if request.name is not None and request.name != scanner.name:
        existing_scanner = await scanners_service.get_scanner_by_name(db, request.name)
        if existing_scanner is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A scanner with this name already exists",
            )

    updated_scanner = await scanners_service.update_scanner(
        db=db,
        scanner=scanner,
        name=request.name,
        description=request.description,
    )
    await db.commit()
    return ScannerResponse.model_validate(updated_scanner)


@router.delete("/{scanner_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scanner(
    admin: AdminUser,
    db: DbSession,
    scanner_id: int,
) -> None:
    """Delete a scanner and cascade to assigned networks."""
    scanner = await scanners_service.get_scanner_by_id(db, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scanner not found",
        )

    await scanners_service.delete_scanner(db, scanner)
    await db.commit()


@router.post("/{scanner_id}/regenerate-key", response_model=ScannerRegenerateKeyResponse)
async def regenerate_scanner_api_key(
    admin: AdminUser,
    db: DbSession,
    scanner_id: int,
) -> ScannerRegenerateKeyResponse:
    """Generate a new API key for a scanner, invalidating the old one."""
    scanner = await scanners_service.get_scanner_by_id(db, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Scanner not found",
        )

    updated_scanner, api_key = await scanners_service.regenerate_api_key(db, scanner)
    await db.commit()

    return ScannerRegenerateKeyResponse(
        id=updated_scanner.id,
        name=updated_scanner.name,
        api_key=api_key,
    )
