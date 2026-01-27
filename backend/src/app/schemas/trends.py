"""Trend data schemas for historical analysis."""

from datetime import date

from pydantic import BaseModel


class TrendDataPoint(BaseModel):
    """A single data point in a trend series."""

    date: date
    count: int


class TrendDataResponse(BaseModel):
    """Response containing trend data points."""

    data: list[TrendDataPoint]
