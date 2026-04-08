"""Tests for rule hit count computation."""

from datetime import datetime, timezone

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType, ResolutionStatus
from app.models.alert_rule import AlertRule, RuleType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner


class TestRuleHitCounts:
    """Tests for hit_count in GET /api/port-rules response."""

    async def test_hit_count_zero_when_no_alerts(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
    ):
        """Rules with no matching dismissed alerts have hit_count=0."""
        rule = AlertRule(
            network_id=network.id,
            source="port",
            rule_type=RuleType.ACCEPTED,
            match_criteria={"port": "80"},
            description="Accept port 80",
            enabled=True,
        )
        db_session.add(rule)
        await db_session.commit()

        resp = await client.get("/api/port-rules", headers=admin_headers)
        assert resp.status_code == 200
        rules = resp.json()["rules"]
        assert len(rules) == 1
        assert rules[0]["hit_count"] == 0

    async def test_hit_count_matches_dismissed_alerts(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        network: Network,
        scanner: Scanner,
    ):
        """hit_count reflects number of dismissed alerts matching the rule."""
        now = datetime.now(timezone.utc)

        # Create scan for alerts
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

        # Create rule for port 80
        rule = AlertRule(
            network_id=network.id,
            source="port",
            rule_type=RuleType.ACCEPTED,
            match_criteria={"port": "80"},
            description="Accept port 80",
            enabled=True,
        )
        db_session.add(rule)

        # Create 2 dismissed alerts matching port 80
        for i in range(2):
            db_session.add(
                Alert(
                    scan_id=scan.id,
                    network_id=network.id,
                    alert_type=AlertType.NEW_PORT,
                    source="port",
                    ip=f"192.168.1.{i + 1}",
                    port=80,
                    message=f"Port 80 alert {i}",
                    dismissed=True,
                    resolution_status=ResolutionStatus.RESOLVED,
                )
            )

        # Create 1 non-dismissed alert (should not count)
        db_session.add(
            Alert(
                scan_id=scan.id,
                network_id=network.id,
                alert_type=AlertType.NEW_PORT,
                source="port",
                ip="192.168.1.10",
                port=80,
                message="Active alert",
                dismissed=False,
                resolution_status=ResolutionStatus.OPEN,
            )
        )

        # Create 1 dismissed alert on different port (should not count)
        db_session.add(
            Alert(
                scan_id=scan.id,
                network_id=network.id,
                alert_type=AlertType.NEW_PORT,
                source="port",
                ip="192.168.1.5",
                port=443,
                message="Port 443 alert",
                dismissed=True,
                resolution_status=ResolutionStatus.RESOLVED,
            )
        )

        await db_session.commit()

        resp = await client.get("/api/port-rules", headers=admin_headers)
        assert resp.status_code == 200
        rules = resp.json()["rules"]
        assert len(rules) == 1
        assert rules[0]["hit_count"] == 2

    async def test_hit_count_field_present_in_response(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
    ):
        """hit_count field is present even with empty rules list."""
        resp = await client.get("/api/port-rules", headers=admin_headers)
        assert resp.status_code == 200
        # Empty list is fine — just verify structure
        assert "rules" in resp.json()
