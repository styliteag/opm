"""Hostname lookup cache service — storage + budget accounting.

Backs the SNI-aware reverse-IP hostname discovery pipeline. Post-2.3.0
the backend is storage-only — all external hostname API egress lives
in the scanner (``scanner/src/hostname_sources.py``) and reaches the
backend via ``POST /api/scanner/hostname-results``. This module owns:

1. **Cache** — ``get_cached_hostnames`` / ``upsert_cache_row`` read and
   write the ``hostname_lookup_cache`` table from migration 014. Rows
   carry a per-outcome TTL (long for success, medium for no_results,
   short for failed) so a flaky source retries relatively soon while
   stable data stays cached for weeks. ``get_cached_hostnames`` returns
   ``None`` for failed rows so callers retry instead of cache-blocking
   on a transient outage.

2. **Daily budget** — ``consume_budget`` / ``increment_budget_used``
   atomically update a per-source/day counter backed by
   ``hostname_lookup_budget``. ``pin_budget_exhausted`` is called when
   the scanner reports the upstream source's rate limit via the
   ``"API count exceeded"`` marker in a POST-ed result so a backend
   restart or clock-skew can't cause future scanner polls to burn the
   source's real daily cap.

3. **On-demand queue** — ``enqueue_hostname_lookup`` /
   ``claim_pending_lookup_jobs`` / ``mark_queue_entry_completed`` drive
   the ``hostname_lookup_queue`` table from migration 016. The queue
   is the handoff between UI-triggered manual refresh requests and
   the scanner's polling loop.

4. **Scanner I/O** — ``apply_scanner_hostname_results`` persists a
   batch of outcomes posted by the scanner, and
   ``get_scanner_budget_snapshot`` returns the per-source
   ``{source, used, limit, remaining}`` projection consumed by the
   pre-flight budget endpoint.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import (
    HostnameLookup,
    HostnameLookupBudget,
    HostnameLookupQueueEntry,
)

logger = logging.getLogger(__name__)

# --- Constants --------------------------------------------------------

# Per-outcome TTL. Short retry for failed (could be transient),
# medium for no_results (shared-hosting IPs without vhosts are rare but
# do exist), long for success (vhost lists change slowly).
TTL_SUCCESS_DAYS = 30
TTL_NO_RESULTS_DAYS = 7
TTL_FAILED_DAYS = 3

# Stuck-claim sweep: a row stays in 'claimed' for at most this long
# before the next read re-queues it. Tuned to comfortably exceed the
# scanner's worst-case enrichment runtime (HackerTarget + RapidDNS +
# crt.sh) for a single IP, while still recovering quickly enough that
# a crashed scanner doesn't strand a manual refresh request.
QUEUE_STUCK_CLAIM_AFTER = timedelta(hours=1)

# Lazy GC retention for terminal queue rows. Completed / failed rows
# linger as an audit trail then get deleted on the next read. Short
# enough to keep the table tiny, long enough that operators can spot
# "the refresh I clicked yesterday came back failed".
QUEUE_TERMINAL_RETENTION = timedelta(days=7)

# Manual edits (admin UI → PUT /entries/{ip}) never expire — the
# operator explicitly curated this data and it should stick until they
# change or delete it. We use a far-future sentinel (100 years) rather
# than nullable expires_at to keep all cache queries simple.
MANUAL_EDIT_TTL_DAYS = 36500

# Source name reserved for admin-edited rows. Kept distinct from the
# reverse-IP source names so the UI can render a "MANUAL" badge.
MANUAL_SOURCE_NAME = "manual"

# HackerTarget /reverseiplookup/ free-tier rate limits (from the
# provider's docs): 50 req/day for anonymous free users, 100 req/day
# with a free API key. Used by the scanner-facing budget endpoint to
# report daily caps; actual enforcement lives in the scanner now.
HACKERTARGET_DAILY_LIMIT_ANON = 50
HACKERTARGET_DAILY_LIMIT_WITH_KEY = 100

LookupStatus = Literal["success", "no_results", "failed"]


# --- Source protocol + result ----------------------------------------


@dataclass(frozen=True)
class HostnameLookupResult:
    """Immutable outcome of a single source fetch.

    ``hostnames`` is always a list (empty on no_results / failed) so the
    caller never has to deal with Optional semantics. ``error_message``
    is bounded to 500 chars by the scanner before it arrives here so
    we can persist it to the ``error_message`` TEXT column without
    worrying about bloat.
    """

    status: LookupStatus
    hostnames: list[str]
    error_message: str | None = None


# --- Cache read/write ------------------------------------------------


def _now() -> datetime:
    """Naive UTC ``datetime`` — matches MariaDB DATETIME storage.

    MariaDB's ``DATETIME`` column type is naive (no tzinfo). SQLAlchemy
    round-trips those columns as naive Python ``datetime`` objects, so
    the service layer also works in naive UTC to avoid the "can't
    compare offset-naive and offset-aware datetimes" trap.
    """
    return datetime.utcnow()


def _ttl_for_status(status: LookupStatus) -> timedelta:
    if status == "success":
        return timedelta(days=TTL_SUCCESS_DAYS)
    if status == "no_results":
        return timedelta(days=TTL_NO_RESULTS_DAYS)
    return timedelta(days=TTL_FAILED_DAYS)


async def get_cached_hostnames(db: AsyncSession, ip: str) -> list[str] | None:
    """Return cached hostnames for an IP if the row is fresh.

    Semantics:
    - Non-empty list → fresh ``success`` cache entry with hostnames
    - Empty list → fresh ``no_results`` cache entry (don't call source)
    - ``None`` → cache miss, expired row, or stored ``failed`` (retry)

    Failed rows map to ``None`` instead of ``[]`` so callers treat them
    as a miss and retry on the next scanner enrichment pass; we don't
    want a single bad day to hide every IP's real hostnames for a
    full TTL.
    """
    row = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()
    if row is None:
        return None
    if row.expires_at <= _now():
        return None
    if row.status == "failed":
        return None
    return list(row.hostnames_json or [])


async def get_hostnames_for_ips(
    db: AsyncSession, ips: list[str]
) -> dict[str, list[str]]:
    """Bulk cache read — return fresh cached hostnames for a set of IPs.

    Skips expired rows and ``failed`` rows (both serve as "no cached
    answer"). Empty lists are **omitted** from the result so the caller
    can distinguish "cache hit with zero vhosts" from "we haven't
    looked this IP up yet" by checking dict membership.

    Used by the scanner hostnames endpoint (``GET /api/scanner/hostnames``)
    to prime nuclei's SNI fan-out targets right before the nuclei phase.
    """
    if not ips:
        return {}

    now = _now()
    rows = (
        (
            await db.execute(
                select(HostnameLookup).where(
                    HostnameLookup.ip.in_(ips),
                    HostnameLookup.expires_at > now,
                    HostnameLookup.status != "failed",
                )
            )
        )
        .scalars()
        .all()
    )
    result: dict[str, list[str]] = {}
    for row in rows:
        names = list(row.hostnames_json or [])
        if names:
            result[row.ip] = names
    return result


@dataclass(frozen=True)
class HostnameCacheStatus:
    """Bulk cache read with freshness info.

    ``fresh`` maps IPs with valid (non-expired, non-failed) cache entries
    to their hostname lists.  ``expired_ips`` lists IPs that have a cache
    row but it's past ``expires_at`` or was a ``failed`` lookup — so the
    scanner knows the IP was previously seen but needs re-enrichment.

    IPs not in either set are completely unknown to the cache.
    """

    fresh: dict[str, list[str]]
    expired_ips: list[str]


async def get_hostname_cache_status(
    db: AsyncSession, ips: list[str]
) -> HostnameCacheStatus:
    """Bulk cache read returning fresh hostnames *and* expired IP list.

    Used by the scanner hostname enrichment pre-flight to distinguish
    "already cached" (skip), "expired" (re-query), and "unknown" (new IP).
    """
    if not ips:
        return HostnameCacheStatus(fresh={}, expired_ips=[])

    now = _now()

    # Fetch ALL rows for requested IPs (fresh + expired + failed).
    all_rows = (
        (
            await db.execute(
                select(HostnameLookup).where(HostnameLookup.ip.in_(ips))
            )
        )
        .scalars()
        .all()
    )

    fresh: dict[str, list[str]] = {}
    expired_ips: list[str] = []

    for row in all_rows:
        is_fresh = row.expires_at > now and row.status != "failed"
        if is_fresh:
            # Include fresh no_results rows as empty lists so the
            # scanner knows this IP was looked up recently and skips
            # re-querying it (the TTL for no_results is 7 days).
            fresh[row.ip] = list(row.hostnames_json or [])
        else:
            expired_ips.append(row.ip)

    return HostnameCacheStatus(fresh=fresh, expired_ips=expired_ips)


@dataclass(frozen=True)
class CachedHostnameSummary:
    """Per-IP summary used by the /api/hosts list response.

    Lightweight projection of a fresh ``hostname_lookup_cache`` row:
    just the count and a single display hostname (the first entry of
    the stored list). The hosts list endpoint joins this map onto its
    page in a single batch query so the table can render a vhost
    chip without an extra round-trip per row.
    """

    count: int
    display_hostname: str | None
    source: str | None


async def get_cached_hostname_summaries_for_ips(
    db: AsyncSession, ips: list[str]
) -> dict[str, CachedHostnameSummary]:
    """Bulk projection — return ``{ip: CachedHostnameSummary}`` for IPs
    with a fresh, non-failed cache row.

    Skips expired rows and ``failed`` rows. Includes ``no_results``
    rows with ``count=0`` so the UI can show "we looked, found
    nothing" distinctly from "we haven't looked yet".
    """
    if not ips:
        return {}

    now = _now()
    rows = (
        (
            await db.execute(
                select(HostnameLookup).where(
                    HostnameLookup.ip.in_(ips),
                    HostnameLookup.expires_at > now,
                    HostnameLookup.status != "failed",
                )
            )
        )
        .scalars()
        .all()
    )
    result: dict[str, CachedHostnameSummary] = {}
    for row in rows:
        names = list(row.hostnames_json or [])
        result[row.ip] = CachedHostnameSummary(
            count=len(names),
            display_hostname=names[0] if names else None,
            source=row.source,
        )
    return result


async def get_cache_row_for_ip(
    db: AsyncSession, ip: str
) -> HostnameLookup | None:
    """Return the raw cache row for an IP, or ``None`` if no row exists.

    Unlike :func:`get_cached_hostnames`, this returns the full row
    (including expired or failed) so callers can display row metadata
    like source and ``queried_at`` — for the host detail page's
    "Known Hostnames" panel, stale rows should still be visible so
    the operator knows a refresh is due. Caller decides how to handle
    expiry.
    """
    return (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()


async def update_cache_entry_manual(
    db: AsyncSession,
    ip: str,
    hostnames: list[str],
) -> HostnameLookup:
    """Admin hand-edit of a cache row — upsert with ``source='manual'``.

    Writes (or replaces) the row for ``ip`` with a non-expiring TTL so
    the filler never overwrites a hand-curated list. The status
    is derived from the hostname list: non-empty → ``success``, empty
    → ``no_results`` (operator explicitly asserting "this IP serves
    nothing worth scanning").

    Hostnames are trimmed + deduped case-insensitively before storage.
    """
    now = _now()
    normalized: dict[str, None] = {}
    for entry in hostnames:
        stripped = entry.strip()
        if stripped:
            normalized.setdefault(stripped.lower(), None)
    clean = list(normalized.keys())

    status: LookupStatus = "success" if clean else "no_results"
    expires = now + timedelta(days=MANUAL_EDIT_TTL_DAYS)

    existing = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()

    if existing is None:
        row = HostnameLookup(
            ip=ip,
            hostnames_json=clean,
            source=MANUAL_SOURCE_NAME,
            status=status,
            queried_at=now,
            expires_at=expires,
            error_message=None,
        )
        db.add(row)
        await db.flush()
        return row

    existing.hostnames_json = clean
    existing.source = MANUAL_SOURCE_NAME
    existing.status = status
    existing.queried_at = now
    existing.expires_at = expires
    existing.error_message = None
    await db.flush()
    return existing


async def delete_cache_entry(db: AsyncSession, ip: str) -> bool:
    """Drop the cache row for ``ip`` if it exists.

    Returns ``True`` when a row was deleted, ``False`` on miss. Used
    by the admin UI's delete action and for clearing junk cached data
    (e.g. a bad rapiddns row).
    """
    existing = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()
    if existing is None:
        return False
    await db.delete(existing)
    await db.flush()
    return True


async def upsert_cache_row(
    db: AsyncSession,
    ip: str,
    result: HostnameLookupResult,
    source: str,
) -> HostnameLookup:
    """Insert or overwrite the cache row for an IP.

    One row per IP (``ip`` is the unique key in migration 014), so the
    most recent lookup wins. ``expires_at`` is computed here from the
    result status to keep the TTL policy in one place.
    """
    now = _now()
    expires = now + _ttl_for_status(result.status)

    existing = (
        await db.execute(select(HostnameLookup).where(HostnameLookup.ip == ip))
    ).scalar_one_or_none()

    if existing is None:
        row = HostnameLookup(
            ip=ip,
            hostnames_json=list(result.hostnames),
            source=source,
            status=result.status,
            queried_at=now,
            expires_at=expires,
            error_message=result.error_message,
        )
        db.add(row)
        await db.flush()
        return row

    existing.hostnames_json = list(result.hostnames)
    existing.source = source
    existing.status = result.status
    existing.queried_at = now
    existing.expires_at = expires
    existing.error_message = result.error_message
    await db.flush()
    return existing


# --- Budget ----------------------------------------------------------


async def _get_or_create_budget_row(
    db: AsyncSession, source: str
) -> HostnameLookupBudget:
    """Find today's budget row for a source or create a fresh zero row."""
    today = _now().date()
    row = (
        await db.execute(
            select(HostnameLookupBudget)
            .where(HostnameLookupBudget.source == source)
            .where(HostnameLookupBudget.day == today)
        )
    ).scalar_one_or_none()
    if row is None:
        row = HostnameLookupBudget(source=source, day=today, used=0)
        db.add(row)
        await db.flush()
    return row


async def get_budget_used(db: AsyncSession, source: str) -> int:
    """Return the number of API calls consumed today for a source."""
    row = await _get_or_create_budget_row(db, source)
    return int(row.used)


async def consume_budget(
    db: AsyncSession, source: str, daily_limit: int
) -> bool:
    """Atomically consume one budget unit; return False if exhausted.

    Single-statement read-modify-write inside the caller's session. Safe
    under APScheduler's ``max_instances=1`` filler-job assumption. Do not
    call this from parallel workers without adding a row-level lock.
    """
    if daily_limit <= 0:
        return False
    row = await _get_or_create_budget_row(db, source)
    if row.used >= daily_limit:
        return False
    row.used += 1
    await db.flush()
    return True


async def increment_budget_used(db: AsyncSession, source: str) -> int:
    """Post-fact +1 budget tick — used by the scanner-results endpoint.

    Unlike :func:`consume_budget`, this never refuses: the scanner has
    already made the upstream API call by the time it posts results,
    so the data is sunk-cost. We still want the counter to advance so
    the next ``GET /hostname-budget`` reflects reality and the rest of
    today's enrichment respects the cap. Returns the new ``used``
    value for logging.
    """
    row = await _get_or_create_budget_row(db, source)
    row.used += 1
    await db.flush()
    return int(row.used)


async def pin_budget_exhausted(
    db: AsyncSession, source: str, daily_limit: int
) -> None:
    """Set today's budget to the daily limit.

    Triggered when the source itself reports its rate limit exceeded
    (e.g. HackerTarget returns ``"API count exceeded"`` even though our
    counter still had capacity). Most commonly happens after a backend
    restart that wiped the in-flight budget row before midnight. Pinning
    stops the filler from hammering the source for the rest of the day;
    a fresh row materialises at UTC midnight.
    """
    row = await _get_or_create_budget_row(db, source)
    if row.used < daily_limit:
        row.used = daily_limit
        await db.flush()


# --- On-demand queue (manual lookup handoff to scanner) --------------


async def enqueue_hostname_lookup(
    db: AsyncSession,
    ip: str,
    requested_by_user_id: int | None,
) -> HostnameLookupQueueEntry:
    """Add a pending manual lookup row for ``ip``.

    Always inserts a fresh ``pending`` row — duplicate suppression for
    the same IP happens at claim time, not enqueue time, because
    MariaDB < 10.5 cannot enforce a partial unique index on
    ``(ip, status='pending')`` and we don't want to take a row lock for
    every UI click.
    """
    entry = HostnameLookupQueueEntry(
        ip=ip,
        requested_by_user_id=requested_by_user_id,
        status="pending",
    )
    db.add(entry)
    await db.flush()
    return entry


async def _sweep_stuck_claims(db: AsyncSession) -> None:
    """Re-queue ``claimed`` rows that exceeded the stuck-claim window.

    Lazy maintenance — runs at the start of every claim cycle. A
    crashed or rebooted scanner can leave a row pinned in ``claimed``
    forever; this re-queues anything past
    ``QUEUE_STUCK_CLAIM_AFTER`` so the next poll picks it up.
    """
    cutoff = _now() - QUEUE_STUCK_CLAIM_AFTER
    await db.execute(
        update(HostnameLookupQueueEntry)
        .where(HostnameLookupQueueEntry.status == "claimed")
        .where(HostnameLookupQueueEntry.claimed_at.is_not(None))
        .where(HostnameLookupQueueEntry.claimed_at <= cutoff)
        .values(status="pending", claimed_at=None)
    )


async def _sweep_terminal_rows(db: AsyncSession) -> None:
    """Delete completed / failed rows older than the retention window."""
    cutoff = _now() - QUEUE_TERMINAL_RETENTION
    await db.execute(
        delete(HostnameLookupQueueEntry)
        .where(HostnameLookupQueueEntry.status.in_(("completed", "failed")))
        .where(HostnameLookupQueueEntry.completed_at.is_not(None))
        .where(HostnameLookupQueueEntry.completed_at <= cutoff)
    )


async def claim_pending_lookup_jobs(
    db: AsyncSession, limit: int = 10
) -> list[HostnameLookupQueueEntry]:
    """Atomically claim up to ``limit`` pending queue rows for a scanner.

    Performs the lazy stuck-claim sweep + terminal-row GC, then reads
    the oldest pending rows, marks each as ``claimed`` with a fresh
    ``claimed_at`` timestamp, and returns them to the caller. The
    ``flush`` happens before return so the caller's commit persists the
    state transition.

    De-duplicates by IP within the returned batch — if the queue has
    three pending rows for the same IP, only the oldest is claimed and
    returned; the other two stay pending and get cleaned up the next
    time their IP is enriched (the cache write covers all of them).
    """
    if limit <= 0:
        return []

    await _sweep_stuck_claims(db)
    await _sweep_terminal_rows(db)

    rows = (
        (
            await db.execute(
                select(HostnameLookupQueueEntry)
                .where(HostnameLookupQueueEntry.status == "pending")
                .order_by(HostnameLookupQueueEntry.requested_at.asc())
                .limit(limit * 4)  # over-fetch to absorb same-IP dupes
            )
        )
        .scalars()
        .all()
    )

    seen_ips: set[str] = set()
    claimed: list[HostnameLookupQueueEntry] = []
    now = _now()
    for row in rows:
        if row.ip in seen_ips:
            continue
        seen_ips.add(row.ip)
        row.status = "claimed"
        row.claimed_at = now
        claimed.append(row)
        if len(claimed) >= limit:
            break

    if claimed:
        await db.flush()
    return claimed


async def mark_queue_entry_completed(
    db: AsyncSession,
    queue_id: int,
    *,
    status: Literal["completed", "failed"] = "completed",
    error: str | None = None,
) -> HostnameLookupQueueEntry | None:
    """Mark a claimed queue row as terminal (completed or failed).

    Returns the updated row, or ``None`` if no row matches ``queue_id``.
    The error message is bounded to 500 characters before storage.
    """
    row = (
        await db.execute(
            select(HostnameLookupQueueEntry).where(
                HostnameLookupQueueEntry.id == queue_id
            )
        )
    ).scalar_one_or_none()
    if row is None:
        return None

    row.status = status
    row.completed_at = _now()
    row.error_message = error[:500] if error else None
    await db.flush()
    return row


async def get_pending_queue_count(db: AsyncSession) -> int:
    """Return the number of pending + claimed queue rows.

    Used by the admin status endpoint to surface "manual lookups
    waiting" on the dashboard. Includes ``claimed`` so an in-flight
    refresh still appears as outstanding work to the operator.
    """
    rows = (
        await db.execute(
            select(HostnameLookupQueueEntry.id).where(
                HostnameLookupQueueEntry.status.in_(("pending", "claimed"))
            )
        )
    ).all()
    return len(rows)


# --- Scanner-facing budget snapshot + bulk results write -------------

# Sources tracked by the scanner-facing budget endpoint. Order matches
# the scanner's source-priority chain (HT first, RapidDNS as fallback)
# so the budget response renders predictably in the UI.
SCANNER_BUDGET_SOURCES: tuple[str, ...] = ("hackertarget", "rapiddns")


def _scanner_source_limit(source: str) -> int:
    """Resolve the per-day cap for a scanner-facing source.

    Pulls from ``app.core.config.settings`` so the legacy backend
    filler and the new scanner-results path share the same configured
    limits during the 2.3.0 transition. Once the filler is deleted in
    Commit 10, these settings move scanner-side and this helper either
    becomes scanner-config aware or hardcodes the anonymous defaults.
    """
    # Local import to avoid circular dependency between core.config
    # and the service module at import time.
    from app.core.config import settings

    if source == "hackertarget":
        return (
            HACKERTARGET_DAILY_LIMIT_WITH_KEY
            if settings.hackertarget_api_key
            else HACKERTARGET_DAILY_LIMIT_ANON
        )
    if source == "rapiddns":
        if not settings.rapiddns_enabled:
            return 0
        return int(settings.rapiddns_daily_limit)
    return 0


@dataclass(frozen=True)
class BudgetSnapshotEntry:
    """One source's daily budget state for the scanner pre-flight check."""

    source: str
    used: int
    limit: int
    remaining: int


async def get_scanner_budget_snapshot(
    db: AsyncSession,
) -> list[BudgetSnapshotEntry]:
    """Return today's budget state for every scanner-tracked source.

    Each entry is independent; the scanner reads ``remaining`` and
    decides per-source whether to attempt a lookup. ``remaining``
    clamps to zero so callers never see negative values when the
    counter has been pinned past the limit by an upstream rate-limit
    signal.
    """
    snapshot: list[BudgetSnapshotEntry] = []
    for source in SCANNER_BUDGET_SOURCES:
        used = await get_budget_used(db, source)
        limit = _scanner_source_limit(source)
        remaining = max(limit - used, 0)
        snapshot.append(
            BudgetSnapshotEntry(
                source=source,
                used=used,
                limit=limit,
                remaining=remaining,
            )
        )
    return snapshot


@dataclass(frozen=True)
class ScannerResultsOutcome:
    """Aggregate counters returned to the scanner after a bulk write."""

    accepted: int
    rejected: int
    cache_rows_written: int
    hosts_synced: int
    budget_pinned_sources: list[str]


async def apply_scanner_hostname_results(
    db: AsyncSession,
    results: list[tuple[str, str, LookupStatus, list[str], str | None]],
) -> ScannerResultsOutcome:
    """Persist a batch of scanner-side enrichment outcomes.

    Per result tuple ``(ip, source, status, hostnames, error_message)``:

    1. Increment the daily budget counter for the source (post-fact —
       the scanner has already burned its API quota by the time it
       posts the result).
    2. Upsert the cache row via :func:`upsert_cache_row`. The TTL is
       chosen by the result status as usual.
    3. On ``success`` with non-empty hostnames: backfill the host's
       ``hostname`` column to the first vhost iff the host exists and
       does not yet have a hostname set. Existing hostnames (manual
       edits, ssl-cert / PTR / ip-api enrichment) are preserved.
    4. If the source's error message contains the well-known
       ``"api count exceeded"`` marker, pin today's budget so future
       calls to ``get_scanner_budget_snapshot`` short-circuit the
       scanner before it burns more quota.

    Caller is responsible for the transaction commit. Returns the
    aggregate outcome counters for the response payload.
    """
    # Local import — keeps the hostname_lookup service free of a
    # hard dependency on the hosts service module at import time.
    from app.services.hosts import get_host_by_ip

    accepted = 0
    rejected = 0
    cache_rows_written = 0
    hosts_synced = 0
    pinned: set[str] = set()

    for ip, source, status, hostnames, error_message in results:
        if source not in SCANNER_BUDGET_SOURCES:
            rejected += 1
            continue

        await increment_budget_used(db, source)

        result = HostnameLookupResult(
            status=status,
            hostnames=list(hostnames),
            error_message=error_message,
        )
        await upsert_cache_row(db, ip, result, source)
        cache_rows_written += 1
        accepted += 1

        if (
            error_message is not None
            and "api count exceeded" in error_message.lower()
            and source not in pinned
        ):
            await pin_budget_exhausted(db, source, _scanner_source_limit(source))
            pinned.add(source)

        if status == "success" and hostnames:
            host = await get_host_by_ip(db, ip)
            if host is not None and not host.hostname:
                host.hostname = hostnames[0]
                hosts_synced += 1

    if cache_rows_written or rejected:
        await db.flush()

    return ScannerResultsOutcome(
        accepted=accepted,
        rejected=rejected,
        cache_rows_written=cache_rows_written,
        hosts_synced=hosts_synced,
        budget_pinned_sources=sorted(pinned),
    )
