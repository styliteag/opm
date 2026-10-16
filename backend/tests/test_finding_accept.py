"""Accepting a GVM/nuclei/NSE alert must target that one finding, not the host."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert
from app.models.alert_rule import AlertRule, RuleType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.schemas.nse import NseScriptResultPayload
from app.schemas.vulnerability import VulnerabilityResultData, VulnerabilityResultRequest
from app.services.alert_policy import POLICY_ALLOWED_GLOBAL, POLICY_NONE, compute_policy_states
from app.services.alert_rules import finding_identifier
from app.services.nse_results import _generate_nse_alerts
from app.services.vulnerability_results import submit_vulnerability_results

IP = "192.168.1.50"
OID_A = "1.3.6.1.4.1.25623.1.0.100"
OID_B = "1.3.6.1.4.1.25623.1.0.200"


async def _running_scan(db_session: AsyncSession, network: Network, scanner: Scanner) -> Scan:
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


def _finding(oid: str, source: str = "gvm") -> VulnerabilityResultData:
    return VulnerabilityResultData(
        ip=IP,
        port=443,
        protocol="tcp",
        oid=oid,
        name=f"Finding {oid}",
        description="desc",
        severity=9.0,
        severity_label="critical",
        source=source,
    )


async def _submit(
    db_session: AsyncSession,
    network: Network,
    scanner: Scanner,
    findings: list[VulnerabilityResultData],
) -> None:
    scan = await _running_scan(db_session, network, scanner)
    await submit_vulnerability_results(
        db_session,
        scanner,
        VulnerabilityResultRequest(scan_id=scan.id, status="success", vulnerabilities=findings),
    )
    await db_session.commit()


async def _open_alerts(db_session: AsyncSession) -> list[Alert]:
    result = await db_session.execute(select(Alert).where(Alert.dismissed.is_(False)))
    return list(result.scalars().all())


@pytest.mark.parametrize("source", ["gvm", "nuclei"])
async def test_accept_targets_only_the_accepted_finding(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network: Network,
    scanner: Scanner,
    source: str,
) -> None:
    await _submit(db_session, network, scanner, [_finding(OID_A, source)])
    [alert_a] = await _open_alerts(db_session)

    resp = await client.post(
        "/api/alerts/bulk-accept-global",
        headers=admin_headers,
        json={"alert_ids": [alert_a.id], "reason": "known and tolerated"},
    )
    assert resp.status_code == 200

    rules = list((await db_session.execute(select(AlertRule))).scalars().all())
    assert len(rules) == 1
    assert rules[0].match_criteria == {"ip": IP, "port": "443", "oid": OID_A}

    # Next scan: the accepted finding stays quiet, a different finding still alerts.
    await _submit(db_session, network, scanner, [_finding(OID_A, source), _finding(OID_B, source)])
    open_alerts = await _open_alerts(db_session)
    assert [finding_identifier(a) for a in open_alerts] == [OID_B]

    states = await compute_policy_states(db_session, [alert_a, *open_alerts])
    assert states[alert_a.id].policy_state == POLICY_ALLOWED_GLOBAL
    assert states[open_alerts[0].id].policy_state == POLICY_NONE


async def test_accept_nse_finding_targets_only_that_script(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network: Network,
    scanner: Scanner,
) -> None:
    def payload(script: str) -> NseScriptResultPayload:
        return NseScriptResultPayload(
            ip=IP,
            port=443,
            protocol="tcp",
            script_name=script,
            script_output="State: VULNERABLE",
            severity="high",
            cve_ids=[],
        )

    scan = await _running_scan(db_session, network, scanner)
    await _generate_nse_alerts(db_session, scan, [payload("ssl-heartbleed")])
    await db_session.commit()
    [alert] = await _open_alerts(db_session)
    assert finding_identifier(alert) == "nse:ssl-heartbleed"

    resp = await client.post(
        "/api/alerts/bulk-accept-network",
        headers=admin_headers,
        json={"alert_ids": [alert.id], "reason": "patched upstream"},
    )
    assert resp.status_code == 200

    scan2 = await _running_scan(db_session, network, scanner)
    await _generate_nse_alerts(
        db_session, scan2, [payload("ssl-heartbleed"), payload("ssl-poodle")]
    )
    await db_session.commit()
    assert [finding_identifier(a) for a in await _open_alerts(db_session)] == ["nse:ssl-poodle"]


async def test_legacy_ip_only_finding_rule_matches_nothing(
    db_session: AsyncSession,
    network: Network,
    scanner: Scanner,
) -> None:
    """Pre-fix rules ({"ip": ...} only) must not start suppressing every finding."""
    db_session.add(
        AlertRule(
            network_id=None,
            source="gvm",
            rule_type=RuleType.ACCEPTED,
            match_criteria={"ip": IP},
            description="legacy",
        )
    )
    await db_session.commit()

    await _submit(db_session, network, scanner, [_finding(OID_A), _finding(OID_B)])
    assert len(await _open_alerts(db_session)) == 2


def test_finding_identifier_handles_ipv6_and_composite_oids() -> None:
    alert = Alert(
        network_id=7,
        source="nuclei",
        ip="2001:db8::1",
        port=8443,
        source_key="nuclei:7:2001:db8::1:8443:tcp:http/exposed-panel:main",
    )
    assert finding_identifier(alert) == "http/exposed-panel:main"

    host_level = Alert(
        network_id=7,
        source="gvm",
        ip="10.0.0.1",
        port=None,
        source_key="gvm:7:10.0.0.1:host:tcp:1.2.3",
    )
    assert finding_identifier(host_level) == "1.2.3"

    port_alert = Alert(network_id=7, source="port", ip="10.0.0.1", port=80, source_key=None)
    assert finding_identifier(port_alert) is None
