import asyncio

from sqlalchemy import update

from app.core.database import async_session_factory
from app.models.scan import Scan, ScanStatus


async def main() -> None:
    async with async_session_factory() as db:
        await db.execute(
            update(Scan)
            .where(Scan.status == ScanStatus.RUNNING)
            .values(status=ScanStatus.FAILED, error_message='Interrupted for debugging')
        )
        await db.commit()
    print("Marked running scans as failed.")

if __name__ == "__main__":
    asyncio.run(main())
