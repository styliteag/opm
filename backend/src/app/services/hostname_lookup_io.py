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
from datetime import date
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.host import Host
from app.models.hostname_lookup import HostnameLookup, HostnameLookupBudget
from app.schemas.hostname_lookup import (
    CacheBudgetStatus,
    CacheExportDocument,
    CacheImportSummary,
    CacheStatusByStatus,
    CacheStatusResponse,
    HostnameLookupEntry,
)
from app.services.hostname_lookup import (
    HACKERTARGET_DAILY_LIMIT_ANON,
    HACKERTARGET_DAILY_LIMIT_WITH_KEY,
    _now,
    _ttl_for_status,
)

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


async def get_cache_status(db: AsyncSession) -> CacheStatusResponse:
    """Build the status dashboard payload for the admin UI.

    One round-trip, no per-metric endpoints — aggregates:
    - filler config (enabled, interval)
    - cache row counts grouped by status
    - total distinct hostnames across all success rows
    - total hosts in OPM (any network) vs. enriched (has a success row)
    - coverage percent (enriched / total hosts)
    - most recent ``queried_at`` so operators can spot a stuck filler
    - per-source daily budgets with today's used/remaining
    """
    # Row count per status.
    status_rows = (
        await db.execute(
            select(HostnameLookup.status, func.count(HostnameLookup.id)).group_by(
                HostnameLookup.status
            )
        )
    ).all()
    by_status = CacheStatusByStatus()
    total_entries = 0
    for row_status, row_count in status_rows:
        total_entries += int(row_count)
        if row_status == "success":
            by_status.success = int(row_count)
        elif row_status == "no_results":
            by_status.no_results = int(row_count)
        elif row_status == "failed":
            by_status.failed = int(row_count)

    # Total vhosts across all success rows — JSON LENGTH isn't portable
    # and the row count is bounded by host count, so pulling the lists
    # into Python is cheaper than a DB-side sum.
    success_rows = (
        (
            await db.execute(
                select(HostnameLookup.hostnames_json).where(
                    HostnameLookup.status == "success"
                )
            )
        )
        .scalars()
        .all()
    )
    total_vhosts = sum(len(hostnames or []) for hostnames in success_rows)

    # Host inventory counts.
    total_hosts_result = await db.execute(select(func.count(Host.id)))
    total_hosts = int(total_hosts_result.scalar() or 0)

    # Enriched = hosts that have a fresh success row for their IP.
    now = _now()
    enriched_result = await db.execute(
        select(func.count(func.distinct(HostnameLookup.ip))).where(
            HostnameLookup.status == "success",
            HostnameLookup.expires_at > now,
        )
    )
    enriched_hosts = int(enriched_result.scalar() or 0)

    coverage_percent = (
        round((enriched_hosts / total_hosts) * 100, 1)
        if total_hosts > 0
        else 0.0
    )

    # Latest queried_at — None if cache is empty.
    last_queried_at = (
        await db.execute(
            select(func.max(HostnameLookup.queried_at))
        )
    ).scalar()

    # Budget rows for today, across all sources.
    today: date = now.date()
    budget_rows = (
        (
            await db.execute(
                select(HostnameLookupBudget).where(
                    HostnameLookupBudget.day == today
                )
            )
        )
        .scalars()
        .all()
    )
    budgets: list[CacheBudgetStatus] = []
    seen_sources: set[str] = set()
    for row in budget_rows:
        seen_sources.add(row.source)
        limit = _daily_limit_for(row.source)
        budgets.append(
            CacheBudgetStatus(
                source=row.source,
                used=int(row.used),
                limit=limit,
                remaining=max(0, limit - int(row.used)),
                day=today.isoformat(),
            )
        )
    # Surface every enabled source even when no row exists yet today
    # so the UI always shows a "N remaining" state rather than an
    # empty list. Sources with configured daily_limit <= 0 are omitted
    # so turning a source off at runtime hides it cleanly.
    known_sources = ["hackertarget"]
    if settings.rapiddns_enabled and settings.rapiddns_daily_limit > 0:
        known_sources.append("rapiddns")
    for source_name in known_sources:
        if source_name in seen_sources:
            continue
        limit = _daily_limit_for(source_name)
        if limit <= 0:
            continue
        budgets.append(
            CacheBudgetStatus(
                source=source_name,
                used=0,
                limit=limit,
                remaining=limit,
                day=today.isoformat(),
            )
        )

    return CacheStatusResponse(
        filler_enabled=settings.hostname_lookup_enabled,
        filler_interval_minutes=settings.hostname_lookup_interval_minutes,
        total_entries=total_entries,
        entries_by_status=by_status,
        total_vhosts=total_vhosts,
        total_hosts=total_hosts,
        enriched_hosts=enriched_hosts,
        coverage_percent=coverage_percent,
        last_queried_at=last_queried_at,
        budgets=budgets,
    )


def _daily_limit_for(source: str) -> int:
    """Return the configured daily cap for a given source."""
    if source == "hackertarget":
        return (
            HACKERTARGET_DAILY_LIMIT_WITH_KEY
            if settings.hackertarget_api_key
            else HACKERTARGET_DAILY_LIMIT_ANON
        )
    if source == "rapiddns":
        return settings.rapiddns_daily_limit
    # Unknown sources get no cap info; UI will show "n/a".
    return 0


__all__ = [
    "ImportStrategy",
    "export_cache",
    "get_cache_status",
    "import_cache",
]
