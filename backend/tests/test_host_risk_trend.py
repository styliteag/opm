"""Tests for host risk trend endpoint."""

from datetime import datetime, timedelta, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.host import Host
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner


class TestHostRiskTrend:
    """Tests for GET /api/hosts/{host_id}/risk-trend."""

    async def test_risk_trend_not_found(self, client: AsyncClient, admin_headers: dict[str, str]):
        """Returns 404 for non-existent host."""
        resp = await client.get("/api/hosts/99999/risk-trend", headers=admin_headers)
        assert resp.status_code == 404

    async def test_risk_trend_empty(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ):
        """Returns 14 zero-score points for host with no alerts."""
        host = Host(ip="10.0.0.1", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()
        await db_session.refresh(host)

        resp = await client.get(f"/api/hosts/{host.id}/risk-trend", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["points"]) == 14
        assert all(p["score"] == 0 for p in data["points"])

    async def test_risk_trend_with_alerts(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
        scanner: Scanner,
    ):
        """Returns non-zero scores when alerts exist."""
        host = Host(ip="10.0.0.2", seen_by_networks=[network.id])
        db_session.add(host)
        await db_session.flush()

        now = datetime.now(timezone.utc)

        scan = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.COMPLETED,
            trigger_type=TriggerType.MANUAL,
            started_at=now - timedelta(days=5),
            completed_at=now - timedelta(days=5),
        )
        db_session.add(scan)
        await db_session.flush()

        # Alert created 5 days ago
        db_session.add(
            Alert(
                scan_id=scan.id,
                network_id=network.id,
                alert_type=AlertType.BLOCKED,
                source="port",
                ip="10.0.0.2",
                port=22,
                message="Blocked port",
                dismissed=False,
                resolution_status=ResolutionStatus.OPEN,
                created_at=now - timedelta(days=5),
            )
        )
        await db_session.commit()
        await db_session.refresh(host)

        resp = await client.get(f"/api/hosts/{host.id}/risk-trend", headers=admin_headers)
        assert resp.status_code == 200
        data = resp.json()

        assert len(data["points"]) == 14
        # Last few days should have non-zero scores
        recent_scores = [p["score"] for p in data["points"][-5:]]
        assert any(s > 0 for s in recent_scores)

    async def test_risk_trend_unauthenticated(self, client: AsyncClient):
        """Returns 401 without auth."""
        resp = await client.get("/api/hosts/1/risk-trend")
        assert resp.status_code == 401
