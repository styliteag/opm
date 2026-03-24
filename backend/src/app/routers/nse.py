"""NSE vulnerability scanning router — profiles, scans, and results."""

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import AdminUser, CurrentScanner, CurrentUser, DbSession, OperatorUser

# Path to nmap's built-in NSE scripts
NSE_SCRIPTS_DIR = Path("/usr/share/nmap/scripts")
from app.schemas.nse import (
    NseProfileCreate,
    NseProfileListResponse,
    NseProfileResponse,
    NseProfileUpdate,
    NseResultListResponse,
    NseResultResponse,
    NseResultsSubmission,
    NseScanRequest,
    NseScanResponse,
    NseScriptCreate,
    NseScriptDownloadResponse,
    NseScriptListResponse,
    NseScriptResponse,
    NseScriptUpdate,
)
from app.services import nse_results as results_service
from app.services import nse_scripts as scripts_service
from app.services import nse_sync as sync_service
from app.services import nse_templates as profile_service

router = APIRouter(prefix="/api/nse", tags=["nse"])


# ── Profiles ───────────────────────────────────────────────────────────────


@router.get("/profiles", response_model=NseProfileListResponse)
async def list_profiles(
    _user: CurrentUser,
    db: DbSession,
    search: str | None = Query(None),
    severity: str | None = Query(None),
    platform: str | None = Query(None),
    type: str | None = Query(None),
) -> NseProfileListResponse:
    """List all NSE scan profiles with optional filtering."""
    profiles = await profile_service.get_all_profiles(
        db, search=search, severity=severity, platform=platform, profile_type=type
    )
    return NseProfileListResponse(
        profiles=[NseProfileResponse.model_validate(p) for p in profiles],
        total=len(profiles),
    )


@router.get("/profiles/{profile_id}", response_model=NseProfileResponse)
async def get_profile(
    _user: CurrentUser,
    db: DbSession,
    profile_id: int,
) -> NseProfileResponse:
    """Get a single NSE profile by ID."""
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return NseProfileResponse.model_validate(profile)


@router.post(
    "/profiles", response_model=NseProfileResponse, status_code=status.HTTP_201_CREATED
)
async def create_profile(
    _user: OperatorUser,
    db: DbSession,
    request: NseProfileCreate,
) -> NseProfileResponse:
    """Create a custom NSE scan profile."""
    profile = await profile_service.create_profile(db, request)
    await db.commit()
    await db.refresh(profile)
    return NseProfileResponse.model_validate(profile)


@router.post(
    "/profiles/{profile_id}/clone",
    response_model=NseProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_profile(
    _user: OperatorUser,
    db: DbSession,
    profile_id: int,
    name: str = Query(..., description="Name for the cloned profile"),
) -> NseProfileResponse:
    """Clone an existing profile into a new custom profile."""
    source = await profile_service.get_profile_by_id(db, profile_id)
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    cloned = await profile_service.clone_profile(db, source, name)
    await db.commit()
    await db.refresh(cloned)
    return NseProfileResponse.model_validate(cloned)


@router.put("/profiles/{profile_id}", response_model=NseProfileResponse)
async def update_profile(
    _user: OperatorUser,
    db: DbSession,
    profile_id: int,
    request: NseProfileUpdate,
) -> NseProfileResponse:
    """Update a custom NSE profile. Built-in profiles cannot be edited."""
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    try:
        updated = await profile_service.update_profile(db, profile, request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    await db.refresh(updated)
    return NseProfileResponse.model_validate(updated)


@router.delete("/profiles/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile(
    _user: OperatorUser,
    db: DbSession,
    profile_id: int,
) -> None:
    """Delete a custom NSE profile. Built-in profiles cannot be deleted."""
    profile = await profile_service.get_profile_by_id(db, profile_id)
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    try:
        await profile_service.delete_profile(db, profile)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()


# ── Scripts ────────────────────────────────────────────────────────────────


@router.get("/scripts", response_model=NseScriptListResponse)
async def list_scripts(
    _user: CurrentUser,
    db: DbSession,
    search: str | None = Query(None),
    type: str | None = Query(None),
) -> NseScriptListResponse:
    """List all available NSE scripts (custom from DB + builtins from filesystem)."""
    scripts = await scripts_service.get_all_scripts(db, search=search, type_filter=type)
    return NseScriptListResponse(scripts=scripts, total=len(scripts))


@router.get("/scripts/{script_name}", response_model=NseScriptResponse)
async def get_script(
    _user: CurrentUser,
    db: DbSession,
    script_name: str,
) -> NseScriptResponse:
    """Get a single script with content. Checks DB for custom scripts, filesystem for builtins."""
    # Try DB first for custom scripts
    script = await scripts_service.get_script_by_name(db, script_name)
    if script is not None:
        return NseScriptResponse.model_validate(script)

    # Fall back to filesystem for builtin scripts
    safe_name = script_name.strip()
    if safe_name.endswith(".nse"):
        safe_name = safe_name[:-4]

    script_path = NSE_SCRIPTS_DIR / f"{safe_name}.nse"
    try:
        script_path = script_path.resolve()
        if not str(script_path).startswith(str(NSE_SCRIPTS_DIR.resolve())):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid script name",
            )
    except (OSError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid script name"
        )

    if not script_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Script '{safe_name}' not found",
        )

    try:
        content = script_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to read script file",
        )

    from datetime import datetime, timezone
    import hashlib

    now = datetime.now(timezone.utc)
    return NseScriptResponse(
        id=0,
        name=safe_name,
        description="",
        content=content,
        content_hash=hashlib.sha256(content.encode()).hexdigest(),
        categories=[],
        severity=None,
        type="builtin",
        cloned_from=None,
        author="",
        created_at=now,
        updated_at=now,
    )


