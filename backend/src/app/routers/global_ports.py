"""Global open ports query endpoint."""

from ipaddress import ip_address, ip_network

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession
from app.schemas.global_port import GlobalOpenPortListResponse, GlobalOpenPortResponse
from app.services import global_open_ports as global_ports_service

router = APIRouter(prefix="/api/global-ports", tags=["global-ports"])

IPRange = global_ports_service.IPRange


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


@router.get("", response_model=GlobalOpenPortListResponse)
async def list_global_open_ports(
    user: CurrentUser,
    db: DbSession,
    port_min: int | None = Query(None, ge=1, le=65535),
    port_max: int | None = Query(None, ge=1, le=65535),
    ip_range: str | None = Query(None),
    service: str | None = Query(None, min_length=1),
    sort_by: str = Query("last_seen_at"),
    sort_dir: str = Query("desc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
) -> GlobalOpenPortListResponse:
    """List global open ports (deduplicated across all scans)."""
    if port_min is not None and port_max is not None and port_min > port_max:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="port_min cannot be greater than port_max",
        )

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
        ports = await global_ports_service.get_global_open_ports(
            db,
            port_min=port_min,
            port_max=port_max,
            ip_range=parsed_ip_range,
            service=service,
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

    return GlobalOpenPortListResponse(
        ports=[GlobalOpenPortResponse.model_validate(port) for port in ports]
    )


@router.get("/{port_id}", response_model=GlobalOpenPortResponse)
async def get_global_open_port(
    user: CurrentUser,
    db: DbSession,
    port_id: int,
) -> GlobalOpenPortResponse:
    """Get a specific global open port by ID."""
    port = await global_ports_service.get_global_open_port_by_id(db, port_id)
    if port is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Global open port not found",
        )
    return GlobalOpenPortResponse.model_validate(port)
