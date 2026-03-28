"""Tests for alert recurrence detection and CREATED event emission."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.alert_event import AlertEvent, AlertEventType
from app.models.alert_rule import AlertRule, RuleType
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus, TriggerType
from app.services.alert_generation import generate_alerts_for_scan, generate_global_alerts_for_scan


@pytest.fixture
async def completed_scan(
    db_session: AsyncSession, network_with_scan: tuple[Network, Scan]
) -> tuple[Network, Scan]:
    """Return the network and its completed scan."""
    return network_with_scan


@pytest.fixture
async def second_scan(db_session: AsyncSession, completed_scan: tuple[Network, Scan]) -> Scan:
    """Create a second completed scan for the same network."""
    network, first_scan = completed_scan
    scan = Scan(
        network_id=network.id,
        scanner_id=network.scanner_id,
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
async def resolved_dismissed_alert(
    db_session: AsyncSession, completed_scan: tuple[Network, Scan]
) -> Alert:
    """Create a resolved+dismissed alert for 192.168.1.1:80."""
    network, scan = completed_scan
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip="192.168.1.1",
        port=80,
        message="New open port detected: 192.168.1.1:80",
        dismissed=True,
        dismiss_reason="resolved issue",
        resolution_status=ResolutionStatus.RESOLVED,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


@pytest.fixture
async def resolved_not_dismissed_alert(
    db_session: AsyncSession, completed_scan: tuple[Network, Scan]
) -> Alert:
    """Create a resolved but not dismissed alert for 192.168.1.2:443."""
    network, scan = completed_scan
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip="192.168.1.2",
        port=443,
        message="New open port detected: 192.168.1.2:443",
        dismissed=False,
        resolution_status=ResolutionStatus.RESOLVED,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


class TestRecurrenceDetection:
    """Tests for recurrence detection in alert generation."""

    @pytest.mark.asyncio
    async def test_resolved_dismissed_alert_reopened(
        self,
        db_session: AsyncSession,
        resolved_dismissed_alert: Alert,
        second_scan: Scan,
    ) -> None:
        """Resolved+dismissed alert is reopened when same ip:port reappears."""
        # Add matching open port to second scan
        op = OpenPort(
            scan_id=second_scan.id,
            ip="192.168.1.1",
            port=80,
            protocol="tcp",
        )
        db_session.add(op)
        await db_session.commit()

        count = await generate_alerts_for_scan(db_session, second_scan)

        await db_session.refresh(resolved_dismissed_alert)
        assert resolved_dismissed_alert.dismissed is False
        assert resolved_dismissed_alert.resolution_status == ResolutionStatus.OPEN
        assert resolved_dismissed_alert.dismiss_reason is None

    @pytest.mark.asyncio
    async def test_resolved_not_dismissed_alert_reopened(
        self,
        db_session: AsyncSession,
        resolved_not_dismissed_alert: Alert,
        second_scan: Scan,
    ) -> None:
        """Resolved-only alert (dismissed=False) is reopened when port reappears."""
        op = OpenPort(
            scan_id=second_scan.id,
            ip="192.168.1.2",
            port=443,
            protocol="tcp",
        )
        db_session.add(op)
        await db_session.commit()

        count = await generate_alerts_for_scan(db_session, second_scan)

        await db_session.refresh(resolved_not_dismissed_alert)
        assert resolved_not_dismissed_alert.resolution_status == ResolutionStatus.OPEN

    @pytest.mark.asyncio
    async def test_recurrence_event_created(
        self,
        db_session: AsyncSession,
        resolved_dismissed_alert: Alert,
        second_scan: Scan,
    ) -> None:
        """RECURRENCE event is created with scan_id when alert is reopened."""
        op = OpenPort(
            scan_id=second_scan.id,
            ip="192.168.1.1",
            port=80,
            protocol="tcp",
        )
        db_session.add(op)
        await db_session.commit()

        await generate_alerts_for_scan(db_session, second_scan)

        result = await db_session.execute(
            select(AlertEvent).where(
                AlertEvent.alert_id == resolved_dismissed_alert.id,
                AlertEvent.event_type == AlertEventType.RECURRENCE,
            )
        )
        event = result.scalar_one_or_none()
        assert event is not None
        assert event.scan_id == second_scan.id
        assert "reappeared" in (event.description or "")

    @pytest.mark.asyncio
    async def test_accepted_port_not_reopened(
        self,
        db_session: AsyncSession,
        resolved_dismissed_alert: Alert,
        second_scan: Scan,
    ) -> None:
        """Accepted port (matching global rule) is NOT reopened by recurrence."""
        # Create global accepted rule for this port
        rule = AlertRule(
            network_id=None,
            source="port",
            rule_type=RuleType.ACCEPTED,
            match_criteria={"port": "80", "ip": "192.168.1.1"},
            description="Intentionally open",
        )
        db_session.add(rule)

        op = OpenPort(
            scan_id=second_scan.id,
            ip="192.168.1.1",
            port=80,
            protocol="tcp",
        )
        db_session.add(op)
        await db_session.commit()

        await generate_alerts_for_scan(db_session, second_scan)

        await db_session.refresh(resolved_dismissed_alert)
        # Should still be resolved+dismissed
        assert resolved_dismissed_alert.dismissed is True
        assert resolved_dismissed_alert.resolution_status == ResolutionStatus.RESOLVED

    @pytest.mark.asyncio
    async def test_alert_with_port_none_skipped(
        self,
        db_session: AsyncSession,
        completed_scan: tuple[Network, Scan],
        second_scan: Scan,
    ) -> None:
        """Alert with port=None is skipped by recurrence detection."""
        network, scan = completed_scan
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            source="port",
            ip="192.168.1.1",
            port=None,
            message="Some alert with no port",
            dismissed=True,
            resolution_status=ResolutionStatus.RESOLVED,
        )
        db_session.add(alert)
        op = OpenPort(scan_id=second_scan.id, ip="192.168.1.1", port=80, protocol="tcp")
        db_session.add(op)
        await db_session.commit()

        await generate_alerts_for_scan(db_session, second_scan)

        await db_session.refresh(alert)
        assert alert.dismissed is True
        assert alert.resolution_status == ResolutionStatus.RESOLVED

    @pytest.mark.asyncio
    async def test_different_network_alert_not_reopened(
        self,
        db_session: AsyncSession,
        completed_scan: tuple[Network, Scan],
        second_scan: Scan,
        scanner,
    ) -> None:
        """Alert for a different network is not reopened."""
        network, scan = completed_scan

        # Create a different network
        other_network = Network(
            name="Other Network",
            cidr="10.0.0.0/24",
            scanner_id=scanner.id,
            port_spec="22,80",
        )
        db_session.add(other_network)
        await db_session.flush()

        # Create resolved alert on the OTHER network
        alert = Alert(
            scan_id=scan.id,
            network_id=other_network.id,
            alert_type=AlertType.NEW_PORT,
            source="port",
            ip="192.168.1.1",
            port=80,
            message="Alert on other network",
            dismissed=True,
            resolution_status=ResolutionStatus.RESOLVED,
        )
        db_session.add(alert)

        op = OpenPort(scan_id=second_scan.id, ip="192.168.1.1", port=80, protocol="tcp")
        db_session.add(op)
        await db_session.commit()

        await generate_alerts_for_scan(db_session, second_scan)

        await db_session.refresh(alert)
        assert alert.dismissed is True
        assert alert.resolution_status == ResolutionStatus.RESOLVED


class TestCreatedEventEmission:
    """Tests for CREATED event emission during alert generation."""

    @pytest.mark.asyncio
    async def test_created_event_for_new_alert(
        self,
        db_session: AsyncSession,
        completed_scan: tuple[Network, Scan],
        second_scan: Scan,
    ) -> None:
        """CREATED event is emitted for each new alert in generate_alerts_for_scan."""
        network, _ = completed_scan
        # Enable port alert types so NEW_PORT alerts are generated
        network.alert_config = {"new_port": True, "not_allowed": True, "blocked": True}

        op = OpenPort(scan_id=second_scan.id, ip="192.168.1.5", port=8080, protocol="tcp")
        db_session.add(op)
        await db_session.commit()

        count = await generate_alerts_for_scan(db_session, second_scan)
        assert count >= 1

        # Find the created alert
        result = await db_session.execute(
            select(Alert).where(
                Alert.scan_id == second_scan.id,
                Alert.ip == "192.168.1.5",
                Alert.port == 8080,
            )
        )
        alert = result.scalar_one()

        # Verify CREATED event exists
        event_result = await db_session.execute(
            select(AlertEvent).where(
                AlertEvent.alert_id == alert.id,
                AlertEvent.event_type == AlertEventType.CREATED,
            )
        )
        event = event_result.scalar_one_or_none()
        assert event is not None
        assert event.scan_id == second_scan.id

    @pytest.mark.asyncio
    async def test_created_event_for_global_alert(
        self,
        db_session: AsyncSession,
        completed_scan: tuple[Network, Scan],
        second_scan: Scan,
    ) -> None:
        """CREATED event is emitted for each new alert in generate_global_alerts_for_scan."""
        count = await generate_global_alerts_for_scan(
            db_session,
            second_scan,
            open_ports_data=[("192.168.1.10", 9090, "tcp", None, None, None, None)],
        )
        assert count >= 1

        # Find the created alert
        result = await db_session.execute(
            select(Alert).where(
                Alert.scan_id == second_scan.id,
                Alert.ip == "192.168.1.10",
                Alert.port == 9090,
            )
        )
        alert = result.scalar_one()

        # Verify CREATED event exists
        event_result = await db_session.execute(
            select(AlertEvent).where(
                AlertEvent.alert_id == alert.id,
                AlertEvent.event_type == AlertEventType.CREATED,
            )
        )
        event = event_result.scalar_one_or_none()
        assert event is not None
        assert event.scan_id == second_scan.id

    @pytest.mark.asyncio
    async def test_recurrence_reopen_count_included_in_return(
        self,
        db_session: AsyncSession,
        resolved_dismissed_alert: Alert,
        second_scan: Scan,
    ) -> None:
        """Recurrence reopen count is included in generate_alerts_for_scan return value."""
        op = OpenPort(
            scan_id=second_scan.id,
            ip="192.168.1.1",
            port=80,
            protocol="tcp",
        )
        db_session.add(op)
        await db_session.commit()

        count = await generate_alerts_for_scan(db_session, second_scan)
        # Count should include the reopened alert
        assert count >= 1
