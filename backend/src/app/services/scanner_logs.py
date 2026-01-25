"""Scanner log submission service."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.scan import Scan
from app.models.scan_log import LogLevel, ScanLog
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerLogsRequest, ScannerLogsResponse


async def submit_scan_logs(
    db: AsyncSession,
    scanner: Scanner,
    request: ScannerLogsRequest,
) -> ScannerLogsResponse | None:
    """
    Submit scan logs from a scanner.

    Returns None if:
    - Scan doesn't exist
    - Scan's network is not assigned to this site

    Otherwise stores the logs and returns a response.
    """
    # Find the scan and verify ownership
    scan_result = await db.execute(select(Scan).where(Scan.id == request.scan_id))
    scan = scan_result.scalar_one_or_none()

    if scan is None:
        return None

    # Verify scan belongs to this site
    if scan.scanner_id != scanner.id:
        return None

    # Store the log entries
    logs_recorded = 0

    for log_entry in request.logs:
        # Map string level to LogLevel enum
        level = LogLevel(log_entry.level.lower())

        new_log = ScanLog(
            scan_id=scan.id,
            timestamp=log_entry.timestamp,
            level=level,
            message=log_entry.message,
        )
        db.add(new_log)
        logs_recorded += 1

    return ScannerLogsResponse(
        scan_id=scan.id,
        logs_recorded=logs_recorded,
    )
