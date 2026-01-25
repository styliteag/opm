"""Network management router for admin CRUD operations."""

from fastapi import APIRouter, HTTPException, Query, status

from app.core.deps import AdminUser, CurrentUser, DbSession
from app.schemas.network import (
    NetworkCreateRequest,
    NetworkListResponse,
    NetworkResponse,
    NetworkUpdateRequest,
)
from app.schemas.port import ExcludedPortListResponse, ExcludedPortResponse
from app.schemas.port_rule import (
    PortRuleBulkRequest,
    PortRuleCreateRequest,
    PortRuleListResponse,
    PortRuleResponse,
)
from app.schemas.scan import (
    ScanListResponse,
    ScanResponse,
    ScanSummaryResponse,
    ScanTriggerResponse,
)
from app.services import excluded_ports as excluded_ports_service
from app.services import networks as networks_service
from app.services import port_rules as port_rules_service
from app.services import scanners as scanners_service
from app.services import scans as scans_service

router = APIRouter(prefix="/api/networks", tags=["networks"])


@router.get("", response_model=NetworkListResponse)
async def list_networks(
    admin: AdminUser,
    db: DbSession,
) -> NetworkListResponse:
    """Get list of all networks (admin only)."""
    networks = await networks_service.get_all_networks(db)
    return NetworkListResponse(
        networks=[NetworkResponse.model_validate(network) for network in networks]
    )


@router.post("", response_model=NetworkResponse, status_code=status.HTTP_201_CREATED)
async def create_network(
    admin: AdminUser,
    db: DbSession,
    request: NetworkCreateRequest,
) -> NetworkResponse:
    """Create a new network (admin only)."""
    # Validate that the scanner exists
    scanner = await scanners_service.get_scanner_by_id(db, request.scanner_id)
    if scanner is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Scanner not found",
        )

    # Check if name already exists
    existing_network = await networks_service.get_network_by_name(db, request.name)
    if existing_network is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A network with this name already exists",
        )

    network = await networks_service.create_network(
        db=db,
        name=request.name,
        cidr=request.cidr,
        port_spec=request.port_spec,
        scanner_id=request.scanner_id,
        scan_schedule=request.scan_schedule,
        scan_rate=request.scan_rate,
        scan_timeout=request.scan_timeout,
        port_timeout=request.port_timeout,
        scanner_type=request.scanner_type,
        scan_protocol=request.scan_protocol,
        alert_config=request.alert_config,
    )
    await db.commit()

    return NetworkResponse.model_validate(network)


@router.get("/{network_id}", response_model=NetworkResponse)
async def get_network(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
) -> NetworkResponse:
    """Get network details by ID including port rules (admin only)."""
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )
    return NetworkResponse.model_validate(network)


@router.put("/{network_id}", response_model=NetworkResponse)
async def update_network(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
    request: NetworkUpdateRequest,
) -> NetworkResponse:
    """Update network configuration (admin only)."""
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    # If updating name, check it doesn't conflict with another network
    if request.name is not None and request.name != network.name:
        existing_network = await networks_service.get_network_by_name(db, request.name)
        if existing_network is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="A network with this name already exists",
            )

    # If updating scanner_id, validate that the scanner exists
    if request.scanner_id is not None and request.scanner_id != network.scanner_id:
        scanner = await scanners_service.get_scanner_by_id(db, request.scanner_id)
        if scanner is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scanner not found",
            )

    updated_network = await networks_service.update_network(
        db=db,
        network=network,
        name=request.name,
        cidr=request.cidr,
        port_spec=request.port_spec,
        scanner_id=request.scanner_id,
        scan_schedule=request.scan_schedule,
        scan_rate=request.scan_rate,
        scan_timeout=request.scan_timeout,
        port_timeout=request.port_timeout,
        scanner_type=request.scanner_type,
        scan_protocol=request.scan_protocol,
        alert_config=request.alert_config,
    )
    await db.commit()
    return NetworkResponse.model_validate(updated_network)


@router.delete("/{network_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_network(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
) -> None:
    """Delete a network and associated scans/rules (admin only)."""
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    await networks_service.delete_network(db, network)
    await db.commit()


# Port Rules Endpoints


