"""Tests for NSE result projection into the unified vulnerabilities flow."""

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.nse_result import NseResult
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.severity_rule import SeverityRule
from app.models.vulnerability import Vulnerability
from app.schemas.nse import NseResultsSubmission, NseScriptResultPayload
from app.services.nse_results import submit_nse_results


class TestNseResults:
    async def test_submit_nse_results_projects_into_vulnerabilities(
        self,
        db_session: AsyncSession,
        network,
        scanner,
    ) -> None:
        scan = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.RUNNING,
            trigger_type=TriggerType.MANUAL,
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(scan)
        await db_session.flush()

        submission = NseResultsSubmission(
            scan_id=scan.id,
            nse_results=[
                NseScriptResultPayload(
                    ip="194.59.156.71",
                    port=53,
                    protocol="udp",
                    script_name="dns-recursion",
                    script_output="Recursion appears to be enabled",
                    cve_ids=[],
                    severity="info",
                )
            ],
        )

        recorded = await submit_nse_results(db_session, scanner, submission)
        await db_session.commit()

        assert recorded == 1

        raw_rows = await db_session.execute(select(NseResult))
        raw = raw_rows.scalar_one()
        assert raw.script_name == "dns-recursion"

        vuln_rows = await db_session.execute(select(Vulnerability))
        vuln = vuln_rows.scalar_one()
        assert vuln.source == "nse"
        assert vuln.oid == "nse:dns-recursion"
        assert vuln.name == "dns-recursion"
        assert vuln.ip == "194.59.156.71"
        assert vuln.port == 53
        assert vuln.protocol == "udp"
        assert vuln.description == "Recursion appears to be enabled"
        assert vuln.severity_label == "info"

    async def test_nse_alerts_honor_severity_override_rules(
        self,
        db_session: AsyncSession,
        network,
        scanner,
    ) -> None:
        scan = Scan(
            network_id=network.id,
            scanner_id=scanner.id,
            status=ScanStatus.RUNNING,
            trigger_type=TriggerType.MANUAL,
            started_at=datetime.now(timezone.utc),
        )
        db_session.add(scan)
        db_session.add(
            SeverityRule(
                oid="nse:dns-recursion",
                network_id=network.id,
                severity_override="high",
                reason="Recursive resolver should alert",
            )
        )
        await db_session.flush()

        submission = NseResultsSubmission(
            scan_id=scan.id,
            nse_results=[
                NseScriptResultPayload(
                    ip="194.59.156.71",
                    port=53,
                    protocol="udp",
                    script_name="dns-recursion",
                    script_output="Recursion appears to be enabled",
                    cve_ids=[],
                    severity="info",
                )
            ],
        )

        recorded = await submit_nse_results(db_session, scanner, submission)
        await db_session.commit()

        assert recorded == 1

        alert_rows = await db_session.execute(select(Alert))
        alert = alert_rows.scalar_one()
        assert alert.source == "nse"
        assert alert.source_key == f"nse:{network.id}:194.59.156.71:53:udp:nse:dns-recursion"
        assert alert.severity_override == "high"
