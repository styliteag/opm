"""GVM scanner metadata mirror service — ingest snapshots, read mirrors, refresh flag."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import and_, delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.gvm_scanner_metadata import GvmScannerMetadata
from app.models.scanner import Scanner
from app.schemas.gvm_library import GvmMetadataSnapshotEntry


async def ingest_snapshot(
    db: AsyncSession,
    scanner: Scanner,
    entries: list[GvmMetadataSnapshotEntry],
) -> int:
    """Replace all metadata rows for this scanner with the posted snapshot.

    Runs in a single transaction: delete all existing rows, then bulk insert
    the new ones. Also clears ``gvm_refresh_requested`` and updates
    ``gvm_synced_at``. Returns the number of rows stored.
    """
    # Wipe existing rows
    await db.execute(
        delete(GvmScannerMetadata).where(GvmScannerMetadata.scanner_id == scanner.id)
    )

    for entry in entries:
        db.add(
            GvmScannerMetadata(
                scanner_id=scanner.id,
                kind=entry.kind,
                name=entry.name,
                gvm_uuid=entry.gvm_uuid,
                is_builtin=entry.is_builtin,
                xml_hash=entry.xml_hash,
                extra=entry.extra,
            )
        )

    scanner.gvm_refresh_requested = False
    scanner.gvm_synced_at = datetime.now(timezone.utc)

    await db.flush()
    return len(entries)


async def get_mirror_for_scanner(
    db: AsyncSession, scanner_id: int, kind: str | None = None
) -> list[GvmScannerMetadata]:
    """Return mirror rows for a scanner, optionally filtered by kind."""
    stmt = (
        select(GvmScannerMetadata)
        .where(GvmScannerMetadata.scanner_id == scanner_id)
        .order_by(
            GvmScannerMetadata.kind.asc(), GvmScannerMetadata.name.asc()
        )
    )
    if kind is not None:
        stmt = stmt.where(GvmScannerMetadata.kind == kind)
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_mirror_entry(
    db: AsyncSession, scanner_id: int, kind: str, name: str
) -> GvmScannerMetadata | None:
    """Return a specific mirror row, or None if the scanner does not have it."""
    result = await db.execute(
        select(GvmScannerMetadata).where(
            and_(
                GvmScannerMetadata.scanner_id == scanner_id,
                GvmScannerMetadata.kind == kind,
                GvmScannerMetadata.name == name,
            )
        )
    )
    return result.scalar_one_or_none()


async def request_refresh(db: AsyncSession, scanner: Scanner) -> None:
    """Set the refresh flag; scanner will drain on next poll."""
    scanner.gvm_refresh_requested = True
    await db.flush()
