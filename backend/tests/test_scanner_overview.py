"""Tests for scanner overview endpoint."""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner


class TestScannerOverviewEndpoint:
    """Tests for GET /api/scanners/{scanner_id}/overview."""

    async def test_overview_not_found(self, client: AsyncClient, admin_headers: dict[str, str]):
        """Returns 404 for non-existent scanner."""
        resp = await client.get("/api/scanners/99999/overview", headers=admin_headers)
        assert resp.status_code == 404

    async def test_overview_empty_scanner(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        scanner: Scanner,
    ):
        """Returns overview with zero counts for scanner with no networks/scans."""
        resp = await client.get(f"/api/scanners/{scanner.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["scanner"]["id"] == scanner.id
        assert data["scanner"]["name"] == scanner.name
        assert data["networks"] == []
        assert data["recent_scans"] == []
        assert data["total_scans"] == 0
        assert data["completed_scans"] == 0
        assert data["failed_scans"] == 0
        assert data["avg_scan_duration_seconds"] is None
        assert data["scans_last_24h"] == 0
        assert data["scans_last_7d"] == 0

    async def test_overview_with_networks(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        scanner: Scanner,
    ):
        """Returns assigned networks."""
        net1 = Network(
            name="Net A",
            cidr="10.0.0.0/24",
            scanner_id=scanner.id,
            port_spec="22,80",
            scan_schedule="0 * * * *",
        )
        net2 = Network(
            name="Net B",
            cidr="10.0.1.0/24",
            scanner_id=scanner.id,
            port_spec="443",
        )
        db_session.add_all([net1, net2])
        await db_session.commit()

        resp = await client.get(f"/api/scanners/{scanner.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["networks"]) == 2
        names = [n["name"] for n in data["networks"]]
        assert "Net A" in names
        assert "Net B" in names
        assert data["networks"][0]["cidr"] is not None

    async def test_overview_with_scans(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
        scanner: Scanner,
    ):
        """Returns scan stats and recent scans."""
        now = datetime.now(timezone.utc)

        # Completed scan with duration
        scan1 = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.COMPLETED,
            trigger_type=TriggerType.MANUAL,
            started_at=now - timedelta(hours=2),
            completed_at=now - timedelta(hours=1),
        )
        # Failed scan
        scan2 = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.FAILED,
            trigger_type=TriggerType.SCHEDULED,
            started_at=now - timedelta(hours=3),
            completed_at=now - timedelta(hours=2, minutes=30),
            error_message="Timeout",
        )
        db_session.add_all([scan1, scan2])
        await db_session.commit()

        resp = await client.get(f"/api/scanners/{scanner.id}/overview", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert data["total_scans"] == 2
        assert data["completed_scans"] == 1
        assert data["failed_scans"] == 1
        assert data["avg_scan_duration_seconds"] is not None
        assert data["avg_scan_duration_seconds"] > 0
        assert data["scans_last_24h"] == 2
        assert data["scans_last_7d"] == 2
        assert len(data["recent_scans"]) == 2

    async def test_overview_unauthenticated(self, client: AsyncClient):
        """Returns 401 without auth."""
        resp = await client.get("/api/scanners/1/overview")
        assert resp.status_code == 401