@router.post(
    "/scripts",
    response_model=NseScriptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_script(
    _user: OperatorUser,
    db: DbSession,
    request: NseScriptCreate,
) -> NseScriptResponse:
    """Create a custom NSE script."""
    try:
        script = await scripts_service.create_script(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    await db.refresh(script)
    return NseScriptResponse.model_validate(script)


@router.put("/scripts/{script_name}", response_model=NseScriptResponse)
async def update_script(
    _user: OperatorUser,
    db: DbSession,
    script_name: str,
    request: NseScriptUpdate,
) -> NseScriptResponse:
    """Update a custom NSE script. Built-in scripts cannot be edited."""
    script = await scripts_service.get_script_by_name(db, script_name)
    if script is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Script not found"
        )

    try:
        updated = await scripts_service.update_script(db, script, request)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    await db.refresh(updated)
    return NseScriptResponse.model_validate(updated)


@router.delete("/scripts/{script_name}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_script(
    _user: OperatorUser,
    db: DbSession,
    script_name: str,
) -> None:
    """Delete a custom NSE script. Auto-removes from referencing profiles."""
    script = await scripts_service.get_script_by_name(db, script_name)
    if script is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Script not found"
        )

    try:
        await scripts_service.delete_script(db, script)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()


@router.post(
    "/scripts/{script_name}/clone",
    response_model=NseScriptResponse,
    status_code=status.HTTP_201_CREATED,
)
async def clone_script(
    _user: OperatorUser,
    db: DbSession,
    script_name: str,
) -> NseScriptResponse:
    """Clone a built-in script into a custom editable copy."""
    try:
        script = await scripts_service.clone_builtin(db, script_name)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    await db.refresh(script)
    return NseScriptResponse.model_validate(script)


@router.post("/scripts/{script_name}/restore", response_model=NseScriptResponse)
async def restore_script(
    _user: OperatorUser,
    db: DbSession,
    script_name: str,
) -> NseScriptResponse:
    """Restore a cloned script to the original built-in content."""
    script = await scripts_service.get_script_by_name(db, script_name)
    if script is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Script not found"
        )

    try:
        restored = await scripts_service.restore_to_original(db, script)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))

    await db.commit()
    await db.refresh(restored)
    return NseScriptResponse.model_validate(restored)


@router.get(
    "/scripts/{script_name}/download",
    response_model=NseScriptDownloadResponse,
)
async def download_script(
    _scanner: CurrentScanner,
    db: DbSession,
    script_name: str,
) -> NseScriptDownloadResponse:
    """Download a custom script (for scanner agents)."""
    script = await scripts_service.get_script_by_name(db, script_name)
    if script is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Script not found"
        )

    return NseScriptDownloadResponse(
        name=script.name,
        content=script.content,
        content_hash=script.content_hash,
    )


