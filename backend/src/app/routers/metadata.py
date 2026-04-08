"""Metadata API endpoints for extensibility framework."""

from typing import Any

from fastapi import APIRouter

from app.core.alert_types import get_alert_type_metadata
from app.core.deps import CurrentUser
from app.core.scanner_types import get_scanner_type_metadata

router = APIRouter(prefix="/api/metadata", tags=["metadata"])


@router.get("/scanner-types")
async def get_scanner_types(current_user: CurrentUser) -> dict[str, Any]:
    """Return registered scanner types with metadata."""
    return {"scanner_types": get_scanner_type_metadata()}


@router.get("/alert-types")
async def get_alert_types(current_user: CurrentUser) -> dict[str, Any]:
    """Return registered alert types with metadata."""
    return {"alert_types": get_alert_type_metadata()}
