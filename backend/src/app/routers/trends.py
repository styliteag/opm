"""Trend data endpoints for historical analysis."""

from datetime import date, datetime
from enum import Enum

from fastapi import APIRouter, Query
from sqlalchemy import distinct, func, select

from app.core.deps import CurrentUser, DbSession
from app.models.alert import Alert, AlertType
from app.models.host import Host
from app.models.open_port import OpenPort
from app.models.scan import Scan
from app.schemas.trends import (
    AlertTrendDataPoint,
    AlertTrendDataResponse,
    TrendDataPoint,
    TrendDataResponse,
)

router = APIRouter(prefix="/api/trends", tags=["trends"])


class PeriodType(str, Enum):
    """Time period grouping options."""

    DAY = "day"
    WEEK = "week"
    MONTH = "month"


@router.get("/open-ports", response_model=TrendDataResponse)
async def get_open_ports_trend(
    user: CurrentUser,
    db: DbSession,
    start_date: date = Query(..., description="Start date for trend data"),
    end_date: date = Query(..., description="End date for trend data"),
    period: PeriodType = Query(PeriodType.DAY, description="Time period grouping"),
    network_id: int | None = Query(None, ge=1, description="Optional network filter"),
) -> TrendDataResponse:
    """
    Get historical open ports trend data.

    Aggregates unique ip:port combinations over time periods.
    Returns data points with date and count.
    """
    # Convert dates to datetime for comparison
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    # Build date truncation expression based on period
    if period == PeriodType.DAY:
        date_trunc = func.date(OpenPort.first_seen_at)
    elif period == PeriodType.WEEK:
        # Week starts on Monday (ISO week)
        date_trunc = func.date(
            func.date_sub(OpenPort.first_seen_at, func.weekday(OpenPort.first_seen_at))
        )
    else:  # MONTH
        date_trunc = func.date(
            func.concat(
                func.year(OpenPort.first_seen_at),
                "-",
                func.lpad(func.month(OpenPort.first_seen_at), 2, "0"),
                "-01",
            )
        )

    # Build base query
    query = (
        select(
            date_trunc.label("period_date"),
            func.count(distinct(func.concat(OpenPort.ip, ":", OpenPort.port))).label("count"),
        )
        .join(Scan, Scan.id == OpenPort.scan_id)
        .where(
            OpenPort.first_seen_at >= start_datetime,
            OpenPort.first_seen_at <= end_datetime,
        )
        .group_by(date_trunc)
        .order_by(date_trunc)
    )

    # Add network filter if provided
    if network_id is not None:
        query = query.where(Scan.network_id == network_id)

    # Execute query
    result = await db.execute(query)
    rows = result.all()

    # Convert to response format
    data_points = [TrendDataPoint(date=row.period_date, count=row.count) for row in rows]

    return TrendDataResponse(data=data_points)


@router.get("/hosts", response_model=TrendDataResponse)
async def get_hosts_trend(
    user: CurrentUser,
    db: DbSession,
    start_date: date = Query(..., description="Start date for trend data"),
    end_date: date = Query(..., description="End date for trend data"),
    period: PeriodType = Query(PeriodType.DAY, description="Time period grouping"),
    network_id: int | None = Query(None, ge=1, description="Optional network filter"),
) -> TrendDataResponse:
    """
    Get historical hosts discovery trend data.

    Aggregates host discoveries by first_seen_at over time periods.
    Returns data points with date and count.
    """
    # Convert dates to datetime for comparison
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    # Build date truncation expression based on period
    if period == PeriodType.DAY:
        date_trunc = func.date(Host.first_seen_at)
    elif period == PeriodType.WEEK:
        # Week starts on Monday (ISO week)
        date_trunc = func.date(
            func.date_sub(Host.first_seen_at, func.weekday(Host.first_seen_at))
        )
    else:  # MONTH
        date_trunc = func.date(
            func.concat(
                func.year(Host.first_seen_at),
                "-",
                func.lpad(func.month(Host.first_seen_at), 2, "0"),
                "-01",
            )
        )

    # Build base query
    query = (
        select(
            date_trunc.label("period_date"),
            func.count(Host.id).label("count"),
        )
        .where(
            Host.first_seen_at >= start_datetime,
            Host.first_seen_at <= end_datetime,
        )
        .group_by(date_trunc)
        .order_by(date_trunc)
    )

    # Add network filter if provided
    if network_id is not None:
        # Filter hosts by checking if network_id is in the seen_by_networks JSON array
        query = query.where(func.json_contains(Host.seen_by_networks, str(network_id)))

    # Execute query
    result = await db.execute(query)
    rows = result.all()

    # Convert to response format
    data_points = [TrendDataPoint(date=row.period_date, count=row.count) for row in rows]

    return TrendDataResponse(data=data_points)


@router.get("/alerts", response_model=AlertTrendDataResponse)
async def get_alerts_trend(
    user: CurrentUser,
    db: DbSession,
    start_date: date = Query(..., description="Start date for trend data"),
    end_date: date = Query(..., description="End date for trend data"),
    period: PeriodType = Query(PeriodType.DAY, description="Time period grouping"),
    network_id: int | None = Query(None, ge=1, description="Optional network filter"),
    alert_type: AlertType | None = Query(None, description="Optional alert type filter"),
) -> AlertTrendDataResponse:
    """
    Get historical alerts trend data.

    Aggregates alerts by created_at over time periods.
    Returns data points with date, total count, and acknowledged count.
    """
    # Convert dates to datetime for comparison
    start_datetime = datetime.combine(start_date, datetime.min.time())
    end_datetime = datetime.combine(end_date, datetime.max.time())

    # Build date truncation expression based on period
    if period == PeriodType.DAY:
        date_trunc = func.date(Alert.created_at)
    elif period == PeriodType.WEEK:
        # Week starts on Monday (ISO week)
        date_trunc = func.date(
            func.date_sub(Alert.created_at, func.weekday(Alert.created_at))
        )
    else:  # MONTH
        date_trunc = func.date(
            func.concat(
                func.year(Alert.created_at),
                "-",
                func.lpad(func.month(Alert.created_at), 2, "0"),
                "-01",
            )
        )

    # Build base query
    query = (
        select(
            date_trunc.label("period_date"),
            func.count(Alert.id).label("count"),
            func.sum(func.if_(Alert.acknowledged, 1, 0)).label("acknowledged_count"),
        )
        .where(
            Alert.created_at >= start_datetime,
            Alert.created_at <= end_datetime,
        )
        .group_by(date_trunc)
        .order_by(date_trunc)
    )

    # Add network filter if provided
    if network_id is not None:
        query = query.where(Alert.network_id == network_id)

    # Add alert type filter if provided
    if alert_type is not None:
        query = query.where(Alert.alert_type == alert_type)

    # Execute query
    result = await db.execute(query)
    rows = result.all()

    # Convert to response format
    data_points = [
        AlertTrendDataPoint(
            date=row.period_date,
            count=row.count,
            acknowledged_count=row.acknowledged_count or 0,
        )
        for row in rows
    ]

    return AlertTrendDataResponse(data=data_points)
