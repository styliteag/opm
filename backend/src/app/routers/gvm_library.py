"""User-facing GVM library and per-scanner mirror endpoints."""

from typing import Literal

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from app.core.deps import CurrentUser, DbSession, OperatorUser
from app.schemas.gvm_library import (
    GvmLibraryEntryResponse,
    GvmLibraryListResponse,
    GvmScannerMetadataEntryResponse,
    GvmScannerMirrorResponse,
    GvmScannerRefreshResponse,
)
from app.services import gvm_library as library_service
from app.services import gvm_metadata as metadata_service
from app.services import scanners as scanners_service

router = APIRouter(prefix="/api/gvm", tags=["gvm-library"])

GvmKindQuery = Literal["scan_config", "port_list"]


def _entry_to_response(entry: object) -> GvmLibraryEntryResponse:
    """Shape a library entry into the API response, pulling uploader name if loaded."""
    uploaded_by_username: str | None = None
    uploader = getattr(entry, "uploaded_by", None)
    if uploader is not None:
        uploaded_by_username = getattr(uploader, "email", None) or getattr(
            uploader, "name", None
        )
    base = GvmLibraryEntryResponse.model_validate(entry)
    return base.model_copy(update={"uploaded_by_username": uploaded_by_username})


# --- Library ----------------------------------------------------------


@router.get("/library", response_model=GvmLibraryListResponse)
async def list_library_entries(
    user: CurrentUser,
    db: DbSession,
    kind: GvmKindQuery | None = Query(None),
) -> GvmLibraryListResponse:
    """List library entries, optionally filtered by kind.

    Any authenticated user can read — network editors need this to populate
    the scan-config / port-list dropdowns on the network form.
    """
    entries = await library_service.list_entries(db, kind=kind)
    return GvmLibraryListResponse(
        entries=[_entry_to_response(entry) for entry in entries]
    )


@router.post(
    "/library",
    response_model=GvmLibraryEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_library_entry(
    admin: OperatorUser,
    db: DbSession,
    kind: GvmKindQuery = Query(..., description="'scan_config' or 'port_list'"),
    file: UploadFile = File(...),
) -> GvmLibraryEntryResponse:
    """Upload a new library entry or overwrite an existing one by name.

    The inner ``<name>`` element from the XML becomes the library row's
    name — no separate name input. Uploading the same name for the same
    kind overwrites and bumps the hash.
    """
    xml_bytes = await file.read()
    try:
        entry = await library_service.upsert_entry(
            db,
            kind=kind,
            xml_bytes=xml_bytes,
            uploaded_by_user_id=admin.id,
        )
    except library_service.GvmLibraryValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    await db.commit()
    await db.refresh(entry)
    return _entry_to_response(entry)


@router.get("/library/{entry_id}/xml")
async def download_library_xml(
    admin: OperatorUser,
    db: DbSession,
    entry_id: int,
) -> Response:
    """Download the raw XML blob of a library entry (admin only)."""
    entry = await library_service.get_entry_by_id(db, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Library entry not found"
        )

    short_hash = entry.xml_hash[:8]
    safe_name = "".join(
        c if c.isalnum() or c in "-_." else "_" for c in entry.name
    )
    filename = f"{entry.kind}_{safe_name}_{short_hash}.xml"
    return Response(
        content=entry.xml_blob.encode("utf-8"),
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/library/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_library_entry(
    admin: OperatorUser,
    db: DbSession,
    entry_id: int,
) -> None:
    """Delete a library entry.

    Networks referencing this name by ``gvm_scan_config`` / ``gvm_port_list``
    are left alone — the UI warning dialog already showed the list. At
    scan time they fall back to the scanner-native mirror or fail fast.
    """
    entry = await library_service.get_entry_by_id(db, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Library entry not found"
        )
    await library_service.delete_entry(db, entry)
    await db.commit()


@router.get(
    "/library/{entry_id}/references",
    response_model=list[int],
)
async def get_library_entry_references(
    admin: CurrentUser,
    db: DbSession,
    entry_id: int,
) -> list[int]:
    """Return network IDs that currently reference this library entry's name."""
    entry = await library_service.get_entry_by_id(db, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Library entry not found"
        )
    networks = await library_service.get_referencing_networks(
        db,
        entry.kind,  # type: ignore[arg-type]
        entry.name,
    )
    return [n.id for n in networks]


# --- Per-scanner mirror ----------------------------------------------


@router.get(
    "/scanners/{scanner_id}/mirror",
    response_model=GvmScannerMirrorResponse,
)
async def get_scanner_mirror(
    user: CurrentUser,
    db: DbSession,
    scanner_id: int,
    kind: GvmKindQuery | None = Query(None),
) -> GvmScannerMirrorResponse:
    """Return the live-state mirror for a GVM scanner."""
    scanner = await scanners_service.get_scanner_by_id(db, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scanner not found"
        )
    entries = await metadata_service.get_mirror_for_scanner(db, scanner_id, kind=kind)
    return GvmScannerMirrorResponse(
        scanner_id=scanner.id,
        scanner_name=scanner.name,
        scanner_kind=scanner.kind,
        gvm_synced_at=scanner.gvm_synced_at,
        gvm_refresh_requested=scanner.gvm_refresh_requested,
        entries=[
            GvmScannerMetadataEntryResponse.model_validate(entry) for entry in entries
        ],
    )


@router.post(
    "/scanners/{scanner_id}/refresh",
    response_model=GvmScannerRefreshResponse,
)
async def request_scanner_refresh(
    admin: OperatorUser,
    db: DbSession,
    scanner_id: int,
) -> GvmScannerRefreshResponse:
    """Request that the scanner re-post its metadata snapshot on next poll."""
    scanner = await scanners_service.get_scanner_by_id(db, scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Scanner not found"
        )
    if scanner.kind != "gvm":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh is only available for GVM scanners",
        )
    await metadata_service.request_refresh(db, scanner)
    await db.commit()
    return GvmScannerRefreshResponse(
        scanner_id=scanner.id,
        gvm_refresh_requested=True,
    )
