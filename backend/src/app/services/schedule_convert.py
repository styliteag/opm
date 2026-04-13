"""Convert structured schedule JSON to APScheduler CronTrigger and human text.

Pure functions with no DB or framework dependencies — independently testable.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]

_NTH_WORDS = {1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th"}

_WEEKDAY_LABELS = {
    "mon": "Monday",
    "tue": "Tuesday",
    "wed": "Wednesday",
    "thu": "Thursday",
    "fri": "Friday",
    "sat": "Saturday",
    "sun": "Sunday",
}

_WEEKDAY_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _normalize_day_of_week(expr: str) -> str:
    """Standard cron allows 7 for Sunday; APScheduler only accepts 0-6."""
    return re.sub(r"\b7\b", "0", expr)


def _build_legacy_trigger(
    expression: str,
    tz: Any,
) -> CronTrigger | None:
    """Build a CronTrigger from a 5 or 6-field cron string."""
    fields = expression.strip().split()
    if len(fields) == 5:
        minute, hour, day, month, day_of_week = fields
        return CronTrigger(
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=_normalize_day_of_week(day_of_week),
            timezone=tz,
        )
    if len(fields) == 6:
        second, minute, hour, day, month, day_of_week = fields
        return CronTrigger(
            second=second,
            minute=minute,
            hour=hour,
            day=day,
            month=month,
            day_of_week=_normalize_day_of_week(day_of_week),
            timezone=tz,
        )
    return None


def structured_to_cron_trigger(
    data: dict[str, Any],
    tz: Any,
) -> CronTrigger | None:
    """Convert a structured schedule dict to an APScheduler CronTrigger."""
    stype = data.get("type")

    if stype == "interval_hours":
        hours = data["hours"]
        return CronTrigger(minute=0, hour=f"*/{hours}", timezone=tz)

    if stype == "daily":
        return CronTrigger(
            minute=data["minute"],
            hour=data["hour"],
            timezone=tz,
        )

    if stype == "weekly":
        day_of_week = ",".join(data["days"])
        return CronTrigger(
            minute=data["minute"],
            hour=data["hour"],
            day_of_week=day_of_week,
            timezone=tz,
        )

    if stype == "monthly_date":
        return CronTrigger(
            minute=data["minute"],
            hour=data["hour"],
            day=data["day"],
            timezone=tz,
        )

    if stype == "monthly_nth":
        nth_word = _NTH_WORDS[data["nth"]]
        weekday = data["weekday"]
        return CronTrigger(
            minute=data["minute"],
            hour=data["hour"],
            day=f"{nth_word} {weekday}",
            timezone=tz,
        )

    if stype == "custom_cron":
        return _build_legacy_trigger(data["expression"], tz)

    return None


def build_trigger(schedule: str, tz: Any) -> CronTrigger | None:
    """Build a CronTrigger from either JSON schedule or legacy cron string."""
    stripped = schedule.strip()
    if stripped.startswith("{"):
        data = json.loads(stripped)
        return structured_to_cron_trigger(data, tz)
    return _build_legacy_trigger(stripped, tz)


def _fmt_time(hour: int, minute: int) -> str:
    return f"{hour:02d}:{minute:02d}"


def _sorted_days(days: list[str]) -> list[str]:
    return sorted(days, key=lambda d: _WEEKDAY_ORDER.index(d))


def schedule_to_human(raw: str) -> str | None:
    """Return a human-readable description of a schedule string.

    Returns ``None`` for unparsable input.
    """
    stripped = raw.strip()
    if not stripped:
        return None

    if stripped.startswith("{"):
        try:
            data = json.loads(stripped)
        except json.JSONDecodeError:
            return None
        return _structured_to_human(data)

    # Legacy cron — try cronstrue-style description
    return _legacy_cron_to_human(stripped)


def _structured_to_human(data: dict[str, Any]) -> str | None:
    stype = data.get("type")

    if stype == "interval_hours":
        h = data.get("hours", 1)
        if h == 1:
            return "Every hour"
        return f"Every {h} hours"

    if stype == "daily":
        return f"Daily at {_fmt_time(data['hour'], data['minute'])}"

    if stype == "weekly":
        days = _sorted_days(data["days"])
        day_names = [_WEEKDAY_LABELS.get(d, d) for d in days]
        return f"Weekly on {', '.join(day_names)} at {_fmt_time(data['hour'], data['minute'])}"

    if stype == "monthly_date":
        day = data["day"]
        return f"Monthly on day {day} at {_fmt_time(data['hour'], data['minute'])}"

    if stype == "monthly_nth":
        nth = _NTH_WORDS.get(data["nth"], str(data["nth"]))
        weekday = _WEEKDAY_LABELS.get(data["weekday"], data["weekday"])
        return f"Monthly on the {nth} {weekday} at {_fmt_time(data['hour'], data['minute'])}"

    if stype == "custom_cron":
        return f"Cron: {data.get('expression', '')}"

    return None


def _legacy_cron_to_human(cron: str) -> str | None:
    """Simple human description for common cron patterns."""
    fields = cron.split()
    if len(fields) < 5:
        return None

    minute, hour, day, month, dow = fields[:5]

    # Every minute
    if all(f == "*" for f in fields[:5]):
        return "Every minute"

    # Every N minutes
    if minute.startswith("*/") and hour == "*" and day == "*" and month == "*" and dow == "*":
        return f"Every {minute[2:]} minutes"

    # Every N hours
    if minute == "0" and hour.startswith("*/") and day == "*" and month == "*" and dow == "*":
        return f"Every {hour[2:]} hours"

    # Daily
    if day == "*" and month == "*" and dow == "*" and minute.isdigit() and hour.isdigit():
        return f"Daily at {_fmt_time(int(hour), int(minute))}"

    # Weekly
    if day == "*" and month == "*" and dow != "*" and minute.isdigit() and hour.isdigit():
        return f"Weekly at {_fmt_time(int(hour), int(minute))} (cron: {cron})"

    # Monthly
    if day.isdigit() and month == "*" and dow == "*" and minute.isdigit() and hour.isdigit():
        return f"Monthly on day {day} at {_fmt_time(int(hour), int(minute))}"

    return f"Cron: {cron}"


def get_next_fire_time(
    schedule: str,
    tz: Any,
) -> datetime | None:
    """Compute the next fire time for a schedule string.

    Returns a UTC datetime or ``None`` if the schedule is invalid.
    """
    trigger = build_trigger(schedule, tz)
    if trigger is None:
        return None
    now = datetime.now(timezone.utc)
    nft = trigger.get_next_fire_time(None, now)
    if nft is None:
        return None
    # Ensure we return UTC
    result: datetime = nft.astimezone(timezone.utc)
    return result
