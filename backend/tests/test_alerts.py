"""Tests for alert service and router."""


from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.network import Network
from app.models.scan import Scan
from app.models.user import User
from app.services.alerts import (
    acknowledge_alert,
    acknowledge_alerts,
    get_alert_with_network_name,
    get_alerts,
    get_alerts_by_ids,
    unacknowledge_alert,
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
        acknowledged: bool = False,
    ) -> Alert:
        """Helper to create a test alert."""
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=alert_type,
            ip=ip,
            port=port,
            message=f"Test alert: {ip}:{port}",
            acknowledged=acknowledged,
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

    async def test_get_alerts_filter_by_acknowledged(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts should filter by acknowledged status."""
        network, scan = network_with_scan
        await self._create_test_alert(
            db_session, network, scan, port=22, acknowledged=False
        )
        await self._create_test_alert(
            db_session, network, scan, port=80, acknowledged=True
        )

        unack_result = await get_alerts(db_session, acknowledged=False)
        ack_result = await get_alerts(db_session, acknowledged=True)

        unack_ids = [a[0].id for a in unack_result]
        ack_ids = [a[0].id for a in ack_result]

        # Verify no overlap
        assert not set(unack_ids).intersection(set(ack_ids))

    async def test_get_alerts_with_pagination(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Get alerts should respect pagination."""
        network, scan = network_with_scan
        for i in range(5):
            await self._create_test_alert(db_session, network, scan, port=100 + i)

        result = await get_alerts(db_session, offset=0, limit=2)

        assert len(result) == 2

    async def test_acknowledge_alert(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Acknowledge alert should set acknowledged to True."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(
            db_session, network, scan, acknowledged=False
        )
        assert alert.acknowledged is False

        updated = await acknowledge_alert(db_session, alert)

        assert updated.acknowledged is True

    async def test_acknowledge_alerts_multiple(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Acknowledge alerts should update multiple alerts."""
        network, scan = network_with_scan
        alert1 = await self._create_test_alert(
            db_session, network, scan, port=22, acknowledged=False
        )
        alert2 = await self._create_test_alert(
            db_session, network, scan, port=80, acknowledged=False
        )

        updated = await acknowledge_alerts(db_session, [alert1, alert2])

        assert len(updated) == 2
        for alert in updated:
            assert alert.acknowledged is True

    async def test_acknowledge_alerts_empty_list(self, db_session: AsyncSession):
        """Acknowledge alerts with empty list should return empty list."""
        result = await acknowledge_alerts(db_session, [])
        assert result == []

    async def test_unacknowledge_alert(
        self, db_session: AsyncSession, network_with_scan: tuple
    ):
        """Unacknowledge alert should set acknowledged to False."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(
            db_session, network, scan, acknowledged=True
        )
        assert alert.acknowledged is True

        updated = await unacknowledge_alert(db_session, alert)

        assert updated.acknowledged is False


class TestAlertRouter:
    """Tests for alert router endpoints."""

    async def _create_test_alert(
        self,
        db_session: AsyncSession,
        network: Network,
        scan: Scan,
        acknowledged: bool = False,
    ) -> Alert:
        """Helper to create a test alert."""
        alert = Alert(
            scan_id=scan.id,
            network_id=network.id,
            alert_type=AlertType.NEW_PORT,
            ip="192.168.1.1",
            port=22,
            message="Test alert",
            acknowledged=acknowledged,
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

    async def test_list_alerts_filter_acknowledged(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """List alerts should filter by acknowledged parameter."""
        network, scan = network_with_scan
        await self._create_test_alert(db_session, network, scan, acknowledged=False)

        response = await client.get(
            "/api/alerts?acknowledged=false", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        for alert in data["alerts"]:
            assert alert["acknowledged"] is False

    async def test_acknowledge_alert(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """Acknowledge alert should mark alert as acknowledged."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(db_session, network, scan)

        response = await client.put(
            f"/api/alerts/{alert.id}/acknowledge", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged"] is True

    async def test_acknowledge_alert_not_found(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Acknowledge alert should return 404 for non-existent alert."""
        response = await client.put("/api/alerts/99999/acknowledge", headers=admin_headers)

        assert response.status_code == 404

    async def test_unacknowledge_alert(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """Unacknowledge alert should reopen alert."""
        network, scan = network_with_scan
        alert = await self._create_test_alert(db_session, network, scan, acknowledged=True)

        response = await client.put(
            f"/api/alerts/{alert.id}/unacknowledge", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["acknowledged"] is False

    async def test_bulk_acknowledge_alerts(
        self,
        client: AsyncClient,
        admin_user: User,
        network_with_scan: tuple,
        db_session: AsyncSession,
        admin_headers: dict,
    ):
        """Bulk acknowledge should mark multiple alerts as acknowledged."""
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

        response = await client.put(
            "/api/alerts/acknowledge-bulk",
            headers=admin_headers,
            json=[alert1.id, alert2.id],
        )

        assert response.status_code == 200
        data = response.json()
        assert len(data["acknowledged_ids"]) == 2

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
