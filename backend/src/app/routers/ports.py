"""Open ports query endpoint."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import CurrentUser, DbSession, OperatorUser
from app.lib.ip_utils import parse_ip_range
from app.models.alert_rule import RuleType
from app.schemas.port import (
    OpenPortListItem,
    OpenPortListResponse,
    PortAcceptRequest,
)
from app.schemas.port_rule import PortRuleResponse
from app.services import alert_rules as alert_rules_service
from app.services import global_open_ports as global_ports_service
from app.services import networks as networks_service
from app.services import ports as ports_service

router = APIRouter(prefix="/api/ports", tags=["ports"])


@router.get("", response_model=OpenPortListResponse)
async def list_open_ports(
    user: CurrentUser,
    db: DbSession,
    network_id: int | None = Query(None, ge=1),
    port_min: int | None = Query(None, ge=1, le=65535),
    port_max: int | None = Query(None, ge=1, le=65535),
    ip_range: str | None = Query(None),
    service: str | None = Query(None, min_length=1),
    staleness: str = Query("all", pattern="^(all|active|stale)$"),
    sort_by: str = Query("ip"),
    sort_dir: str = Query("asc"),
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=10000),
) -> OpenPortListResponse:
    """List open ports from the latest scans across networks."""
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
        ports = await ports_service.get_latest_open_ports(
            db,
            network_id=network_id,
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

    latest_scan_times = await global_ports_service.get_latest_scan_times_by_network(db)

    result_ports: list[OpenPortListItem] = []
    for port, network_id_value in ports:
        is_stale = global_ports_service.compute_port_staleness(
            port.last_seen_at,
            [network_id_value],
            latest_scan_times,
        )
        if staleness == "active" and is_stale:
            continue
        if staleness == "stale" and not is_stale:
            continue
        result_ports.append(
            OpenPortListItem(
                ip=port.ip,
                port=port.port,
                protocol=port.protocol,
                ttl=port.ttl,
                banner=port.banner,
                service_guess=port.service_guess,
                mac_address=port.mac_address,
                mac_vendor=port.mac_vendor,
                first_seen_at=port.first_seen_at,
                last_seen_at=port.last_seen_at,
                network_id=network_id_value,
                is_stale=is_stale,
            )
        )

    return OpenPortListResponse(ports=result_ports)


@router.post(
    "/accept",
    response_model=PortRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def accept_port(
    admin: OperatorUser,
    db: DbSession,
    request: PortAcceptRequest,
) -> PortRuleResponse:
    """Accept a port for a network (admin only)."""
    network = await networks_service.get_network_by_id(db, request.network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    criteria: dict[str, str | None] = {"port": request.port}
    if request.ip:
        criteria["ip"] = request.ip

    rule = await alert_rules_service.create_rule(
        db=db,
        source="port",
        rule_type=RuleType.ACCEPTED,
        match_criteria=criteria,
        network_id=request.network_id,
        description=request.description,
    )
    await db.commit()

    return PortRuleResponse(
        id=rule.id,
        network_id=rule.network_id,
        ip=rule.match_criteria.get("ip"),
        port=rule.match_criteria.get("port", ""),
        rule_type=rule.rule_type,
        description=rule.description,
    )
