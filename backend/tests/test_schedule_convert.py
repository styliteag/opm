"""Tests for structured schedule conversion and human-readable descriptions."""

from datetime import datetime, timezone

import pytest
from apscheduler.triggers.cron import CronTrigger  # type: ignore[import-untyped]

from app.schemas.schedule import parse_structured_schedule
from app.services.schedule_convert import (
    build_trigger,
    get_next_fire_time,
    schedule_to_human,
    structured_to_cron_trigger,
)


class TestStructuredToCronTrigger:
    """Test structured_to_cron_trigger produces valid CronTrigger instances."""

    def test_interval_hours(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "interval_hours", "hours": 4}, timezone.utc
        )
        assert isinstance(trigger, CronTrigger)
        # Fires at minute 0, every 4 hours
        ref = datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        assert nft.minute == 0
        assert nft.hour % 4 == 0

    def test_interval_hours_1(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "interval_hours", "hours": 1}, timezone.utc
        )
        assert isinstance(trigger, CronTrigger)
        ref = datetime(2026, 4, 14, 3, 30, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        assert nft.hour == 4
        assert nft.minute == 0

    def test_daily(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "daily", "hour": 2, "minute": 30}, timezone.utc
        )
        assert isinstance(trigger, CronTrigger)
        ref = datetime(2026, 4, 14, 3, 0, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        # Should fire next day at 02:30
        assert nft.day == 15
        assert nft.hour == 2
        assert nft.minute == 30

    def test_weekly(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "weekly", "days": ["mon", "fri"], "hour": 3, "minute": 0},
            timezone.utc,
        )
        assert isinstance(trigger, CronTrigger)
        # 2026-04-14 is a Tuesday
        ref = datetime(2026, 4, 14, 4, 0, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        # Next Monday or Friday
        assert nft.weekday() in (0, 4)  # Monday=0, Friday=4

    def test_monthly_date(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "monthly_date", "day": 15, "hour": 2, "minute": 0},
            timezone.utc,
        )
        assert isinstance(trigger, CronTrigger)
        ref = datetime(2026, 4, 14, 0, 0, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        assert nft.day == 15
        assert nft.hour == 2

    def test_monthly_nth_3rd_sunday(self) -> None:
        """3rd Sunday of the month — the key new capability."""
        trigger = structured_to_cron_trigger(
            {"type": "monthly_nth", "nth": 3, "weekday": "sun", "hour": 2, "minute": 0},
            timezone.utc,
        )
        assert isinstance(trigger, CronTrigger)
        # 3rd Sunday of April 2026 is April 19
        ref = datetime(2026, 4, 1, 0, 0, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        assert nft.day == 19
        assert nft.weekday() == 6  # Sunday
        assert nft.hour == 2

    def test_monthly_nth_1st_monday(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "monthly_nth", "nth": 1, "weekday": "mon", "hour": 9, "minute": 0},
            timezone.utc,
        )
        assert isinstance(trigger, CronTrigger)
        # 1st Monday of May 2026 is May 4
        ref = datetime(2026, 5, 1, 0, 0, tzinfo=timezone.utc)
        nft = trigger.get_next_fire_time(None, ref)
        assert nft is not None
        assert nft.day == 4
        assert nft.weekday() == 0  # Monday

    def test_custom_cron(self) -> None:
        trigger = structured_to_cron_trigger(
            {"type": "custom_cron", "expression": "0 2 * * 1"},
            timezone.utc,
        )
        assert isinstance(trigger, CronTrigger)

    def test_unknown_type_returns_none(self) -> None:
        result = structured_to_cron_trigger({"type": "bogus"}, timezone.utc)
        assert result is None


class TestBuildTrigger:
    """Test the hybrid dispatcher (JSON vs legacy cron)."""

    def test_json_schedule(self) -> None:
        trigger = build_trigger('{"type":"daily","hour":2,"minute":0}', timezone.utc)
        assert isinstance(trigger, CronTrigger)

    def test_legacy_cron(self) -> None:
        trigger = build_trigger("0 2 * * *", timezone.utc)
        assert isinstance(trigger, CronTrigger)

    def test_legacy_cron_with_day7(self) -> None:
        """Day-of-week 7 (Sunday in standard cron) should be normalized to 0."""
        trigger = build_trigger("0 2 * * 7", timezone.utc)
        assert isinstance(trigger, CronTrigger)

    def test_invalid_cron_returns_none(self) -> None:
        result = build_trigger("not a cron", timezone.utc)
        assert result is None


class TestScheduleToHuman:
    """Test human-readable description generation."""

    def test_interval_1h(self) -> None:
        raw = '{"type":"interval_hours","hours":1}'
        assert schedule_to_human(raw) == "Every hour"

    def test_interval_4h(self) -> None:
        raw = '{"type":"interval_hours","hours":4}'
        assert schedule_to_human(raw) == "Every 4 hours"

    def test_daily(self) -> None:
        raw = '{"type":"daily","hour":2,"minute":0}'
        assert schedule_to_human(raw) == "Daily at 02:00"

    def test_weekly(self) -> None:
        raw = '{"type":"weekly","days":["fri","mon"],"hour":3,"minute":0}'
        result = schedule_to_human(raw)
        assert result is not None
        assert "Monday" in result
        assert "Friday" in result

    def test_monthly_date(self) -> None:
        raw = '{"type":"monthly_date","day":15,"hour":2,"minute":0}'
        assert schedule_to_human(raw) == "Monthly on day 15 at 02:00"

    def test_monthly_nth(self) -> None:
        raw = '{"type":"monthly_nth","nth":3,"weekday":"sun","hour":2,"minute":0}'
        assert schedule_to_human(raw) == "Monthly on the 3rd Sunday at 02:00"

    def test_custom_cron(self) -> None:
        raw = '{"type":"custom_cron","expression":"0 2 * * 1"}'
        assert schedule_to_human(raw) == "Cron: 0 2 * * 1"

    def test_legacy_daily(self) -> None:
        assert schedule_to_human("0 2 * * *") == "Daily at 02:00"

    def test_legacy_every_n_hours(self) -> None:
        assert schedule_to_human("0 */4 * * *") == "Every 4 hours"

    def test_empty_returns_none(self) -> None:
        assert schedule_to_human("") is None

    def test_invalid_json_returns_none(self) -> None:
        assert schedule_to_human("{broken") is None


class TestGetNextFireTime:
    """Test next_fire_time computation."""

    def test_returns_utc_datetime(self) -> None:
        result = get_next_fire_time('{"type":"daily","hour":2,"minute":0}', timezone.utc)
        assert result is not None
        assert result.tzinfo == timezone.utc

    def test_invalid_returns_none(self) -> None:
        result = get_next_fire_time("not valid", timezone.utc)
        assert result is None


class TestParseStructuredSchedule:
    """Test Pydantic validation of schedule dicts."""

    def test_valid_daily(self) -> None:
        result = parse_structured_schedule({"type": "daily", "hour": 2, "minute": 0})
        assert result.type == "daily"

    def test_valid_monthly_nth(self) -> None:
        result = parse_structured_schedule(
            {"type": "monthly_nth", "nth": 3, "weekday": "sun", "hour": 2, "minute": 0}
        )
        assert result.type == "monthly_nth"

    def test_invalid_weekday(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule(
                {"type": "monthly_nth", "nth": 3, "weekday": "xyz", "hour": 2, "minute": 0}
            )

    def test_invalid_hour(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule({"type": "daily", "hour": 25, "minute": 0})

    def test_invalid_nth(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule(
                {"type": "monthly_nth", "nth": 6, "weekday": "mon", "hour": 2, "minute": 0}
            )

    def test_weekly_empty_days(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule(
                {"type": "weekly", "days": [], "hour": 2, "minute": 0}
            )

    def test_weekly_invalid_day(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule(
                {"type": "weekly", "days": ["xyz"], "hour": 2, "minute": 0}
            )

    def test_custom_cron_bad_expression(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule(
                {"type": "custom_cron", "expression": "not cron"}
            )

    def test_unknown_type(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule({"type": "bogus"})

    def test_interval_hours_out_of_range(self) -> None:
        with pytest.raises(ValueError):
            parse_structured_schedule({"type": "interval_hours", "hours": 25})
