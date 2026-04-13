"""Structured schedule schemas for scan scheduling.

Defines a discriminated union of schedule types that map to APScheduler
CronTrigger parameters. Stored as JSON strings in ``Network.scan_schedule``;
legacy 5/6-field cron strings remain supported via hybrid detection.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field, field_validator

VALID_WEEKDAYS = frozenset({"mon", "tue", "wed", "thu", "fri", "sat", "sun"})


class IntervalHoursSchedule(BaseModel):
    type: Literal["interval_hours"]
    hours: int = Field(ge=1, le=24)


class DailySchedule(BaseModel):
    type: Literal["daily"]
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)


class WeeklySchedule(BaseModel):
    type: Literal["weekly"]
    days: list[str] = Field(min_length=1)
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)

    @field_validator("days")
    @classmethod
    def validate_days(cls, v: list[str]) -> list[str]:
        normalized = [d.lower() for d in v]
        invalid = set(normalized) - VALID_WEEKDAYS
        if invalid:
            raise ValueError(f"Invalid weekday(s): {', '.join(sorted(invalid))}")
        return normalized


class MonthlyDateSchedule(BaseModel):
    type: Literal["monthly_date"]
    day: int = Field(ge=1, le=31)
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)


class MonthlyNthSchedule(BaseModel):
    type: Literal["monthly_nth"]
    nth: int = Field(ge=1, le=5)
    weekday: str
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)

    @field_validator("weekday")
    @classmethod
    def validate_weekday(cls, v: str) -> str:
        low = v.lower()
        if low not in VALID_WEEKDAYS:
            raise ValueError(f"Invalid weekday: {v}")
        return low


class CustomCronSchedule(BaseModel):
    type: Literal["custom_cron"]
    expression: str = Field(min_length=1)

    @field_validator("expression")
    @classmethod
    def validate_expression(cls, v: str) -> str:
        parts = v.strip().split()
        if len(parts) < 5 or len(parts) > 6:
            raise ValueError(
                "Invalid cron format: expected 5 or 6 fields "
                "(minute hour day_of_month month day_of_week)"
            )
        return v.strip()


StructuredSchedule = Annotated[
    Union[
        IntervalHoursSchedule,
        DailySchedule,
        WeeklySchedule,
        MonthlyDateSchedule,
        MonthlyNthSchedule,
        CustomCronSchedule,
    ],
    Field(discriminator="type"),
]


def parse_structured_schedule(data: dict[str, object]) -> StructuredSchedule:
    """Parse and validate a structured schedule dict.

    Raises ``ValueError`` on invalid input (Pydantic wraps as ValidationError,
    we re-raise the first error message as plain ValueError for the network
    schema validator).
    """
    from pydantic import TypeAdapter, ValidationError

    adapter: TypeAdapter[StructuredSchedule] = TypeAdapter(StructuredSchedule)
    try:
        result: StructuredSchedule = adapter.validate_python(data)
        return result
    except ValidationError as exc:
        raise ValueError(str(exc.errors()[0]["msg"])) from exc
