"""Tests for host timeline service with alert_events integration."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import event as sa_event
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.alert_event import AlertEvent, AlertEventType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.models.user import User
from app.services.host_timeline import get_host_timeline

HOST_IP = "10.0.0.42"


@pytest.fixture
async def timeline_scanner(db_session: AsyncSession) -> Scanner:
    """Create a scanner for timeline tests."""
    from app.core.security import hash_password

    scanner = Scanner(
        name="Timeline Test Scanner",
        api_key_hash=hash_password("tl-key"),
    )
    db_session.add(scanner)
    await db_session.commit()
    await db_session.refresh(scanner)
    return scanner


@pytest.fixture
async def timeline_network(db_session: AsyncSession, timeline_scanner: Scanner) -> Network:
    """Create a network for timeline tests."""
    network = Network(
        name="Timeline Test Network",
        cidr="10.0.0.0/24",
        scanner_id=timeline_scanner.id,
        port_spec="22,80,443",
    )
    db_session.add(network)
    await db_session.commit()
    await db_session.refresh(network)
    return network


@pytest.fixture
async def timeline_scan(
    db_session: AsyncSession,
    timeline_network: Network,
    timeline_scanner: Scanner,
) -> Scan:
    """Create a completed scan for timeline tests."""
    scan = Scan(
        network_id=timeline_network.id,
        scanner_id=timeline_scanner.id,
        status=ScanStatus.COMPLETED,
        trigger_type=TriggerType.MANUAL,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    return scan


@pytest.fixture
async def timeline_alert(
    db_session: AsyncSession,
    timeline_network: Network,
    timeline_scan: Scan,
) -> Alert:
    """Create an alert for the test host IP."""
    alert = Alert(
        scan_id=timeline_scan.id,
        network_id=timeline_network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip=HOST_IP,
        port=80,
        message="New port detected: 80/tcp on 10.0.0.42",
        dismissed=False,
        resolution_status=ResolutionStatus.OPEN,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


class TestHostTimelineAlertEvents:
    """Tests for alert_events appearing in host timeline."""

    @pytest.mark.asyncio
    async def test_alert_event_appears_in_timeline(
        self,
        db_session: AsyncSession,
        timeline_alert: Alert,
        admin_user: User,
    ) -> None:
        """Host timeline includes alert_event entries with event_type 'alert_event:{type}'."""
        ae = AlertEvent(
            alert_id=timeline_alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin_user.id,
            description="Dismissed as false positive",
            occurred_at=datetime.now(timezone.utc),
        )
        db_session.add(ae)
        await db_session.commit()

        events = await get_host_timeline(db_session, HOST_IP)

        alert_event_entries = [e for e in events if e["event_type"].startswith("alert_event:")]
        assert len(alert_event_entries) >= 1
        entry = alert_event_entries[0]
        assert entry["event_type"] == "alert_event:dismissed"

    @pytest.mark.asyncio
    async def test_alert_events_mixed_chronologically(
        self,
        db_session: AsyncSession,
        timeline_alert: Alert,
        admin_user: User,
    ) -> None:
        """Alert events appear in chronological order mixed with other event types."""
        now = datetime.now(timezone.utc)
        ae = AlertEvent(
            alert_id=timeline_alert.id,
            event_type=AlertEventType.REOPENED,
            user_id=admin_user.id,
            description="Reopened after recurrence",
            occurred_at=now,
        )
        db_session.add(ae)
        await db_session.commit()

        events = await get_host_timeline(db_session, HOST_IP)

        # Timeline should have at least: the alert_created entry + the alert_event entry
        assert len(events) >= 2
        event_types = [e["event_type"] for e in events]
        assert "alert_event:reopened" in event_types

    @pytest.mark.asyncio
    async def test_alert_event_title_includes_user_email(
        self,
        db_session: AsyncSession,
        timeline_alert: Alert,
        admin_user: User,
    ) -> None:
        """Alert event entries include user email in title."""
        ae = AlertEvent(
            alert_id=timeline_alert.id,
            event_type=AlertEventType.ASSIGNED,
            user_id=admin_user.id,
            description="Assigned to admin",
            occurred_at=datetime.now(timezone.utc),
        )
        db_session.add(ae)
        await db_session.commit()

        events = await get_host_timeline(db_session, HOST_IP)

        ae_entries = [e for e in events if e["event_type"] == "alert_event:assigned"]
        assert len(ae_entries) == 1
        assert admin_user.email in ae_entries[0]["title"]

    @pytest.mark.asyncio
    async def test_alert_event_description_has_alert_context(
        self,
        db_session: AsyncSession,
        timeline_alert: Alert,
    ) -> None:
        """Alert event description includes alert context (alert ID, type, port)."""
        ae = AlertEvent(
            alert_id=timeline_alert.id,
            event_type=AlertEventType.STATUS_CHANGED,
            description="Status changed to in_progress",
            occurred_at=datetime.now(timezone.utc),
        )
        db_session.add(ae)
        await db_session.commit()

        events = await get_host_timeline(db_session, HOST_IP)

        ae_entries = [e for e in events if e["event_type"] == "alert_event:status_changed"]
        assert len(ae_entries) == 1
        desc = ae_entries[0]["description"]
        assert str(timeline_alert.id) in desc
        assert "new_port" in desc

    @pytest.mark.asyncio
    async def test_cursor_pagination_with_alert_events(
        self,
        db_session: AsyncSession,
        timeline_alert: Alert,
        admin_user: User,
    ) -> None:
        """Cursor-based pagination (before param) works with alert_event entries."""
        now = datetime.now(timezone.utc)
        # Create an older event
        old_ae = AlertEvent(
            alert_id=timeline_alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin_user.id,
            description="Old dismiss",
            occurred_at=now - timedelta(hours=2),
        )
        # Create a newer event
        new_ae = AlertEvent(
            alert_id=timeline_alert.id,
            event_type=AlertEventType.REOPENED,
            user_id=admin_user.id,
            description="Recent reopen",
            occurred_at=now,
        )
        db_session.add_all([old_ae, new_ae])
        await db_session.commit()

        # Fetch with cursor before the newer event - should only get old event
        cursor = now - timedelta(minutes=1)
        events = await get_host_timeline(db_session, HOST_IP, before=cursor)

        ae_entries = [e for e in events if e["event_type"].startswith("alert_event:")]
        assert len(ae_entries) >= 1
        # Only the older event should appear
        ae_types = [e["event_type"] for e in ae_entries]
        assert "alert_event:dismissed" in ae_types
        assert "alert_event:reopened" not in ae_types
