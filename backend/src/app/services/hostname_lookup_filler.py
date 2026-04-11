"""Background filler for the hostname lookup cache.

Runs on a schedule (wired into APScheduler from ``scheduler.py``) and
populates ``hostname_lookup_cache`` for any known host that is either
missing from the cache or has an expired row. Candidates are selected
from the ``hosts`` table in ``last_seen_at DESC`` order so freshly
discovered hosts are enriched first.

The filler uses the primitives in ``hostname_lookup.py`` (get/upsert/
consume budget) directly — not the high-level ``lookup_with_cache``
helper — because it needs fine-grained control over:

- **Per-run early exit**: two consecutive non-rate-limit failures and
  the filler bails out of this hourly slot. Next hour starts fresh —
  no persistent circuit breaker, no complex state. Matches the
  "wenn crt.sh oder hackertarget uns nicht antwortet, frag in diesem
  scan nicht mehr dort, beim nächsten scan wieder" requirement.
- **Source-side rate-limit pinning**: if HackerTarget returns HTTP
  429 or an "API count exceeded" body, we stop for the day and pin
  the budget counter to the cap so even a broken filler wake-up a
  minute later doesn't re-probe.
- **Per-IP commit**: every cache write is committed immediately, so a
  mid-run crash never loses hostnames that were already fetched.
- **Inter-request throttle**: HackerTarget enforces ≤ 2 req/s. The
  filler sleeps ``interval_s`` between source calls (default 0.6 s,
  from ``HACKERTARGET_MIN_REQUEST_INTERVAL_S``).
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from datetime import datetime

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.models.host import Host
from app.models.hostname_lookup import HostnameLookup
from app.services.hostname_lookup import (
    HACKERTARGET_DAILY_LIMIT_ANON,
    HACKERTARGET_DAILY_LIMIT_WITH_KEY,
    HACKERTARGET_MIN_REQUEST_INTERVAL_S,
    HackerTargetSource,
    HostnameLookupSource,
    consume_budget,
    get_budget_used,
    get_cached_hostnames,
    pin_budget_exhausted,
    upsert_cache_row,
)

logger = logging.getLogger(__name__)

# Hard upper bound on IPs touched in a single filler run. Even with a
# 100/day API key, processing them all in one hourly slot would burn
# the budget at 11:00 and leave the rest of the day idle. Spreading
# the 100 calls across ~24 hourly slots means ~4 per run — matches the
# MAX_IPS_PER_RUN default.
MAX_IPS_PER_RUN = 25

# Default number of back-to-back non-429 failures before the filler
# bails out of the current run. Keeps the source from getting
# hammered when it's in a bad state.
DEFAULT_MAX_CONSECUTIVE_FAILURES = 2


@dataclass
class FillerRunSummary:
    """Observability snapshot of one filler pass.

    Passed to the logger so operators can diff runs in the scan-log
    UI and spot sudden surges in ``failed`` or ``rate_limited``.
    """

    candidates: int = 0
    cache_hits: int = 0
    success: int = 0
    no_results: int = 0
    failed: int = 0
    rate_limited: bool = False
    budget_exhausted_mid_run: bool = False
    consecutive_failures_abort: bool = False
    skipped_reason: str | None = None
    processed_ips: list[str] = field(default_factory=list)

    def as_log_dict(self) -> dict[str, object]:
        """Flat dict for structured logging; omits the per-IP list."""
        return {
            "candidates": self.candidates,
            "cache_hits": self.cache_hits,
            "success": self.success,
            "no_results": self.no_results,
            "failed": self.failed,
            "rate_limited": self.rate_limited,
            "budget_exhausted_mid_run": self.budget_exhausted_mid_run,
            "consecutive_failures_abort": self.consecutive_failures_abort,
            "skipped_reason": self.skipped_reason,
        }


async def _select_candidate_ips(
    db: AsyncSession, limit: int, now: datetime
) -> list[str]:
    """Return IPs that need a hostname lookup right now.

    A host is a candidate when:
    - No cache row exists at all, **or**
    - The cache row's ``expires_at`` is in the past (any status).

    Failed rows that are still within their short 3-day TTL are
    intentionally skipped here — the filler should not retry a fresh
    failure on the next hourly wake-up; the TTL decides when to retry.
    Rows with status ``no_results`` that are still fresh are also
    skipped (they still count as valid cache content).

    Ordering: ``hosts.last_seen_at DESC`` so the most recently observed
    host is enriched first — matches "freshest discovery gets
    priority" from the plan.
    """
    stmt = (
        select(Host.ip)
        .outerjoin(HostnameLookup, HostnameLookup.ip == Host.ip)
        .where(
            or_(
                HostnameLookup.ip.is_(None),
                HostnameLookup.expires_at <= now,
            )
        )
        .order_by(Host.last_seen_at.desc())
        .limit(limit)
    )
    result = await db.execute(stmt)
    return [row for row in result.scalars().all()]


async def fill_cache_once(
    db: AsyncSession,
    source: HostnameLookupSource,
    daily_limit: int,
    *,
    interval_s: float = HACKERTARGET_MIN_REQUEST_INTERVAL_S,
    max_consecutive_failures: int = DEFAULT_MAX_CONSECUTIVE_FAILURES,
    max_ips: int = MAX_IPS_PER_RUN,
    now: datetime | None = None,
) -> FillerRunSummary:
    """Run exactly one filler pass — one candidate batch, sequential.

    Caller is responsible for committing / closing the session. Every
    successful source call is committed inside the loop via
    ``db.commit()`` so partial progress survives crashes or timeouts.

    Returns a summary even when the run short-circuits (no candidates,
    budget exhausted, consecutive-failure abort, rate-limit pin) so the
    log line is always actionable.
    """
    from app.services.hostname_lookup import _now  # local import avoids a cycle

    now = now or _now()
    summary = FillerRunSummary()

    used = await get_budget_used(db, source.name)
    budget_remaining = max(0, daily_limit - used)
    if budget_remaining == 0:
        summary.skipped_reason = "budget_exhausted"
        logger.info(
            "hostname-filler: skipping run — daily budget already exhausted for source=%s (%d/%d)",
            source.name,
            used,
            daily_limit,
        )
        return summary

    candidates_limit = min(budget_remaining, max_ips)
    candidates = await _select_candidate_ips(db, candidates_limit, now)
    summary.candidates = len(candidates)

    if not candidates:
        summary.skipped_reason = "no_candidates"
        logger.info(
            "hostname-filler: no candidates (all hosts cached fresh, source=%s)",
            source.name,
        )
        return summary

    logger.info(
        "hostname-filler: starting run source=%s candidates=%d budget_remaining=%d",
        source.name,
        len(candidates),
        budget_remaining,
    )

    consecutive_failures = 0
    for ip in candidates:
        # Cache-first re-check — in case another pass raced ahead or
        # the candidate list is stale.
        cached = await get_cached_hostnames(db, ip)
        if cached is not None:
            summary.cache_hits += 1
            continue

        if not await consume_budget(db, source.name, daily_limit):
            summary.budget_exhausted_mid_run = True
            logger.info(
                "hostname-filler: budget exhausted mid-run after %d IPs",
                len(summary.processed_ips),
            )
            break

        result = await source.fetch(ip)
        await upsert_cache_row(db, ip, result, source.name)
        await db.commit()  # progress survives a crash after this point
        summary.processed_ips.append(ip)

        if result.status == "success":
            summary.success += 1
            consecutive_failures = 0
        elif result.status == "no_results":
            summary.no_results += 1
            consecutive_failures = 0
        else:  # failed
            summary.failed += 1

            rate_limit_hit = (
                result.error_message is not None
                and "api count exceeded" in result.error_message.lower()
            )
            if rate_limit_hit:
                await pin_budget_exhausted(db, source.name, daily_limit)
                await db.commit()
                summary.rate_limited = True
                logger.warning(
                    "hostname-filler: source=%s reported rate limit, pinning budget and stopping",
                    source.name,
                )
                break

            consecutive_failures += 1
            if consecutive_failures >= max_consecutive_failures:
                summary.consecutive_failures_abort = True
                logger.warning(
                    "hostname-filler: %d consecutive failures for source=%s, "
                    "bailing out of this run",
                    consecutive_failures,
                    source.name,
                )
                break

        # Throttle between source calls (HackerTarget ≤ 2 req/s).
        # `interval_s=0` in tests disables the delay.
        if interval_s > 0:
            await asyncio.sleep(interval_s)

    logger.info(
        "hostname-filler: run complete source=%s summary=%s",
        source.name,
        summary.as_log_dict(),
    )
    return summary


async def run_hostname_cache_filler() -> None:
    """APScheduler entry point.

    Opens a fresh session, builds the configured source, and calls
    ``fill_cache_once`` exactly once. Wired into the scheduler at
    startup with ``IntervalTrigger(minutes=hostname_lookup_interval_minutes)``.
    """
    if not settings.hostname_lookup_enabled:
        logger.debug(
            "hostname-filler: skipping — hostname_lookup_enabled=False"
        )
        return

    api_key = settings.hackertarget_api_key or None
    daily_limit = (
        HACKERTARGET_DAILY_LIMIT_WITH_KEY
        if api_key
        else HACKERTARGET_DAILY_LIMIT_ANON
    )
    source = HackerTargetSource(api_key=api_key)

    async with async_session_factory() as db:
        try:
            await fill_cache_once(
                db,
                source=source,
                daily_limit=daily_limit,
            )
        except Exception:
            # Broad catch so a schema drift or programming error never
            # crashes the APScheduler worker and stops all scan
            # scheduling.
            logger.exception("hostname-filler: unexpected failure")
            await db.rollback()
