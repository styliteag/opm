"""Tests for alert service and router."""


from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.network import Network
from app.models.scan import Scan
from app.models.user import User
from app.services.alerts import (
    dismiss_alert,
    dismiss_alerts,
    get_dismiss_reason_suggestions,
    get_alert_with_network_name,
    get_alerts,
    get_alerts_by_ids,
    reopen_alert,
)


class TestAlertService:
    """Tests for alert service functions."""

    async def _create_test_alert(
        self,
        db_session: AsyncSession,
        network: Network,
        scan: Scan,
        alert_type: AlertType = AlertType.NEW_PORT,
        ip: str = "192.168.1.1",
        port: int = 22,
        dismissed: bool = False,
    ) -> Alert:
        """Helper to create a test alert."""
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=alert_type,
            ip=ip,
            port=port,
            message=f"Test alert: {ip}:{port}",
            dismissed=dismissed,
        )
        db_session.add(alert)
        await db_session.commit()
        await db_session.refresh(alert)
        return alert

    async def test_get_alert_with_network_name(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alert with network name should return alert and network name."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(db_session, network, scan)

        result = await get_alert_with_network_name(db_session, alert.id)

        assert result is not None
        returned_alert, network_name = result
        assert returned_alert.id == alert.id
        assert network_name == network.name

    async def test_get_alert_with_network_name_not_found(
        self, db_session: AsyncSession
    ):
        """Get alert with network name should return None when not found."""
        result = await get_alert_with_network_name(db_session, 99999)
        assert result is None

    async def test_get_alerts_by_ids(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts by IDs should return matching alerts."""
        network, scan = network_with_scan
        alert1 = await self._create_test_alert(
            db_session, network, scan, ip="10.0.0.1", port=80
        )
        alert2 = await self._create_test_alert(
            db_session, network, scan, ip="10.0.0.2", port=443
        )

        result = await get_alerts_by_ids(db_session, [alert1.id, alert2.id])

        assert len(result) == 2
        ids = [a.id for a in result]
        assert alert1.id in ids
        assert alert2.id in ids

    async def test_get_alerts_by_ids_empty_list(self, db_session: AsyncSession):
        """Get alerts by IDs with empty list should return empty list."""
        result = await get_alerts_by_ids(db_session, [])
        assert result == []

    async def test_get_alerts_no_filters(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts without filters should return all alerts."""
        network, scan = network_with_scan
        await self._create_test_alert(db_session, network, scan, port=22)
        await self._create_test_alert(db_session, network, scan, port=80)

        result = await get_alerts(db_session)

        assert len(result) >= 2

    async def test_get_alerts_filter_by_type(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts should filter by alert type."""
        network, scan = network_with_scan
        await self._create_test_alert(
            db_session, network, scan, alert_type=AlertType.NEW_PORT
        )
        await self._create_test_alert(
            db_session, network, scan, alert_type=AlertType.BLOCKED, port=81
        )

        result = await get_alerts(db_session, alert_type=AlertType.BLOCKED)

        assert len(result) == 1
        assert result[0][0].alert_type == AlertType.BLOCKED

    async def test_get_alerts_filter_by_network(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts should filter by network ID."""
        network, scan = network_with_scan
        await self._create_test_alert(db_session, network, scan)

        result = await get_alerts(db_session, network_id=network.id)

        assert len(result) >= 1
        for alert, _ in result:
            assert alert.network_id == network.id

    async def test_get_alerts_filter_by_dismissed(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts should filter by dismissed status."""
        network, scan = network_with_scan
        await self._create_test_alert(
            db_session, network, scan, port=22, dismissed=False
        )
        await self._create_test_alert(
            db_session, network, scan, port=80, dismissed=True
        )

        open_result = await get_alerts(db_session, dismissed=False)
        dismissed_result = await get_alerts(db_session, dismissed=True)

        open_ids = [a[0].id for a in open_result]
        dismissed_ids = [a[0].id for a in dismissed_result]

        # Verify no overlap
        assert not set(open_ids).intersection(set(dismissed_ids))

    async def test_get_alerts_with_pagination(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts should respect pagination."""
        network, scan = network_with_scan
        for i in range(5):
            await self._create_test_alert(db_session, network, scan, port=100 + i)

        result = await get_alerts(db_session, offset=0, limit=2)

        assert len(result) == 2

    async def test_dismiss_alert(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Dismiss alert should set dismissed to True."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(
            db_session, network, scan, dismissed=False
        )
        assert alert.dismissed is False

        updated = await dismiss_alert(db_session, alert)

        assert updated.dismissed is True

    async def test_dismiss_alerts_multiple(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Dismiss alerts should update multiple alerts."""
        network, scan = network_with_scan
        alert1 = await self._create_test_alert(
            db_session, network, scan, port=22, dismissed=False
        )
        alert2 = await self._create_test_alert(
            db_session, network, scan, port=80, dismissed=False
        )

        updated = await dismiss_alerts(db_session, [alert1, alert2])

        assert len(updated) == 2
        for alert in updated:
            assert alert.dismissed is True

    async def test_dismiss_alerts_empty_list(self, db_session: AsyncSession):
        """Dismiss alerts with empty list should return empty list."""
        result = await dismiss_alerts(db_session, [])
        assert result == []

    async def test_reopen_alert(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Reopen alert should set dismissed to False."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(
            db_session, network, scan, dismissed=True
        )
        assert alert.dismissed is True

        updated = await reopen_alert(db_session, alert)

        assert updated.dismissed is False


class TestAlertRouter:
    """Tests for alert router endpoints."""

    async def _create_test_alert(
        self,
        db_session: AsyncSession,
        network: Network,
        scan: Scan,
        dismissed: bool = False,
    ) -> Alert:
        """Helper to create a test alert."""
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            ip="192.168.1.1",
            port=22,
            message="Test alert",
            dismissed=dismissed,
        )
        db_session.add(alert)
        await db_session.commit()
        await db_session.refresh(alert)
        return alert

    async def test_list_alerts(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """List alerts should return alerts."""
        network, scan = network_with_scan
        await self._create_test_alert(db_session, network, scan)

        response = await client.get("/api/alerts", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "alerts" in data

    async def test_list_alerts_filter_dismissed(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """List alerts should filter by dismissed parameter."""
        network, scan = network_with_scan
        await self._create_test_alert(db_session, network, scan, dismissed=False)

        response = await client.get(
            "/api/alerts?dismissed=false", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        for alert in data["alerts"]:
            assert alert["dismissed"] is False

    async def test_dismiss_alert(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """Dismiss alert should mark alert as dismissed."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(db_session, network, scan)

        response = await client.put(
            f"/api/alerts/{alert.id}/dismiss", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["dismissed"] is True

    async def test_dismiss_alert_not_found(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Dismiss alert should return 404 for non-existent alert."""
        response = await client.put("/api/alerts/99999/dismiss", headers=admin_headers)

        assert response.status_code == 404

    async def test_reopen_alert(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """Reopen alert should set dismissed to False."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(db_session, network, scan, dismissed=True)

        response = await client.put(
            f"/api/alerts/{alert.id}/reopen", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["dismissed"] is False

    async def test_bulk_dismiss_alerts(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """Bulk dismiss should mark multiple alerts as dismissed."""
        network, scan = network_with_scan
        alert1 = await self._create_test_alert(db_session, network, scan)
        # Create second alert with different port to avoid constraint issues
        alert2 = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            ip="192.168.1.2",
            port=80,
            message="Test alert 2",
        )
        db_session.add(alert2)
        await db_session.commit()
        await db_session.refresh(alert2)

        response = await client.post(
            "/api/alerts/bulk-dismiss",
            headers=admin_headers,
            json={"alert_ids": [alert1.id, alert2.id]},
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["dismissed_ids"]) == 2

    async def test_viewer_can_list_alerts(
        self,
        client: AsyncClient,
        viewer_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        viewer_headers: dict,
    ):
        """Viewer should be able to list alerts."""
        network, scan = network_with_scan
        await self._create_test_alert(db_session, network, scan)

        response = await client.get("/api/alerts", headers=viewer_headers)
        assert response.status_code == 200


class TestDismissReasonSuggestionsService:
    """Tests for dismiss reason suggestions service function."""

    async def _create_dismissed_alert(
        self,
        db_session: AsyncSession,
        network: Network,
        scan: Scan,
        ip: str = "10.0.0.1",
        port: int = 80,
        dismiss_reason: str = "Known web server",
    ) -> Alert:
        """Helper to create a dismissed alert with a reason."""
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            ip=ip,
            port=port,
            message=f"Test alert: {ip}:{port}",
            dismissed=True,
            dismiss_reason=dismiss_reason,
        )
        db_session.add(alert)
        await db_session.commit()
        await db_session.refresh(alert)
        return alert

    async def test_empty_database_returns_empty(self, db_session: AsyncSession):
        """Empty database should return no suggestions."""
        result = await get_dismiss_reason_suggestions(db_session)
        assert result == []

    async def test_open_alerts_excluded(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Open (non-dismissed) alerts should not appear in suggestions."""
        network, scan = network_with_scan
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            ip="10.0.0.1",
            port=80,
            message="Test",
            dismissed=False,
            dismiss_reason="Should not appear",
        )
        db_session.add(alert)
        await db_session.commit()

        result = await get_dismiss_reason_suggestions(db_session)
        assert result == []

    async def test_null_and_empty_reasons_excluded(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Null and empty dismiss_reason values should be excluded."""
        network, scan = network_with_scan
        for reason in [None, ""]:
            alert = Alert(
                scan_id=scan.id,
                network_id=network.id,
                alert_type=AlertType.NEW_PORT,
                ip="10.0.0.1",
                port=80,
                message="Test",
                dismissed=True,
                dismiss_reason=reason,
            )
            db_session.add(alert)
        await db_session.commit()

        result = await get_dismiss_reason_suggestions(db_session)
        assert result == []

    async def test_frequency_ranking(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Reasons used more frequently should rank higher."""
        network, scan = network_with_scan
        # "Known web server" used 3 times
        for i in range(3):
            await self._create_dismissed_alert(
                db_session, network, scan,
                ip=f"10.0.0.{i+1}", port=80,
                dismiss_reason="Known web server",
            )
        # "SSH jump host" used 1 time
        await self._create_dismissed_alert(
            db_session, network, scan,
            ip="10.0.0.10", port=22,
            dismiss_reason="SSH jump host",
        )

        result = await get_dismiss_reason_suggestions(db_session)

        assert len(result) == 2
        assert result[0]["reason"] == "Known web server"
        assert result[0]["frequency"] == 3
        assert result[1]["reason"] == "SSH jump host"
        assert result[1]["frequency"] == 1

    async def test_port_affinity_ranking(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Same-port reasons should rank first when port is specified."""
        network, scan = network_with_scan
        # "SSH jump host" used once on port 22
        await self._create_dismissed_alert(
            db_session, network, scan,
            ip="10.0.0.1", port=22,
            dismiss_reason="SSH jump host",
        )
        # "Known web server" used 5 times on port 80
        for i in range(5):
            await self._create_dismissed_alert(
                db_session, network, scan,
                ip=f"10.0.0.{i+10}", port=80,
                dismiss_reason="Known web server",
            )

        # Without port filter: frequency wins
        result_no_port = await get_dismiss_reason_suggestions(db_session)
        assert result_no_port[0]["reason"] == "Known web server"

        # With port=22 filter: port affinity wins
        result_port_22 = await get_dismiss_reason_suggestions(db_session, port=22)
        assert result_port_22[0]["reason"] == "SSH jump host"
        assert result_port_22[0]["same_port"] is True

    async def test_search_filter(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Search parameter should filter by substring."""
        network, scan = network_with_scan
        await self._create_dismissed_alert(
            db_session, network, scan,
            dismiss_reason="Known web server",
        )
        await self._create_dismissed_alert(
            db_session, network, scan,
            ip="10.0.0.2", port=22,
            dismiss_reason="SSH jump host",
        )

        result = await get_dismiss_reason_suggestions(db_session, search="web")

        assert len(result) == 1
        assert result[0]["reason"] == "Known web server"

    async def test_limit_respected(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Limit parameter should cap the number of results."""
        network, scan = network_with_scan
        for i in range(5):
            await self._create_dismissed_alert(
                db_session, network, scan,
                ip=f"10.0.0.{i+1}", port=80 + i,
                dismiss_reason=f"Reason {i}",
            )

        result = await get_dismiss_reason_suggestions(db_session, limit=2)

        assert len(result) == 2


class TestDismissReasonSuggestionsRouter:
    """Tests for dismiss reason suggestions endpoint."""

    async def _create_dismissed_alert(
        self,
        db_session: AsyncSession,
        network: Network,
        scan: Scan,
        ip: str = "10.0.0.1",
        port: int = 80,
        dismiss_reason: str = "Known web server",
    ) -> Alert:
        """Helper to create a dismissed alert with a reason."""
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            ip=ip,
            port=port,
            message=f"Test alert: {ip}:{port}",
            dismissed=True,
            dismiss_reason=dismiss_reason,
        )
        db_session.add(alert)
        await db_session.commit()
        await db_session.refresh(alert)
        return alert

    async def test_requires_auth(self, client: AsyncClient):
        """Endpoint should return 401 without authentication."""
        response = await client.get("/api/alerts/dismiss-suggestions")
        assert response.status_code == 401

    async def test_returns_suggestions(
        self,
        client: AsyncClient,
        viewer_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        viewer_headers: dict,
    ):
        """Endpoint should return suggestions for authenticated users."""
        network, scan = network_with_scan
        await self._create_dismissed_alert(db_session, network, scan)

        response = await client.get(
            "/api/alerts/dismiss-suggestions", headers=viewer_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert "suggestions" in data
        assert len(data["suggestions"]) == 1
        assert data["suggestions"][0]["reason"] == "Known web server"
        assert data["suggestions"][0]["frequency"] == 1

    async def test_port_filter(
        self,
        client: AsyncClient,
        viewer_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        viewer_headers: dict,
    ):
        """Endpoint should accept port filter and mark same_port."""
        network, scan = network_with_scan
        await self._create_dismissed_alert(
            db_session, network, scan, port=443, dismiss_reason="HTTPS expected"
        )

        response = await client.get(
            "/api/alerts/dismiss-suggestions?port=443", headers=viewer_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["suggestions"][0]["same_port"] is True

    async def test_search_filter(
        self,
        client: AsyncClient,
        viewer_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        viewer_headers: dict,
    ):
        """Endpoint should accept search filter."""
        network, scan = network_with_scan
        await self._create_dismissed_alert(
            db_session, network, scan, dismiss_reason="Known web server"
        )
        await self._create_dismissed_alert(
            db_session, network, scan,
            ip="10.0.0.2", port=22, dismiss_reason="SSH jump host"
        )

        response = await client.get(
            "/api/alerts/dismiss-suggestions?search=SSH", headers=viewer_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["suggestions"]) == 1
        assert data["suggestions"][0]["reason"] == "SSH jump host"

    async def test_empty_when_no_dismissed_alerts(
        self,
        client: AsyncClient,
        viewer_user: User,
        viewer_headers: dict,
    ):
        """Endpoint should return empty suggestions when no dismissed alerts exist."""
        response = await client.get(
            "/api/alerts/dismiss-suggestions", headers=viewer_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["suggestions"] == []
