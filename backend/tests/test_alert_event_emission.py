"""Tests for event emission at all alert mutation points."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.alert_event import AlertEvent, AlertEventType
from app.models.alert_rule import AlertRule, RuleType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.user import User


@pytest.fixture
async def test_alert(
    db_session: AsyncSession,
    network_with_scan: tuple[Network, Scan],
) -> Alert:
    """Create a test alert for mutation tests."""
    network, scan = network_with_scan
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip="10.0.0.1",
        port=80,
        message="Test alert for event emission",
        dismissed=False,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


@pytest.fixture
async def dismissed_alert(
    db_session: AsyncSession,
    network_with_scan: tuple[Network, Scan],
) -> Alert:
    """Create a dismissed alert for reopen tests."""
    network, scan = network_with_scan
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.NEW_PORT,
        source="port",
        ip="10.0.0.2",
        port=443,
        message="Dismissed test alert",
        dismissed=True,
        dismiss_reason="test reason",
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


@pytest.fixture
async def ssh_alert(
    db_session: AsyncSession,
    network_with_scan: tuple[Network, Scan],
) -> Alert:
    """Create an SSH alert for auto-dismiss tests."""
    network, scan = network_with_scan
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.SSH_INSECURE_AUTH,
        source="ssh",
        ip="10.0.0.3",
        port=22,
        message="SSH insecure auth on 10.0.0.3:22",
        dismissed=False,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


@pytest.fixture
async def nse_alert(
    db_session: AsyncSession,
    network_with_scan: tuple[Network, Scan],
) -> Alert:
    """Create an NSE alert for auto-dismiss tests."""
    network, scan = network_with_scan
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.NSE_VULNERABILITY,
        source="nse",
        ip="10.0.0.4",
        port=80,
        message="NSE vulnerability found by http-vuln-test on 10.0.0.4:80",
        dismissed=False,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


async def _get_events(
    db: AsyncSession,
    alert_id: int,
    event_type: AlertEventType | None = None,
) -> list[AlertEvent]:
    """Helper to fetch events for an alert."""
    stmt = select(AlertEvent).where(AlertEvent.alert_id == alert_id)
    if event_type is not None:
        stmt = stmt.where(AlertEvent.event_type == event_type)
    result = await db.execute(stmt)
    return list(result.scalars().all())


class TestDismissEventEmission:
    """Tests for DISMISSED event emission."""

    @pytest.mark.asyncio
    async def test_dismiss_alert_emits_event(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """dismiss_alert endpoint emits DISMISSED event with user_id and description."""
        resp = await client.put(
            f"/api/alerts/{test_alert.id}/dismiss",
            headers=admin_headers,
            json={"reason": "handled it"},
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, test_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id
        assert events[0].description == "handled it"

    @pytest.mark.asyncio
    async def test_dismiss_bulk_emits_events(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """dismiss_alerts_bulk endpoint emits DISMISSED event per alert."""
        resp = await client.put(
            "/api/alerts/dismiss-bulk",
            headers=admin_headers,
            json={"alert_ids": [test_alert.id], "reason": "bulk dismiss"},
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, test_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id

    @pytest.mark.asyncio
    async def test_bulk_accept_global_emits_dismissed_events(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """bulk_accept_global endpoint emits DISMISSED event per alert."""
        resp = await client.post(
            "/api/alerts/bulk-accept-global",
            headers=admin_headers,
            json={"alert_ids": [test_alert.id], "reason": "globally accepted"},
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, test_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id

    @pytest.mark.asyncio
    async def test_bulk_accept_network_emits_dismissed_events(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """bulk_accept_network endpoint emits DISMISSED event per alert."""
        resp = await client.post(
            "/api/alerts/bulk-accept-network",
            headers=admin_headers,
            json={"alert_ids": [test_alert.id], "reason": "network accepted"},
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, test_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id


class TestReopenEventEmission:
    """Tests for REOPENED event emission."""

    @pytest.mark.asyncio
    async def test_reopen_alert_emits_event(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        dismissed_alert: Alert,
    ) -> None:
        """reopen_alert endpoint emits REOPENED event with user_id."""
        resp = await client.put(
            f"/api/alerts/{dismissed_alert.id}/reopen",
            headers=admin_headers,
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, dismissed_alert.id, AlertEventType.REOPENED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id



class TestWorkflowEventEmission:
    """Tests for ASSIGNED, STATUS_CHANGED, and SEVERITY_OVERRIDDEN events."""

    @pytest.mark.asyncio
    async def test_assign_alert_emits_event(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """assign_alert endpoint emits ASSIGNED event with metadata."""
        resp = await client.patch(
            f"/api/alerts/{test_alert.id}/assign",
            headers=admin_headers,
            json={"user_id": admin_user.id},
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, test_alert.id, AlertEventType.ASSIGNED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id
        assert events[0].extra is not None
        assert events[0].extra["assigned_to_user_id"] == admin_user.id

    @pytest.mark.asyncio
    async def test_update_severity_emits_event(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """update_alert_severity endpoint emits SEVERITY_OVERRIDDEN event with metadata."""
        resp = await client.patch(
            f"/api/alerts/{test_alert.id}/severity",
            headers=admin_headers,
            json={"severity": "critical"},
        )
        assert resp.status_code == 200

        events = await _get_events(db_session, test_alert.id, AlertEventType.SEVERITY_OVERRIDDEN)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id
        assert events[0].extra is not None
        assert events[0].extra["new_severity"] == "critical"


class TestCommentEventEmission:
    """Tests for COMMENTED event emission."""

    @pytest.mark.asyncio
    async def test_create_comment_emits_event(
        self,
        client,
        db_session: AsyncSession,
        admin_headers: dict[str, str],
        admin_user: User,
        test_alert: Alert,
    ) -> None:
        """create_comment endpoint emits COMMENTED event with user_id."""
        resp = await client.post(
            f"/api/alerts/{test_alert.id}/comments",
            headers=admin_headers,
            json={"comment": "This is a test comment"},
        )
        assert resp.status_code == 201

        events = await _get_events(db_session, test_alert.id, AlertEventType.COMMENTED)
        assert len(events) == 1
        assert events[0].user_id == admin_user.id
        assert events[0].description == "This is a test comment"


class TestAutoDismissEventEmission:
    """Tests for event emission in auto-dismiss service functions."""

    @pytest.mark.asyncio
    async def test_auto_dismiss_accepted_rule_emits_events(
        self,
        db_session: AsyncSession,
        test_alert: Alert,
    ) -> None:
        """auto_dismiss_alerts_for_accepted_rule emits DISMISSED event per alert."""
        from app.services.alert_queries import auto_dismiss_alerts_for_accepted_rule

        count = await auto_dismiss_alerts_for_accepted_rule(
            db_session, ip="10.0.0.1", port_str="80", reason="auto-accepted"
        )
        assert count == 1

        events = await _get_events(db_session, test_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].description == "auto-accepted"

    @pytest.mark.asyncio
    async def test_auto_dismiss_ssh_rule_emits_events(
        self,
        db_session: AsyncSession,
        ssh_alert: Alert,
    ) -> None:
        """auto_dismiss_alerts_for_ssh_rule emits DISMISSED event per alert."""
        from app.services.alert_queries import auto_dismiss_alerts_for_ssh_rule

        count = await auto_dismiss_alerts_for_ssh_rule(
            db_session,
            ip="10.0.0.3",
            port=22,
            alert_type="ssh_insecure_auth",
            reason="ssh-accepted",
        )
        assert count == 1

        events = await _get_events(db_session, ssh_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].description == "ssh-accepted"

    @pytest.mark.asyncio
    async def test_auto_dismiss_nse_rule_emits_events(
        self,
        db_session: AsyncSession,
        nse_alert: Alert,
    ) -> None:
        """auto_dismiss_alerts_for_nse_rule emits DISMISSED event per alert."""
        from app.services.alert_queries import auto_dismiss_alerts_for_nse_rule

        count = await auto_dismiss_alerts_for_nse_rule(
            db_session,
            ip="10.0.0.4",
            port=80,
            alert_type="nse_vulnerability",
            script_name="http-vuln-test",
            reason="nse-accepted",
        )
        assert count == 1

        events = await _get_events(db_session, nse_alert.id, AlertEventType.DISMISSED)
        assert len(events) == 1
        assert events[0].description == "nse-accepted"
