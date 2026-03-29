"""Alert timeline endpoint with scan-anchored grouping."""

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.alert_timeline import AlertTimelineResponse
from app.services.alert_comments import get_alert_by_id
from app.services.alert_timeline import get_alert_timeline

router = APIRouter()


@router.get("/{alert_id}/timeline", response_model=AlertTimelineResponse)
async def alert_timeline(
    user: CurrentUser,
    db: DbSession,
    alert_id: int,
) -> AlertTimelineResponse:
    """Get scan-anchored timeline for an alert."""
    alert = await get_alert_by_id(db, alert_id)
    if alert is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert not found")
    scan_groups = await get_alert_timeline(
        db,
        alert_id=alert.id,
        ip=alert.ip,
        port=alert.port,
        network_id=alert.network_id,
    )
    return AlertTimelineResponse(alert_id=alert.id, scan_groups=scan_groups)
