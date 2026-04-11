"""Background scheduler for creating planned scans based on cron schedules."""

import logging
from datetime import datetime, timedelta, timezone, tzinfo
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler  # type: ignore[import-untyped]
from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]
from apscheduler.triggers.interval import IntervalTrigger  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


def _get_schedule_timezone() -> timezone | ZoneInfo | tzinfo:
    """Get the timezone for cron schedules from settings or system default."""
    tz_name = settings.schedule_timezone.strip()
    if not tz_name:
        # Use server's local timezone
        local_tz = datetime.now().astimezone().tzinfo
        if local_tz is not None:
            return local_tz
        return timezone.utc
    try:
        return ZoneInfo(tz_name)
    except (KeyError, ValueError):
        logger.warning("Invalid schedule_timezone '%s', falling back to UTC", tz_name)
        return timezone.utc


def _build_cron_trigger(schedule: str) -> CronTrigger | None:
    """Build a CronTrigger from 5 or 6-field cron syntax."""
    schedule_tz = _get_schedule_timezone()
    fields = schedule.split()
    if len(fields) == 5:
        minute, hour, day, month, day_of_week = fields
        return CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=schedule_tz,
        )
    if len(fields) == 6:
        second, minute, hour, day, month, day_of_week = fields
        return CronTrigger(
            second=second,
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=day_of_week,
            timezone=schedule_tz,
        )
    return None


def _is_schedule_due(schedule: str, now: datetime) -> bool:
    """Return True if the cron schedule should fire within the last minute."""
    trigger = _build_cron_trigger(schedule)
    if trigger is None:
        return False
    window_start = now - timedelta(minutes=1)
    next_fire = trigger.get_next_fire_time(None, window_start)
    return next_fire is not None and next_fire <= now


async def _has_active_scan(db: AsyncSession, network_id: int) -> bool:
    """Check if a network already has a planned or running scan."""
    result = await db.execute(
        select(Scan.id)
        .where(
            Scan.network_id == network_id,
            Scan.status.in_([ScanStatus.PLANNED, ScanStatus.RUNNING]),
        )
        .limit(1)
    )
    return result.scalar_one_or_none() is not None


async def evaluate_schedules() -> None:
    """Evaluate network schedules and create planned scans when due."""
    now = datetime.now(timezone.utc)
    async with async_session_factory() as db:
        # Get networks with schedules (read-only query)
        result = await db.execute(select(Network).where(Network.scan_schedule.is_not(None)))
        networks = result.scalars().all()

        for network in networks:
            if not network.scan_schedule:
                continue
            if not _is_schedule_due(network.scan_schedule, now):
                continue

            # Lock this network row - other workers will skip it
            lock_result = await db.execute(
                select(Network)
                .where(Network.id == network.id)
                .with_for_update(skip_locked=True)
            )
            locked_network = lock_result.scalar_one_or_none()
            if locked_network is None:
                # Another worker has the lock, skip
                continue

            # Double-check for active scan after acquiring lock
            if await _has_active_scan(db, network.id):
                continue

            # For NSE scanner type, attach the network's default profile
            nse_template_id = None
            if network.scanner_type == "nse" and network.nse_profile_id is not None:
                nse_template_id = network.nse_profile_id

            scan = Scan(
                network_id=network.id,
                scanner_id=network.scanner_id,
                status=ScanStatus.PLANNED,
                trigger_type=TriggerType.SCHEDULED,
                nse_template_id=nse_template_id,
            )
            db.add(scan)
            await db.flush()
            logger.info("Scheduled scan for network %s (%s)", network.name, network.id)

        await db.commit()


def start_scheduler() -> AsyncIOScheduler:
    """Start the APScheduler instance for scan scheduling."""
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    # Local import — hostname_lookup_filler pulls in httpx and the full
    # hostname lookup service stack, which we don't want on module import
    # if the scheduler module is imported for other reasons (e.g. tests).
    from app.services.hostname_lookup_filler import run_hostname_cache_filler

    scheduler = AsyncIOScheduler(timezone=timezone.utc)
    scheduler.add_job(
        evaluate_schedules,
        IntervalTrigger(minutes=1, timezone=timezone.utc),
        id="scan-schedule-evaluator",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30,
    )
    # Hostname lookup cache filler — hourly by default, gated on
    # settings.hostname_lookup_enabled (the job itself short-circuits
    # when the flag is off, so we always schedule it and let the
    # function decide at fire time).
    scheduler.add_job(
        run_hostname_cache_filler,
        IntervalTrigger(
            minutes=settings.hostname_lookup_interval_minutes,
            timezone=timezone.utc,
        ),
        id="hostname-cache-filler",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=300,
    )
    scheduler.start()
    logger.info(
        "Scan scheduler started (scan eval every 1 min, hostname filler every %d min)",
        settings.hostname_lookup_interval_minutes,
    )
    _scheduler = scheduler
    return scheduler


def shutdown_scheduler() -> None:
    """Stop the APScheduler instance."""
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    logger.info("Scan scheduler stopped")
    _scheduler = None
