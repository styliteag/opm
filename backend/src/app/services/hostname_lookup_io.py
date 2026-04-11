"""Hostname lookup cache — export and import helpers.

Supports two operator workflows:

- **Export**: dump every cache row to a structured JSON document for
  backup, cross-environment seeding, or offline analysis. The export
  is intentionally verbose — includes queried_at / expires_at /
  error_message — so a round-trip `export -> import(overwrite)` is
  lossless.

- **Import**: ingest an external JSON document back into the cache.
  Two conflict strategies:
  - ``skip`` — only insert rows for IPs that have no cache row yet;
    never touch existing entries. Safe for bootstrapping.
  - ``overwrite`` — replace any existing row with the imported one.
    Used for full restore from backup or forced seed from a peer
    instance.

  When the import document omits ``queried_at`` / ``expires_at``, the
  service computes them: ``queried_at = now``, ``expires_at`` via the
  standard TTL for the entry's status (30d / 7d / 3d).

The service does not touch the ``hostname_lookup_budget`` table —
import/export is purely about the cache contents, so a big restore
doesn't trick the filler into thinking it already burned today's API
quota.
"""

from __future__ import annotations

import logging
from typing import Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import HostnameLookup
from app.schemas.hostname_lookup import (
    CacheExportDocument,
    CacheImportSummary,
    HostnameLookupEntry,
)
from app.services.hostname_lookup import _now, _ttl_for_status

logger = logging.getLogger(__name__)

ImportStrategy = Literal["skip", "overwrite"]


async def export_cache(
    db: AsyncSession, source_instance: str = "opm"
) -> CacheExportDocument:
    """Serialize every row of ``hostname_lookup_cache`` into a document.

    Rows are ordered by IP for deterministic diffs between snapshots.
    All statuses are included — caller decides whether to filter
    downstream. No pagination: the cache is bounded by the number of
    hosts OPM has ever seen, so even large deployments stay under a
    few MB of JSON.
    """
    rows = (
        (
            await db.execute(
                select(HostnameLookup).order_by(HostnameLookup.ip)
            )
        )
        .scalars()
        .all()
    )

    entries = [
        HostnameLookupEntry(
            ip=row.ip,
            hostnames=list(row.hostnames_json or []),
            source=row.source,
            status=row.status,
            queried_at=row.queried_at,
            expires_at=row.expires_at,
            error_message=row.error_message,
        )
        for row in rows
    ]

    document = CacheExportDocument(
        format_version=1,
        exported_at=_now(),
        source_instance=source_instance,
        entry_count=len(entries),
        entries=entries,
    )
    logger.info(
        "hostname-lookup: exported %d cache entries (source_instance=%s)",
        len(entries),
        source_instance,
    )
    return document


async def import_cache(
    db: AsyncSession,
    entries: list[HostnameLookupEntry],
    strategy: ImportStrategy = "skip",
) -> CacheImportSummary:
    """Ingest external cache entries with the given conflict strategy.

    Returns a per-IP outcome breakdown. The function commits in one
    transaction at the end (the caller may commit earlier, but a
    single commit means a failed import rolls back cleanly).

    For rows with missing ``queried_at`` / ``expires_at``, the service
    fills in ``now`` and ``now + TTL(status)`` respectively so a
    minimal bootstrap document still produces fully valid rows.
    """
    summary = CacheImportSummary(
        total=len(entries),
        inserted=0,
        overwritten=0,
        skipped=0,
        rejected=0,
    )

    now = _now()

    # Bulk-load existing rows by IP to avoid N+1 selects during import.
    incoming_ips = [e.ip for e in entries]
    existing_map: dict[str, HostnameLookup] = {}
    if incoming_ips:
        existing_rows = (
            (
                await db.execute(
                    select(HostnameLookup).where(HostnameLookup.ip.in_(incoming_ips))
                )
            )
            .scalars()
            .all()
        )
        existing_map = {row.ip: row for row in existing_rows}

    for entry in entries:
        try:
            queried_at = entry.queried_at or now
            expires_at = entry.expires_at or (
                queried_at + _ttl_for_status(entry.status)
            )
            existing = existing_map.get(entry.ip)

            if existing is None:
                db.add(
                    HostnameLookup(
                        ip=entry.ip,
                        hostnames_json=list(entry.hostnames),
                        source=entry.source,
                        status=entry.status,
                        queried_at=queried_at,
                        expires_at=expires_at,
                        error_message=entry.error_message,
                    )
                )
                summary.inserted += 1
                continue

            if strategy == "skip":
                summary.skipped += 1
                continue

            # strategy == "overwrite"
            existing.hostnames_json = list(entry.hostnames)
            existing.source = entry.source
            existing.status = entry.status
            existing.queried_at = queried_at
            existing.expires_at = expires_at
            existing.error_message = entry.error_message
            summary.overwritten += 1

        except (ValueError, TypeError) as exc:
            summary.rejected += 1
            summary.errors.append(
                f"{entry.ip}: {exc}"[:500]
            )
            logger.warning(
                "hostname-lookup: rejected import entry for %s: %s",
                entry.ip,
                exc,
            )

    await db.flush()
    logger.info(
        "hostname-lookup: import complete strategy=%s "
        "total=%d inserted=%d overwritten=%d skipped=%d rejected=%d",
        strategy,
        summary.total,
        summary.inserted,
        summary.overwritten,
        summary.skipped,
        summary.rejected,
    )
    return summary


__all__ = [
    "ImportStrategy",
    "export_cache",
    "import_cache",
]
