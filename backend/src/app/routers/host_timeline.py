"""Host activity timeline endpoint."""

from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession
from app.services import hosts as hosts_service
from app.services.host_timeline import get_host_timeline

router = APIRouter(prefix="/api/hosts", tags=["hosts"])


@router.get("/{host_id}/timeline")
async def host_timeline(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
    limit: int = Query(50, ge=1, le=200),
    before: datetime | None = Query(None, description="Cursor: ISO timestamp for pagination"),
) -> dict[str, Any]:
    """Get a unified activity timeline for a host."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )

    events = await get_host_timeline(db, host.ip, limit=limit, before=before)

    return {"events": events}