# ── Scans ──────────────────────────────────────────────────────────────────


@router.post("/scan", response_model=NseScanResponse, status_code=status.HTTP_201_CREATED)
async def trigger_nse_scan(
    _user: OperatorUser,
    db: DbSession,
    request: NseScanRequest,
) -> NseScanResponse:
    """Trigger an NSE vulnerability scan on a network using a profile."""
    from app.models.scan import Scan, ScanStatus, TriggerType
    from app.services import networks as networks_service

    network = await networks_service.get_network_by_id(db, request.network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Network not found"
        )

    template_id = request.template_id
    if template_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A scan profile is required. Select a profile to run.",
        )
    profile = await profile_service.get_profile_by_id(db, template_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Profile not found"
        )

    scan = Scan(
        network_id=request.network_id,
        scanner_id=network.scanner_id,
        status=ScanStatus.PLANNED,
        trigger_type=TriggerType.MANUAL,
        target_ip=request.target_ip,
        scan_profile_id=template_id,
    )
    db.add(scan)
    await db.flush()
    await db.commit()

    return NseScanResponse(
        scan_id=scan.id,
        network_id=request.network_id,
        template_id=template_id,
        status="planned",
    )


# ── Results ────────────────────────────────────────────────────────────────


@router.get("/results", response_model=NseResultListResponse)
async def list_results(
    _user: CurrentUser,
    db: DbSession,
    scan_id: int | None = Query(None),
    severity: str | None = Query(None),
    ip: str | None = Query(None),
    cve: str | None = Query(None),
) -> NseResultListResponse:
    """List NSE results with optional filtering."""
    results = await results_service.get_all_results(
        db, scan_id=scan_id, severity=severity, ip=ip, cve=cve
    )
    return NseResultListResponse(
        results=[NseResultResponse.model_validate(r) for r in results],
        total=len(results),
    )


@router.get("/results/{scan_id}", response_model=NseResultListResponse)
async def get_scan_results(
    _user: CurrentUser,
    db: DbSession,
    scan_id: int,
    severity: str | None = Query(None),
    ip: str | None = Query(None),
) -> NseResultListResponse:
    """Get NSE results for a specific scan."""
    results = await results_service.get_results_by_scan(db, scan_id, severity=severity, ip=ip)
    return NseResultListResponse(
        results=[NseResultResponse.model_validate(r) for r in results],
        total=len(results),
    )


# ── Scanner Agent Submission ───────────────────────────────────────────────


@router.post("/scanner/results")
async def submit_scanner_nse_results(
    scanner: CurrentScanner,
    db: DbSession,
    submission: NseResultsSubmission,
) -> dict:
    """Submit NSE scan results from the scanner agent."""
    results_recorded = await results_service.submit_nse_results(db, scanner, submission)
    await db.commit()
    return {
        "scan_id": submission.scan_id,
        "results_recorded": results_recorded,
        "message": "NSE results submitted successfully",
    }


# ── Sync ──────────────────────────────────────────────────────────────────

# Resolve the nse-templates scripts directory relative to project root.
# In Docker the app runs from /app, so nse-templates is at /app/nse-templates/scripts.
# Fallback to a path relative to the source tree for local development.
_NSE_TEMPLATES_DIR = Path("/app/nse-templates/scripts")
if not _NSE_TEMPLATES_DIR.is_dir():
    _NSE_TEMPLATES_DIR = Path(__file__).resolve().parents[4] / "nse-templates" / "scripts"


@router.post("/sync")
async def trigger_sync(
    _user: AdminUser,
) -> dict[str, int | list[str]]:
    """Trigger a sync of NSE scripts from the nmap GitHub repository."""
    summary = await sync_service.sync_from_nmap_github(str(_NSE_TEMPLATES_DIR))
    return dict(summary)


@router.get("/sync/status")
async def get_sync_status(
    _user: CurrentUser,
) -> dict[str, object]:
    """Get the last sync status information."""
    return sync_service.get_sync_status(str(_NSE_TEMPLATES_DIR))
