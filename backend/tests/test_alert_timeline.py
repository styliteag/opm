"""Tests for alert timeline endpoint with scan-anchored grouping."""

from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.alert_event import AlertEvent, AlertEventType
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.services.alert_events import emit_event


@pytest.fixture
async def tl_scanner(db_session: AsyncSession) -> Scanner:
    """Create a scanner for timeline tests."""
    from app.core.security import hash_password

    scanner = Scanner(
        name="Timeline Test Scanner",
        api_key_hash=hash_password("test-key"),
    )
    db_session.add(scanner)
    await db_session.commit()
    await db_session.refresh(scanner)
    return scanner


@pytest.fixture
async def tl_network(db_session: AsyncSession, tl_scanner: Scanner) -> Network:
    """Create a network for timeline tests."""
    network = Network(
        name="Timeline Test Network",
        cidr="10.0.0.0/24",
        scanner_id=tl_scanner.id,
        port_spec="22,80,443",
    )
    db_session.add(network)
    await db_session.commit()
    await db_session.refresh(network)
    return network


@pytest.fixture
async def tl_scan_with_port(
    db_session: AsyncSession, tl_network: Network, tl_scanner: Scanner
) -> Scan:
    """Create a completed scan that found port 80 on 10.0.0.1."""
    now = datetime.now(timezone.utc)
    scan = Scan(
        network_id=tl_network.id,
        scanner_id=tl_scanner.id,
        status=ScanStatus.COMPLETED,
        trigger_type=TriggerType.MANUAL,
        started_at=now - timedelta(hours=2),
        completed_at=now - timedelta(hours=1),
    )
    db_session.add(scan)
    await db_session.flush()
    await db_session.refresh(scan)

    port = OpenPort(
        scan_id=scan.id,
        ip="10.0.0.1",
        port=80,
        protocol="tcp",
    )
    db_session.add(port)
    await db_session.commit()
    await db_session.refresh(scan)
    return scan


