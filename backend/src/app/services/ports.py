"""Service for querying open ports from latest scans."""

from ipaddress import IPv4Address, IPv6Address
from typing import Any, cast

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import ColumnElement

from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus

IPRange = tuple[int, IPv4Address | IPv6Address, IPv4Address | IPv6Address]


async def get_latest_open_ports(
    db: AsyncSession,
    *,
    network_id: int | None = None,
    port_min: int | None = None,
    port_max: int | None = None,
    ip_range: IPRange | None = None,
    service: str | None = None,
    sort_by: str = "ip",
    sort_dir: str = "asc",
    offset: int = 0,
    limit: int = 50,
) -> list[tuple[OpenPort, int]]:
    """
    Get open ports from the latest terminal scans per network.

    Returns a list of (OpenPort, network_id) tuples.
    """
    latest_scan_subquery = (
        select(Scan.network_id, func.max(Scan.id).label("scan_id"))
        .where(Scan.status.in_([ScanStatus.COMPLETED, ScanStatus.FAILED]))
        .group_by(Scan.network_id)
        .subquery()
    )

    query = (
        select(OpenPort, Scan.network_id)
        .join(Scan, OpenPort.scan_id == Scan.id)
        .join(latest_scan_subquery, Scan.id == latest_scan_subquery.c.scan_id)
    )

    filters = []
    if network_id is not None:
        filters.append(Scan.network_id == network_id)

    if port_min is not None:
        filters.append(OpenPort.port >= port_min)
    if port_max is not None:
        filters.append(OpenPort.port <= port_max)

    if service:
        filters.append(OpenPort.service_guess.ilike(f"%{service}%"))

    if ip_range is not None:
        version, start_ip, end_ip = ip_range
        if version == 4:
            filters.append(func.inet_aton(OpenPort.ip).between(int(start_ip), int(end_ip)))
        else:
            filters.append(
                func.inet6_aton(OpenPort.ip).between(
                    func.inet6_aton(str(start_ip)),
                    func.inet6_aton(str(end_ip)),
                )
            )

    if filters:
        query = query.where(and_(*filters))

    sort_fields = {
        "ip": OpenPort.ip,
        "port": OpenPort.port,
        "first_seen_at": OpenPort.first_seen_at,
        "last_seen_at": OpenPort.last_seen_at,
    }
    sort_column = sort_fields.get(sort_by)
    if sort_column is None:
        raise ValueError("Invalid sort_by value")

    sort_direction = sort_dir.lower()
    sort_expression = cast(ColumnElement[Any], sort_column)
    if sort_direction == "desc":
        sort_expression = sort_expression.desc()
    elif sort_direction == "asc":
        sort_expression = sort_expression.asc()
    else:
        raise ValueError("Invalid sort_dir value")

    query = query.order_by(sort_expression, OpenPort.id.asc()).offset(offset).limit(limit)

    result = await db.execute(query)
    return [(row[0], int(row[1])) for row in result.all()]
