"""Tests for network overview endpoint."""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.network import Network
from app.models.open_port import OpenPort
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner


class TestNetworkOverviewEndpoint:
    """Tests for GET /api/networks/{network_id}/overview."""

    async def test_overview_not_found(self, client: AsyncClient, admin_headers: dict[str, str]):
        """Returns 404 for non-existent network."""
        resp = await client.get("/api/networks/99999/overview", headers=admin_headers)
        assert resp.status_code == 404

    async def test_overview_empty_network(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        network: Network,
        scanner: Scanner,
    ):
        """Returns overview with zero counts for network with no scans/alerts."""
        resp = await client.get(f"/api/networks/{network.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["network"]["id"] == network.id
        assert data["active_alert_count"] == 0
        assert data["alert_severity_distribution"] == {}
        assert data["open_port_count"] == 0
        assert data["total_scans_30d"] == 0
        assert data["completed_scans_30d"] == 0
        assert data["scan_success_rate"] == 0.0
        assert data["last_scan"] is None
        assert data["scanner_name"] == scanner.name
        assert data["scanner_online"] is False  # No last_seen_at

    async def test_overview_with_scans(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
        scanner: Scanner,
    ):
        """Returns correct scan stats."""
        now = datetime.now(timezone.utc)

        # Create completed scan with ports
        scan1 = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.COMPLETED,
            trigger_type=TriggerType.MANUAL,
            started_at=now - timedelta(hours=2),
            completed_at=now - timedelta(hours=1),
        )
        db_session.add(scan1)
        await db_session.flush()

        # Add open ports to scan
        for port_num in [22, 80, 443]:
            db_session.add(
                OpenPort(
                    scan_id=scan1.id,
                    ip="192.168.1.1",
                    port=port_num,
                    protocol="tcp",
                )
            )

        # Create failed scan
        scan2 = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.FAILED,
            trigger_type=TriggerType.SCHEDULED,
            started_at=now - timedelta(hours=3),
            completed_at=now - timedelta(hours=2),
            error_message="Timeout",
        )
        db_session.add(scan2)
        await db_session.commit()

        resp = await client.get(f"/api/networks/{network.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["total_scans_30d"] == 2
        assert data["completed_scans_30d"] == 1
        assert data["scan_success_rate"] == 0.5
        assert data["open_port_count"] == 3
        assert data["last_scan"] is not None
        assert data["last_scan"]["status"] == "completed"

    async def test_overview_with_alerts(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
        scanner: Scanner,
    ):
        """Returns correct alert counts and severity distribution."""
        now = datetime.now(timezone.utc)

        # Create a scan for the alerts
        scan = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.COMPLETED,
            trigger_type=TriggerType.MANUAL,
            started_at=now,
            completed_at=now,
        )
        db_session.add(scan)
        await db_session.flush()

        # Active alerts
        for i, alert_type in enumerate([AlertType.NEW_PORT, AlertType.BLOCKED, AlertType.NEW_PORT]):
            db_session.add(
                Alert(
                    scan_id=scan.id,
                    network_id=network.id,
                    alert_type=alert_type,
                    source="port",
                    ip=f"192.168.1.{i + 1}",
                    port=80 + i,
                    message=f"Test alert {i}",
                    dismissed=False,
                    resolution_status=ResolutionStatus.OPEN,
                )
            )

        # Dismissed alert (should not count)
        db_session.add(
            Alert(
                scan_id=scan.id,
                network_id=network.id,
                alert_type=AlertType.NEW_PORT,
                source="port",
                ip="192.168.1.10",
                port=8080,
                message="Dismissed alert",
                dismissed=True,
                resolution_status=ResolutionStatus.RESOLVED,
            )
        )
        await db_session.commit()

        resp = await client.get(f"/api/networks/{network.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["active_alert_count"] == 3
        # Severity distribution computed from alert types
        dist = data["alert_severity_distribution"]
        assert isinstance(dist, dict)
        total_severity = sum(dist.values())
        assert total_severity == 3

    async def test_overview_scanner_online(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
        scanner: Scanner,
    ):
        """Scanner shows as online when recently seen."""
        scanner.last_seen_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db_session.commit()

        resp = await client.get(f"/api/networks/{network.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["scanner_online"] is True

    async def test_overview_unauthenticated(self, client: AsyncClient):
        """Returns 401 without auth."""
        resp = await client.get("/api/networks/1/overview")
        assert resp.status_code == 401
