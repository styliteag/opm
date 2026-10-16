"""Default finding alert threshold is high (ADR 0013); explicit values still apply."""

from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.schemas.nse import NseScriptResultPayload
from app.schemas.vulnerability import VulnerabilityResultData, VulnerabilityResultRequest
from app.services.nse_results import _generate_nse_alerts
from app.services.vulnerability_results import submit_vulnerability_results


async def _scan(db_session: AsyncSession, network: Network, scanner: Scanner) -> Scan:
    scan = Scan(
        network_id=network.id,
        scanner_id=scanner.id,
        status=ScanStatus.RUNNING,
        trigger_type=TriggerType.MANUAL,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    return scan


def _finding(label: str, source: str) -> VulnerabilityResultData:
    scores = {"low": 2.0, "medium": 5.0, "high": 8.0, "critical": 9.8}
    return VulnerabilityResultData(
        ip="10.0.0.9",
        port=443,
        protocol="tcp",
        oid=f"oid-{label}",
        name=f"{label} finding",
        description="d",
        severity=scores[label],
        severity_label=label,
        source=source,
    )


async def _alert_oids(db_session: AsyncSession) -> set[str]:
    alerts = (await db_session.execute(select(Alert))).scalars().all()
    return {a.source_key.rsplit(":", 1)[1] for a in alerts if a.source_key}


@pytest.mark.parametrize(
    ("source", "column", "explicit", "expected"),
    [
        ("gvm", "gvm_alert_severity", None, {"oid-high", "oid-critical"}),
        ("gvm", "gvm_alert_severity", "medium", {"oid-medium", "oid-high", "oid-critical"}),
        ("gvm", "gvm_alert_severity", "critical", {"oid-critical"}),
        ("nuclei", "nuclei_severity", None, {"oid-high", "oid-critical"}),
        ("nuclei", "nuclei_severity", "low", {"oid-low", "oid-medium", "oid-high", "oid-critical"}),
    ],
)
async def test_vulnerability_threshold(
    db_session: AsyncSession,
    network: Network,
    scanner: Scanner,
    source: str,
    column: str,
    explicit: str | None,
    expected: set[str],
) -> None:
    setattr(network, column, explicit)
    await db_session.commit()
    scan = await _scan(db_session, network, scanner)
    findings = [_finding(label, source) for label in ("low", "medium", "high", "critical")]

    await submit_vulnerability_results(
        db_session,
        scanner,
        VulnerabilityResultRequest(scan_id=scan.id, status="success", vulnerabilities=findings),
    )
    await db_session.commit()

    assert await _alert_oids(db_session) == expected


async def test_nse_threshold_defaults_to_high(
    db_session: AsyncSession,
    network: Network,
    scanner: Scanner,
) -> None:
    scan = await _scan(db_session, network, scanner)
    payloads = [
        NseScriptResultPayload(
            ip="10.0.0.9",
            port=443,
            script_name=f"script-{label}",
            script_output="State: VULNERABLE",
            severity=label,
        )
        for label in ("medium", "high", "critical")
    ]

    await _generate_nse_alerts(db_session, scan, payloads)
    await db_session.commit()

    # NSE identifiers are "nse:<script>"; _alert_oids keeps the part after the last colon
    assert await _alert_oids(db_session) == {"script-high", "script-critical"}
