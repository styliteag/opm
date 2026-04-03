"""Version router for exposing backend version and migration state via API."""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.version import get_version
from app.services.migration_info import get_current_revision, get_head_revision

router = APIRouter(prefix="/api", tags=["version"])


@router.get("/version")
async def get_backend_version(
    db: AsyncSession = Depends(get_db),
) -> dict[str, str | None]:
    """Get the backend version and database migration state.

    This endpoint is public and requires no authentication.
    """
    current_rev = await get_current_revision(db)
    head_rev = get_head_revision()

    return {
        "version": get_version(),
        "component": "backend",
        "migration_current": current_rev,
        "migration_head": head_rev,
        "migration_status": _migration_status(current_rev, head_rev),
    }


def _migration_status(current: str | None, head: str | None) -> str:
    """Compute a human-readable migration status."""
    if head is None:
        return "no migrations"
    if current is None:
        return "not initialized"
    if current == head:
        return "up to date"
    return f"behind (at {current}, head is {head})"
