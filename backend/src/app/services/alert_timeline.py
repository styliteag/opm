"""Service for building alert timeline with scan-anchored grouping."""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.alert_event import AlertEvent
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus
from app.schemas.alert_timeline import ScanGroup, TimelineEvent


async def get_alert_timeline(
    db: AsyncSession,
    *,
    alert_id: int,
    ip: str,
    port: int | None,
    network_id: int | None,
) -> list[ScanGroup]:
    """Build scan-anchored timeline groups for an alert.

    Step A: Query COMPLETED/CANCELLED scans for the network.
    Step B: Determine port_seen per scan via OpenPort lookup.
    Step C: Query all AlertEvents for the alert.
    Step D: Group events into scan groups (D-01/D-02 rules).
    Step E: Return ordered by started_at DESC.
    """
    # Step A: Get completed/cancelled scans for the network
    if network_id is None:
        return []

    result = await db.execute(
        select(Scan)
        .where(
            Scan.network_id == network_id,
            Scan.status.in_([ScanStatus.COMPLETED, ScanStatus.CANCELLED]),
        )
        .order_by(Scan.started_at.desc())
    )
    scans = list(result.scalars().all())

    if not scans:
        return []

    scan_ids = [s.id for s in scans]

    # Step B: Determine port_seen for each scan
    port_seen_set: set[int] = set()
    if port is not None:
        port_result = await db.execute(
            select(OpenPort.scan_id).where(
                OpenPort.ip == ip,
                OpenPort.port == port,
                OpenPort.scan_id.in_(scan_ids),
            )
        )
        port_seen_set = {row[0] for row in port_result.all()}

    # Step C: Query all events for the alert with user eagerly loaded
    events_result = await db.execute(
        select(AlertEvent)
        .where(AlertEvent.alert_id == alert_id)
        .options(selectinload(AlertEvent.user))
        .order_by(AlertEvent.occurred_at.asc(), AlertEvent.id.asc())
    )
    events = list(events_result.scalars().all())

    # Step D: Group events into scan groups
    scan_id_set = set(scan_ids)
    groups_events: dict[int | None, list[TimelineEvent]] = {sid: [] for sid in scan_ids}

    for event in events:
        te = TimelineEvent(
            id=event.id,
            event_type=event.event_type.value,
            user_id=event.user_id,
            user_email=event.user.email if event.user else None,
            scan_id=event.scan_id,
            description=event.description,
            extra=event.extra,
            occurred_at=event.occurred_at,
        )

        if event.scan_id is not None and event.scan_id in scan_id_set:
            # Event tied to a known scan
            groups_events[event.scan_id].append(te)
        else:
            # Non-scan event: attach to most recent scan whose started_at <= event.occurred_at
            target_scan_id = _find_most_recent_scan(scans, event.occurred_at)
            if target_scan_id is not None:
                groups_events[target_scan_id].append(te)
            else:
                # No scan before this event — create unanchored group
                if None not in groups_events:
                    groups_events[None] = []
                groups_events[None].append(te)

    # Step E: Build ScanGroup objects ordered by started_at DESC
    result_groups: list[ScanGroup] = []
    for scan in scans:
        scan_events = groups_events.get(scan.id, [])
        result_groups.append(
            ScanGroup(
                scan_id=scan.id,
                started_at=scan.started_at,
                completed_at=scan.completed_at,
                status=scan.status.value,
                port_seen=(
                    scan.id in port_seen_set if scan.status != ScanStatus.CANCELLED else False
                ),
                events=scan_events,
            )
        )

    # Add unanchored group (if any) at the end
    if None in groups_events and groups_events[None]:
        result_groups.append(
            ScanGroup(
                scan_id=None,
                started_at=None,
                completed_at=None,
                status=None,
                port_seen=False,
                events=groups_events[None],
            )
        )

    return result_groups


def _find_most_recent_scan(
    scans: list[Scan],
    event_time: datetime | None,
) -> int | None:
    """Find the most recent scan whose started_at <= event_time.

    Scans are already ordered by started_at DESC.
    """
    if event_time is None:
        # If no timestamp, use the most recent scan
        return scans[0].id if scans else None

    for scan in scans:
        if scan.started_at is not None and _normalize_naive(scan.started_at) <= _normalize_naive(
            event_time
        ):
            return scan.id

    # No scan started before this event — return None (unanchored)
    return None


def _normalize_naive(dt: datetime) -> datetime:
    """Strip timezone info for comparison (SQLite stores naive datetimes)."""
    if dt.tzinfo is not None:
        return dt.replace(tzinfo=None)
    return dt
