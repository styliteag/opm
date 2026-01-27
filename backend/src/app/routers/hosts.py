"""Hosts API endpoint."""

import csv
from datetime import datetime, timezone
from io import StringIO
from ipaddress import ip_address, ip_network

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.schemas.host import (
    BulkDeleteHostsRequest,
    BulkDeleteHostsResponse,
    HostListResponse,
    HostOpenPortListResponse,
    HostOpenPortResponse,
    HostResponse,
    HostUpdateRequest,
)
from app.services import hosts as hosts_service

router = APIRouter(prefix="/api/hosts", tags=["hosts"])

IPRange = hosts_service.IPRange


def parse_ip_range(value: str) -> IPRange:
    """Parse ip_range value into a normalized range."""
    raw_value = value.strip()
    if not raw_value:
        raise ValueError("ip_range cannot be empty")

    try:
        if "-" in raw_value:
            start_raw, end_raw = [part.strip() for part in raw_value.split("-", 1)]
            if not start_raw or not end_raw:
                raise ValueError("Invalid ip_range format")
            start_ip = ip_address(start_raw)
            end_ip = ip_address(end_raw)
            if start_ip.version != end_ip.version:
                raise ValueError("IP range must use the same IP version")
        else:
            network = ip_network(raw_value, strict=False)
            start_ip = network.network_address
            end_ip = network.broadcast_address

        if int(start_ip) > int(end_ip):
            raise ValueError("IP range start must be before end")
    except ValueError as exc:
        raise ValueError(
            "Invalid ip_range; expected CIDR (e.g., 192.168.1.0/24) "
            "or range (e.g., 192.168.1.10-192.168.1.50)"
        ) from exc

    return (start_ip.version, start_ip, end_ip)


@router.get("", response_model=HostListResponse)
async def list_hosts(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    is_pingable: bool | None = Query(None),
    ip_range: str | None = Query(None),
    ip_search: str | None = Query(None, min_length=1),
    sort_by: str = Query("last_seen_at"),
    sort_dir: str = Query("desc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
) -> HostListResponse:
    """List hosts with filters (network, pingable, IP range/search)."""
    parsed_ip_range = None
    if ip_range:
        try:
            parsed_ip_range = parse_ip_range(ip_range)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    try:
        hosts = await hosts_service.get_hosts(
            db,
            network_id=network_id,
            is_pingable=is_pingable,
            ip_range=parsed_ip_range,
            ip_search=ip_search,
            sort_by=sort_by.lower(),
            sort_dir=sort_dir.lower(),
            offset=offset,
            limit=limit,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    # Get total counts (with same filters but without pagination)
    total_count, pingable_count = await hosts_service.get_host_counts(
        db,
        network_id=network_id,
        ip_range=parsed_ip_range,
        ip_search=ip_search,
    )

    # Build response with open port counts
    host_responses = []
    for host in hosts:
        port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
        response = HostResponse.model_validate(host)
        response.open_port_count = port_count
        host_responses.append(response)

    return HostListResponse(
        hosts=host_responses,
        total_count=total_count,
        pingable_count=pingable_count,
    )


@router.get("/{host_id}", response_model=HostResponse)
async def get_host(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostResponse:
    """Get a specific host by ID."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
    response = HostResponse.model_validate(host)
    response.open_port_count = port_count
    return response


@router.get("/{host_id}/ports", response_model=HostOpenPortListResponse)
async def get_host_ports(
    user: CurrentUser,
    db: DbSession,
    host_id: int,
) -> HostOpenPortListResponse:
    """Get open ports for a specific host."""
    host = await hosts_service.get_host_by_id(db, host_id)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    ports = await hosts_service.get_host_open_ports(db, host_id)
    return HostOpenPortListResponse(
        ports=[HostOpenPortResponse.model_validate(port) for port in ports]
    )


@router.patch("/{host_id}", response_model=HostResponse)
async def update_host(
    admin: AdminUser,
    db: DbSession,
    host_id: int,
    request: HostUpdateRequest,
) -> HostResponse:
    """Update a host's comment (admin only)."""
    host = await hosts_service.update_host_comment(db, host_id, request.user_comment)
    if host is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    await db.commit()
    port_count = await hosts_service.get_open_port_count_for_host(db, host.id)
    response = HostResponse.model_validate(host)
    response.open_port_count = port_count
    return response


@router.delete("/{host_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_host(
    admin: AdminUser,
    db: DbSession,
    host_id: int,
) -> None:
    """Delete a single host (admin only)."""
    deleted = await hosts_service.delete_host(db, host_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Host not found",
        )
    await db.commit()


@router.post("/bulk-delete", response_model=BulkDeleteHostsResponse)
async def bulk_delete_hosts(
    admin: AdminUser,
    db: DbSession,
    request: BulkDeleteHostsRequest,
) -> BulkDeleteHostsResponse:
    """Delete multiple hosts by ID (admin only)."""
    deleted_ids = await hosts_service.delete_hosts_bulk(db, request.host_ids)
    await db.commit()
    return BulkDeleteHostsResponse(
        deleted_ids=deleted_ids,
        deleted_count=len(deleted_ids),
    )


@router.get("/export/csv")
async def export_hosts_csv(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    is_pingable: bool | None = Query(None, alias="status"),
) -> StreamingResponse:
    """Export hosts as CSV."""
    # Fetch all hosts with the given filters (using a large limit to get all)
    hosts = await hosts_service.get_hosts(
        db,
        network_id=network_id,
        is_pingable=is_pingable,
        sort_by="ip",
        sort_dir="asc",
        offset=0,
        limit=10000,
    )

    # Create CSV in memory
    output = StringIO()
    writer = csv.writer(output)

    # Write headers
    writer.writerow([
        "IP",
        "Hostname",
        "Status",
        "OS Guess",
        "First Seen",
        "Last Seen",
        "Open Ports Count",
    ])

    # Write data rows
    for host in hosts:
        # Determine status from is_pingable field
        if host.is_pingable is None:
            status_value = "Unknown"
        elif host.is_pingable:
            status_value = "Up"
        else:
            status_value = "Down"

        # Get open port count for this host
        port_count = await hosts_service.get_open_port_count_for_host(db, host.id)

        writer.writerow([
            host.ip,
            host.hostname or "",
            status_value,
            "",  # OS Guess - not available in current Host model
            host.first_seen_at.isoformat() if host.first_seen_at else "",
            host.last_seen_at.isoformat() if host.last_seen_at else "",
            port_count,
        ])

    # Get CSV content
    csv_content = output.getvalue()
    output.close()

    # Generate filename with timestamp
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"hosts_{timestamp}.csv"

    # Return as streaming response
    return StreamingResponse(
        iter([csv_content]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )
