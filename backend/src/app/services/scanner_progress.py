"""Scanner progress update service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan, ScanStatus
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerProgressRequest, ScannerProgressResponse


async def update_scan_progress(
    db: AsyncSession,
    scanner: Scanner,
    request: ScannerProgressRequest,
) -> ScannerProgressResponse | None:
    """
    Update scan progress from a scanner.

    Returns None if:
    - Scan doesn't exist
    - Scan's site doesn't match this scanner's site
    - Scan is not in RUNNING status

    Otherwise updates the progress fields and returns a response.
    """
    # Find the scan and verify ownership
    scan_result = await db.execute(select(Scan).where(Scan.id == request.scan_id))
    scan = scan_result.scalar_one_or_none()

    if scan is None:
        return None

    # Verify scan belongs to this site
    if scan.scanner_id != scanner.id:
        return None

    # Verify scan is in running status
    if scan.status != ScanStatus.RUNNING:
        return None

    # Update progress fields
    scan.progress_percent = request.progress_percent
    scan.progress_message = request.progress_message

    return ScannerProgressResponse(
        scan_id=scan.id,
        progress_percent=request.progress_percent,
    )
