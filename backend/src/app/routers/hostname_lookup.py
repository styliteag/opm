"""Admin API for the hostname lookup cache.

Two admin-gated endpoints:

- ``GET /api/admin/hostname-lookup/export`` — full JSON snapshot of
  the cache, suitable for backup or cross-environment seeding. Emits
  the ``CacheExportDocument`` shape (format_version, exported_at,
  entry_count, entries[]). Not paginated — the cache is host-bounded.

- ``POST /api/admin/hostname-lookup/import`` — ingest a previously
  exported document (or a hand-crafted bootstrap file). Conflict
  strategy passed via ``?strategy=skip|overwrite`` query param,
  default ``skip``. Returns ``CacheImportSummary`` with per-outcome
  counts + any rejected entry errors.

The budget table is intentionally untouched — bulk restores must not
rewrite today's API-call counter.
"""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.core.deps import AdminUser, DbSession
from app.schemas.hostname_lookup import (
    CacheExportDocument,
    CacheImportRequest,
    CacheImportSummary,
)
from app.services import hostname_lookup_io

router = APIRouter(prefix="/api/admin/hostname-lookup", tags=["hostname-lookup"])


@router.get(
    "/export",
    response_model=CacheExportDocument,
    status_code=status.HTTP_200_OK,
)
async def export_hostname_cache(
    user: AdminUser,  # noqa: ARG001 — DI gate for admin-only access
    db: DbSession,
) -> CacheExportDocument:
    """Return a full JSON snapshot of the hostname lookup cache.

    Every row is included regardless of status or TTL; operators can
    filter downstream. Response size scales linearly with the number
    of hosts OPM has ever seen — typically under a few MB.
    """
    return await hostname_lookup_io.export_cache(db)


@router.post(
    "/import",
    response_model=CacheImportSummary,
    status_code=status.HTTP_200_OK,
)
async def import_hostname_cache(
    user: AdminUser,  # noqa: ARG001 — DI gate for admin-only access
    db: DbSession,
    payload: CacheImportRequest,
    strategy: str = Query(
        default="skip",
        pattern="^(skip|overwrite)$",
        description=(
            "Conflict strategy for IPs that already have a cache row. "
            "'skip' preserves existing rows (safe for bootstrap). "
            "'overwrite' replaces them (full restore / forced seed)."
        ),
    ),
) -> CacheImportSummary:
    """Ingest an exported cache document with the given strategy."""
    summary = await hostname_lookup_io.import_cache(
        db,
        entries=payload.entries,
        strategy=strategy,  # type: ignore[arg-type]
    )
    await db.commit()
    return summary
