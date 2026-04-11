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

import logging

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, status

from app.core.deps import AdminUser, DbSession
from app.schemas.hostname_lookup import (
    CacheEntryUpdateRequest,
    CacheExportDocument,
    CacheFillerRunResponse,
    CacheImportRequest,
    CacheImportSummary,
    CacheStatusResponse,
    HostnameLookupEntry,
    HostnameLookupQueueEntryResponse,
    HostnameLookupRefreshResponse,
)
from app.services import hostname_lookup_io
from app.services.hostname_lookup import (
    delete_cache_entry,
    enqueue_hostname_lookup,
    update_cache_entry_manual,
)
from app.services.hostname_lookup_filler import run_hostname_cache_filler

logger = logging.getLogger(__name__)

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


@router.get(
    "/status",
    response_model=CacheStatusResponse,
    status_code=status.HTTP_200_OK,
)
async def get_hostname_cache_status(
    user: AdminUser,  # noqa: ARG001 — DI gate for admin-only access
    db: DbSession,
) -> CacheStatusResponse:
    """Status dashboard for the admin UI.

    Aggregates filler config, cache row counts by status, vhost totals,
    host-inventory coverage, most recent query timestamp, and per-source
    daily budget state in a single round-trip.
    """
    return await hostname_lookup_io.get_cache_status(db)


@router.post(
    "/run-filler",
    response_model=CacheFillerRunResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def trigger_hostname_cache_filler(
    user: AdminUser,  # noqa: ARG001 — DI gate for admin-only access
    background: BackgroundTasks,
) -> CacheFillerRunResponse:
    """Trigger the filler job immediately, outside its scheduled slot.

    Runs asynchronously via ``BackgroundTasks`` so the HTTP response
    returns immediately; the operator polls ``/status`` to watch the
    budget counter tick up in real time. The standard APScheduler slot
    continues running independently on its own interval.
    """
    logger.info("hostname-filler: manual trigger via API")
    background.add_task(run_hostname_cache_filler)
    return CacheFillerRunResponse(
        status="started",
        message="Filler job queued; poll /status for progress.",
    )


@router.put(
    "/entries/{ip}",
    response_model=HostnameLookupEntry,
    status_code=status.HTTP_200_OK,
)
async def update_hostname_cache_entry(
    user: AdminUser,  # noqa: ARG001 — DI gate for admin-only access
    db: DbSession,
    ip: str,
    payload: CacheEntryUpdateRequest,
) -> HostnameLookupEntry:
    """Hand-edit a cache row — full replacement of the hostname list.

    The service layer stamps ``source='manual'`` and an 8-week TTL so
    the filler's next hourly pass skips the row. Empty hostname lists
    are allowed and persist as a ``no_results`` marker — operators
    use this to explicitly mute an IP.
    """
    row = await update_cache_entry_manual(db, ip=ip, hostnames=payload.hostnames)
    await db.commit()
    return HostnameLookupEntry(
        ip=row.ip,
        hostnames=list(row.hostnames_json or []),
        source=row.source,
        status=row.status,
        queried_at=row.queried_at,
        expires_at=row.expires_at,
        error_message=row.error_message,
    )


@router.post(
    "/entries/{ip}/refresh",
    response_model=HostnameLookupRefreshResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def refresh_hostname_cache_entry(
    user: AdminUser,
    db: DbSession,
    ip: str,
) -> HostnameLookupRefreshResponse:
    """Enqueue a manual hostname lookup for an arbitrary IP.

    Admin counterpart to ``POST /api/hosts/{host_id}/hostname-lookup/refresh``
    — operates on a raw IP rather than a host id, so the admin UI can
    fire a refresh from the cache table without first navigating to the
    host detail page. The scanner-side handling is identical.
    """
    entry = await enqueue_hostname_lookup(
        db, ip=ip, requested_by_user_id=user.id
    )
    await db.commit()
    return HostnameLookupRefreshResponse(
        queue_entry=HostnameLookupQueueEntryResponse.model_validate(entry),
    )


@router.delete(
    "/entries/{ip}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_hostname_cache_entry(
    user: AdminUser,  # noqa: ARG001 — DI gate for admin-only access
    db: DbSession,
    ip: str,
) -> None:
    """Drop the cache row for ``ip``.

    Used by the admin UI's delete action and for clearing junk
    cached data (e.g. a rapiddns row that picked up wrong hostnames).
    Returns 404 if no row exists.
    """
    deleted = await delete_cache_entry(db, ip=ip)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No cache entry for IP {ip}",
        )
    await db.commit()
