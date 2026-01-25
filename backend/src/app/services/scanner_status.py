"""Scanner scan status lookup service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerScanStatusResponse


async def get_scan_status(
    db: AsyncSession,
    scanner: Scanner,
    scan_id: int,
) -> ScannerScanStatusResponse | None:
    """
    Get scan status for a scanner.

    Returns None if:
    - Scan doesn't exist
    - Scan's site doesn't match this scanner's site
    """
    result = await db.execute(select(Scan).where(Scan.id == scan_id))
    scan = result.scalar_one_or_none()

    if scan is None:
        return None

    if scan.scanner_id != scanner.id:
        return None

    return ScannerScanStatusResponse(
        scan_id=scan.id,
        status=scan.status.value,
    )