@pytest.fixture
async def tl_scan_without_port(
    db_session: AsyncSession, tl_network: Network, tl_scanner: Scanner
) -> Scan:
    """Create a completed scan that did NOT find port 80 on 10.0.0.1."""
    now = datetime.now(timezone.utc)
    scan = Scan(
        network_id=tl_network.id,
        scanner_id=tl_scanner.id,
        status=ScanStatus.COMPLETED,
        trigger_type=TriggerType.MANUAL,
        started_at=now - timedelta(hours=4),
        completed_at=now - timedelta(hours=3),
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    return scan


@pytest.fixture
async def tl_alert(
    db_session: AsyncSession,
    tl_network: Network,
    tl_scan_with_port: Scan,
) -> Alert:
    """Create an alert for 10.0.0.1:80 on the timeline test network."""
    alert = Alert(
        scan_id=tl_scan_with_port.id,
        network_id=tl_network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip="10.0.0.1",
        port=80,
        message="New port detected: 80/tcp",
        dismissed=False,
        resolution_status=ResolutionStatus.OPEN,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


class TestAlertTimelineEndpoint:
    """Tests for GET /api/alerts/{id}/timeline."""

    @pytest.mark.asyncio
    async def test_returns_200_with_scan_groups(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tl_alert: Alert,
        tl_scan_with_port: Scan,
        tl_scan_without_port: Scan,
    ) -> None:
        """GET /api/alerts/{id}/timeline returns 200 with scan_groups list."""
        # Create an event for the alert
        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert "scan_groups" in data
        assert "alert_id" in data
        assert data["alert_id"] == tl_alert.id
        assert isinstance(data["scan_groups"], list)
        assert len(data["scan_groups"]) == 2

    @pytest.mark.asyncio
    async def test_scan_group_has_required_fields(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tl_alert: Alert,
        tl_scan_with_port: Scan,
    ) -> None:
        """Each scan group has scan_id, started_at, completed_at, status, port_seen, events."""
        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        for group in data["scan_groups"]:
            assert "scan_id" in group
            assert "started_at" in group
            assert "completed_at" in group
            assert "status" in group
            assert "port_seen" in group
            assert "events" in group
            assert isinstance(group["events"], list)

    @pytest.mark.asyncio
    async def test_nonscan_events_in_most_recent_group(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        tl_alert: Alert,
        tl_scan_with_port: Scan,
        tl_scan_without_port: Scan,
    ) -> None:
        """Non-scan events (dismiss, assign) appear in the most recent scan group (per D-02)."""
        # Emit a CREATED event tied to scan_with_port
        await emit_event(
            db_session,
            alert_id=tl_alert.id,
            event_type=AlertEventType.CREATED,
            scan_id=tl_scan_with_port.id,
            description="Alert created",
        )
        # Emit a DISMISSED event with no scan_id (manual action after scan_with_port)
        event = AlertEvent(
            alert_id=tl_alert.id,
            event_type=AlertEventType.DISMISSED,
            description="Dismissed by admin",
            occurred_at=datetime.now(timezone.utc),
        )
        db_session.add(event)
        await db_session.commit()

        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()

        # Most recent scan group (scan_with_port, started later) should have the dismissed event
        most_recent = data["scan_groups"][0]
        assert most_recent["scan_id"] == tl_scan_with_port.id
        event_types = [e["event_type"] for e in most_recent["events"]]
        assert "dismissed" in event_types
        assert "created" in event_types

    @pytest.mark.asyncio
    async def test_port_seen_true_when_port_exists(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tl_alert: Alert,
        tl_scan_with_port: Scan,
        tl_scan_without_port: Scan,
    ) -> None:
        """port_seen is true when the alert's ip:port exists in open_ports for that scan_id."""
        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        data = response.json()

        # Find group for scan_with_port
        port_scan_group = next(
            g for g in data["scan_groups"] if g["scan_id"] == tl_scan_with_port.id
        )
        assert port_scan_group["port_seen"] is True

    @pytest.mark.asyncio
    async def test_port_seen_false_when_port_missing(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tl_alert: Alert,
        tl_scan_with_port: Scan,
        tl_scan_without_port: Scan,
    ) -> None:
        """port_seen is false for scans that did not find the alert's port."""
        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        data = response.json()

        # Find group for scan_without_port
        no_port_group = next(
            g for g in data["scan_groups"] if g["scan_id"] == tl_scan_without_port.id
        )
        assert no_port_group["port_seen"] is False

    @pytest.mark.asyncio
    async def test_returns_404_for_nonexistent_alert(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
    ) -> None:
        """Returns 404 for nonexistent alert_id."""
        response = await client.get(
            "/api/alerts/99999/timeline",
            headers=admin_headers,
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_scan_groups_ordered_by_started_at_desc(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        tl_alert: Alert,
        tl_scan_with_port: Scan,
        tl_scan_without_port: Scan,
    ) -> None:
        """Scan groups are ordered by scan started_at descending (most recent first)."""
        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        data = response.json()
        groups = data["scan_groups"]
        assert len(groups) == 2

        # First group should be the more recent scan (scan_with_port started 2h ago)
        # Second group should be the older scan (scan_without_port started 4h ago)
        assert groups[0]["scan_id"] == tl_scan_with_port.id
        assert groups[1]["scan_id"] == tl_scan_without_port.id

    @pytest.mark.asyncio
    async def test_only_completed_scans_included(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        tl_alert: Alert,
        tl_network: Network,
        tl_scanner: Scanner,
        tl_scan_with_port: Scan,
        tl_scan_without_port: Scan,
    ) -> None:
        """Only COMPLETED scans from the alert's network_id are included (not PLANNED/RUNNING)."""
        # Create a PLANNED scan — should NOT appear in timeline
        planned_scan = Scan(
            network_id=tl_network.id,
            scanner_id=tl_scanner.id,
            status=ScanStatus.PLANNED,
            trigger_type=TriggerType.MANUAL,
        )
        db_session.add(planned_scan)
        # Create a RUNNING scan — should NOT appear
        running_scan = Scan(
            network_id=tl_network.id,
            scanner_id=tl_scanner.id,
            status=ScanStatus.RUNNING,
            trigger_type=TriggerType.MANUAL,
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(running_scan)
        await db_session.commit()

        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
            headers=admin_headers,
        )
        data = response.json()
        # Should only have the 2 COMPLETED scans
        assert len(data["scan_groups"]) == 2
        scan_ids = {g["scan_id"] for g in data["scan_groups"]}
        assert planned_scan.id not in scan_ids
        assert running_scan.id not in scan_ids

    @pytest.mark.asyncio
    async def test_requires_authentication(
        self,
        client: AsyncClient,
        tl_alert: Alert,
    ) -> None:
        """Timeline endpoint requires authentication."""
        response = await client.get(
            f"/api/alerts/{tl_alert.id}/timeline",
        )
        assert response.status_code in (401, 403)
