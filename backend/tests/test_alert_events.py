"""Tests for AlertEvent model and emit_event service."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.alert_event import AlertEvent, AlertEventType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.models.user import User
from app.services.alert_events import emit_event, get_events_for_alert


@pytest.fixture
async def test_scanner(db_session: AsyncSession) -> Scanner:
    """Create a scanner for alert event tests."""
    from app.core.security import hash_password

    scanner = Scanner(
        name="Event Test Scanner",
        api_key_hash=hash_password("test-key"),
    )
    db_session.add(scanner)
    await db_session.commit()
    await db_session.refresh(scanner)
    return scanner


@pytest.fixture
async def test_network(db_session: AsyncSession, test_scanner: Scanner) -> Network:
    """Create a network for alert event tests."""
    network = Network(
        name="Event Test Network",
        cidr="10.0.0.0/24",
        scanner_id=test_scanner.id,
        port_spec="22,80,443",
    )
    db_session.add(network)
    await db_session.commit()
    await db_session.refresh(network)
    return network


@pytest.fixture
async def test_scan(db_session: AsyncSession, test_network: Network, test_scanner: Scanner) -> Scan:
    """Create a completed scan for alert event tests."""
    from datetime import datetime, timezone

    scan = Scan(
        network_id=test_network.id,
        scanner_id=test_scanner.id,
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
async def test_alert(db_session: AsyncSession, test_network: Network, test_scan: Scan) -> Alert:
    """Create an alert for event tests."""
    alert = Alert(
        scan_id=test_scan.id,
        network_id=test_network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip="192.168.1.1",
        port=80,
        message="New port detected: 80/tcp",
        dismissed=False,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


class TestAlertEventType:
    """Tests for AlertEventType enum."""

    def test_enum_has_exactly_8_members(self) -> None:
        """AlertEventType enum has exactly 8 members."""
        assert len(AlertEventType) == 8

    def test_enum_values(self) -> None:
        """AlertEventType enum has correct values."""
        assert AlertEventType.CREATED == "created"
        assert AlertEventType.DISMISSED == "dismissed"
        assert AlertEventType.REOPENED == "reopened"
        assert AlertEventType.ASSIGNED == "assigned"
        assert AlertEventType.STATUS_CHANGED == "status_changed"
        assert AlertEventType.COMMENTED == "commented"
        assert AlertEventType.SEVERITY_OVERRIDDEN == "severity_overridden"
        assert AlertEventType.RECURRENCE == "recurrence"


class TestAlertEventModel:
    """Tests for AlertEvent ORM model."""

    @pytest.mark.asyncio
    async def test_create_with_required_fields(
        self, db_session: AsyncSession, test_alert: Alert
    ) -> None:
        """AlertEvent can be created with required fields only."""
        event = AlertEvent(
            alert_id=test_alert.id,
            event_type=AlertEventType.CREATED,
        )
        db_session.add(event)
        await db_session.flush()
        await db_session.refresh(event)

        assert event.id is not None
        assert event.alert_id == test_alert.id
        assert event.event_type == AlertEventType.CREATED
        assert event.user_id is None
        assert event.scan_id is None
        assert event.description is None
        assert event.extra is None
        assert event.occurred_at is not None

    @pytest.mark.asyncio
    async def test_create_with_all_fields(
        self, db_session: AsyncSession, test_alert: Alert, admin_user: User, test_scan: Scan
    ) -> None:
        """AlertEvent can be created with all fields populated."""
        event = AlertEvent(
            alert_id=test_alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin_user.id,
            scan_id=test_scan.id,
            description="Alert dismissed by admin",
            extra={"reason": "false positive"},
        )
        db_session.add(event)
        await db_session.flush()
        await db_session.refresh(event)

        assert event.alert_id == test_alert.id
        assert event.event_type == AlertEventType.DISMISSED
        assert event.user_id == admin_user.id
        assert event.scan_id == test_scan.id
        assert event.description == "Alert dismissed by admin"
        assert event.extra == {"reason": "false positive"}


class TestEmitEvent:
    """Tests for emit_event() service function."""

    @pytest.mark.asyncio
    async def test_emit_event_creates_row(
        self, db_session: AsyncSession, test_alert: Alert
    ) -> None:
        """emit_event() creates an AlertEvent row with correct fields and flushes."""
        event = await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.CREATED,
            description="Alert created",
        )

        assert event.id is not None
        assert event.alert_id == test_alert.id
        assert event.event_type == AlertEventType.CREATED
        assert event.description == "Alert created"

    @pytest.mark.asyncio
    async def test_emit_event_with_user_id(
        self, db_session: AsyncSession, test_alert: Alert, admin_user: User
    ) -> None:
        """emit_event() with user_id populates user_id on the event."""
        event = await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.DISMISSED,
            user_id=admin_user.id,
        )

        assert event.user_id == admin_user.id

    @pytest.mark.asyncio
    async def test_emit_event_with_scan_id(
        self, db_session: AsyncSession, test_alert: Alert, test_scan: Scan
    ) -> None:
        """emit_event() with scan_id populates scan_id on the event."""
        event = await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.RECURRENCE,
            scan_id=test_scan.id,
        )

        assert event.scan_id == test_scan.id

    @pytest.mark.asyncio
    async def test_emit_event_with_metadata(
        self, db_session: AsyncSession, test_alert: Alert
    ) -> None:
        """emit_event() with metadata populates extra JSON column."""
        metadata = {"old_status": "open", "new_status": "in_progress"}
        event = await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.STATUS_CHANGED,
            metadata=metadata,
        )

        assert event.extra == metadata

    @pytest.mark.asyncio
    async def test_emit_event_without_optional_fields(
        self, db_session: AsyncSession, test_alert: Alert
    ) -> None:
        """emit_event() without optional fields leaves them as None."""
        event = await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.REOPENED,
        )

        assert event.user_id is None
        assert event.scan_id is None
        assert event.description is None
        assert event.extra is None


class TestGetEventsForAlert:
    """Tests for get_events_for_alert() service function."""

    @pytest.mark.asyncio
    async def test_returns_events_ordered_by_occurred_at(
        self, db_session: AsyncSession, test_alert: Alert, admin_user: User
    ) -> None:
        """get_events_for_alert() returns events ordered by occurred_at ascending."""
        await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.CREATED,
            description="First event",
        )
        await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.ASSIGNED,
            user_id=admin_user.id,
            description="Second event",
        )
        await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.STATUS_CHANGED,
            description="Third event",
        )
        await db_session.commit()

        events = await get_events_for_alert(db_session, test_alert.id)

        assert len(events) == 3
        assert events[0].event_type == AlertEventType.CREATED
        assert events[1].event_type == AlertEventType.ASSIGNED
        assert events[2].event_type == AlertEventType.STATUS_CHANGED

    @pytest.mark.asyncio
    async def test_returns_empty_list_for_no_events(
        self, db_session: AsyncSession, test_alert: Alert
    ) -> None:
        """get_events_for_alert() returns empty list when no events exist."""
        events = await get_events_for_alert(db_session, test_alert.id)
        assert events == []


class TestAlertEventsRelationship:
    """Tests for Alert.events relationship."""

    @pytest.mark.asyncio
    async def test_alert_events_relationship(
        self, db_session: AsyncSession, test_alert: Alert
    ) -> None:
        """Alert.events relationship returns related AlertEvent objects."""
        await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.CREATED,
        )
        await emit_event(
            db_session,
            alert_id=test_alert.id,
            event_type=AlertEventType.DISMISSED,
        )
        await db_session.commit()

        # Refresh to load relationship
        await db_session.refresh(test_alert, ["events"])

        assert len(test_alert.events) == 2
        event_types = {e.event_type for e in test_alert.events}
        assert AlertEventType.CREATED in event_types
        assert AlertEventType.DISMISSED in event_types
