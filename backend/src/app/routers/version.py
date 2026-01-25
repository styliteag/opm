"""Version router for exposing backend version via API."""

from fastapi import APIRouter

from app.core.version import get_version

router = APIRouter(prefix="/api", tags=["version"])


@router.get("/version")
async def get_backend_version() -> dict[str, str]:
    """Get the backend version.

    This endpoint is public and requires no authentication.
    """
    return {"version": get_version(), "component": "backend"}