@router.get("/{network_id}/rules", response_model=PortRuleListResponse)
async def list_port_rules(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
) -> PortRuleListResponse:
    """Get list of port rules for a network (admin only)."""
    # Validate network exists
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    rules = await port_rules_service.get_rules_by_network_id(db, network_id)
    return PortRuleListResponse(
        rules=[PortRuleResponse.model_validate(rule) for rule in rules]
    )


@router.post(
    "/{network_id}/rules",
    response_model=PortRuleResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_port_rule(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
    request: PortRuleCreateRequest,
) -> PortRuleResponse:
    """Add a port rule to a network (admin only)."""
    # Validate network exists
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    rule = await port_rules_service.create_rule(
        db=db,
        network_id=network_id,
        port=request.port,
        rule_type=request.rule_type,
        ip=request.ip,
        description=request.description,
    )
    await db.commit()

    return PortRuleResponse.model_validate(rule)


@router.put("/{network_id}/rules", response_model=PortRuleListResponse)
async def bulk_update_port_rules(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
    request: PortRuleBulkRequest,
) -> PortRuleListResponse:
    """Bulk import/update port rules for a network (admin only).

    This replaces all existing rules with the provided array.
    """
    # Validate network exists
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    # Convert request to tuples for service
    rules_data = [
        (rule.port, rule.rule_type, rule.description, rule.ip) for rule in request.rules
    ]

    new_rules = await port_rules_service.bulk_replace_rules(
        db=db,
        network_id=network_id,
        rules=rules_data,
    )
    await db.commit()

    return PortRuleListResponse(
        rules=[PortRuleResponse.model_validate(rule) for rule in new_rules]
    )


@router.delete(
    "/{network_id}/rules/{rule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_port_rule(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
    rule_id: int,
) -> None:
    """Remove a port rule from a network (admin only)."""
    # Validate network exists
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    # Get the rule
    rule = await port_rules_service.get_rule_by_id(db, rule_id)
    if rule is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Port rule not found",
        )

    # Validate rule belongs to the network
    if rule.network_id != network_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Port rule not found",
        )

    await port_rules_service.delete_rule(db, rule)
    await db.commit()


# Excluded Ports Endpoints


@router.get("/{network_id}/excluded", response_model=ExcludedPortListResponse)
async def list_excluded_ports(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
) -> ExcludedPortListResponse:
    """Get list of excluded ports for a network (admin only)."""
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    exclusions = await excluded_ports_service.get_exclusions_by_network_id(db, network_id)
    return ExcludedPortListResponse(
        excluded_ports=[
            ExcludedPortResponse.model_validate(exclusion) for exclusion in exclusions
        ]
    )


@router.delete(
    "/{network_id}/excluded/{exclusion_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_excluded_port(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
    exclusion_id: int,
) -> None:
    """Remove an excluded port entry from a network (admin only)."""
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    exclusion = await excluded_ports_service.get_exclusion_by_id(db, exclusion_id)
    if exclusion is None or exclusion.network_id != network_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Excluded port not found",
        )

    await excluded_ports_service.delete_exclusion(db, exclusion)
    await db.commit()


# Scan Endpoints


@router.post(
    "/{network_id}/scan",
    response_model=ScanTriggerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def trigger_scan(
    admin: AdminUser,
    db: DbSession,
    network_id: int,
) -> ScanTriggerResponse:
    """Trigger a manual scan for a network (admin only).

    Creates a scan record with status 'planned' and trigger_type 'manual'.
    Returns immediately with scan_id and pending status.
    """
    # Validate network exists
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    scan = await scans_service.create_manual_scan(db, network)
    await db.commit()

    return ScanTriggerResponse(
        scan_id=scan.id,
        network_id=network_id,
    )


@router.get("/{network_id}/scans", response_model=ScanListResponse)
async def list_network_scans(
    user: CurrentUser,
    db: DbSession,
    network_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> ScanListResponse:
    """Get scan history for a network.

    Returns list of scans ordered by most recent first.
    """
    # Validate network exists
    network = await networks_service.get_network_by_id(db, network_id)
    if network is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Network not found",
        )

    scans_with_counts = await scans_service.get_scans_by_network_id(
        db, network_id, offset=offset, limit=limit
    )
    return ScanListResponse(
        scans=[
            ScanSummaryResponse(
                **ScanResponse.model_validate(scan).model_dump(),
                port_count=port_count,
            )
            for scan, port_count in scans_with_counts
        ]
    )
