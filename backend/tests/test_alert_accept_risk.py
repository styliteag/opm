"""POST /api/alerts/{id}/accept-risk (ADR 0012)."""

from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.alert_comment import AlertComment
from app.models.alert_event import AlertEvent, AlertEventType
from app.models.alert_rule import AlertRule, RuleType
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.models.severity_rule import SeverityRule
from app.models.ssh_scan_result import SSHScanResult
from app.models.user import User
from app.schemas.vulnerability import VulnerabilityResultData, VulnerabilityResultRequest
from app.services.ssh_alert_generation import generate_ssh_alerts_for_scan
from app.services.vulnerability_results import submit_vulnerability_results

IP = "192.168.1.30"
OID = "1.3.6.1.4.1.25623.1.0.999"


def _url(alert_id: int) -> str:
    return f"/api/alerts/{alert_id}/accept-risk"


async def _alert(
    db_session: AsyncSession,
    network_id: int | None,
    scan: Scan,
    *,
    source: str,
    alert_type: AlertType,
    port: int | None = 443,
    source_key: str | None = None,
) -> Alert:
    alert = Alert(
        scan_id=scan.id,
        network_id=network_id,
        alert_type=alert_type,
        source=source,
        source_key=source_key,
        ip=IP,
        port=port,
        message=f"{source} alert",
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


async def _gvm_alert(db_session: AsyncSession, network: Network, scan: Scan) -> Alert:
    return await _alert(
        db_session,
        network.id,
        scan,
        source="gvm",
        alert_type=AlertType.GVM_VULNERABILITY,
        source_key=f"gvm:{network.id}:{IP}:443:tcp:{OID}",
    )


@pytest.mark.parametrize(
    ("source", "alert_type", "oid"),
    [
        ("gvm", AlertType.GVM_VULNERABILITY, OID),
        ("nuclei", AlertType.NUCLEI_CVE_DETECTED, "http/cve-2024-1:main"),
        ("nse", AlertType.NSE_VULNERABILITY, "nse:ssl-heartbleed"),
    ],
)
async def test_accept_risk_finding_creates_network_severity_rule(
    client: AsyncClient,
    db_session: AsyncSession,
    operator_headers: dict[str, str],
    operator_user: User,
    network_with_scan: tuple[Network, Scan],
    source: str,
    alert_type: AlertType,
    oid: str,
) -> None:
    network, scan = network_with_scan
    alert = await _alert(
        db_session,
        network.id,
        scan,
        source=source,
        alert_type=alert_type,
        source_key=f"{source}:{network.id}:{IP}:443:tcp:{oid}",
    )

    resp = await client.post(
        _url(alert.id), headers=operator_headers, json={"reason": "  Compensating control  "}
    )

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == alert.id
    assert body["dismissed"] is True
    assert body["dismiss_reason"] == "Compensating control"

    [rule] = (await db_session.execute(select(SeverityRule))).scalars().all()
    assert rule.oid == oid
    assert rule.network_id == network.id
    assert rule.severity_override == "info"
    assert rule.reason == "Compensating control"
    assert rule.created_by_user_id == operator_user.id

    [comment] = (await db_session.execute(select(AlertComment))).scalars().all()
    assert comment.comment == "Compensating control"
    events = (
        await db_session.execute(
            select(AlertEvent).where(AlertEvent.event_type == AlertEventType.DISMISSED)
        )
    ).scalars().all()
    assert len(list(events)) == 1


async def test_accept_risk_updates_existing_severity_rule(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    db_session.add(
        SeverityRule(oid=OID, network_id=network.id, severity_override="critical", reason="old")
    )
    await db_session.commit()
    alert = await _gvm_alert(db_session, network, scan)

    resp = await client.post(_url(alert.id), headers=admin_headers, json={"reason": "new"})

    assert resp.status_code == 200
    [rule] = (await db_session.execute(select(SeverityRule))).scalars().all()
    assert (rule.severity_override, rule.reason) == ("info", "new")


async def test_accept_risk_silences_future_finding_on_network(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    scanner: Scanner,
) -> None:
    network, scan = network_with_scan
    alert = await _gvm_alert(db_session, network, scan)
    resp = await client.post(_url(alert.id), headers=admin_headers, json={"reason": "accepted"})
    assert resp.status_code == 200

    new_scan = Scan(
        network_id=network.id,
        scanner_id=scanner.id,
        status=ScanStatus.RUNNING,
        trigger_type=TriggerType.MANUAL,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(new_scan)
    await db_session.commit()
    finding = VulnerabilityResultData(
        ip="192.168.1.31",
        port=443,
        protocol="tcp",
        oid=OID,
        name="Same finding, other host",
        description="d",
        severity=9.8,
        severity_label="critical",
    )
    await submit_vulnerability_results(
        db_session,
        scanner,
        VulnerabilityResultRequest(
            scan_id=new_scan.id, status="success", vulnerabilities=[finding]
        ),
    )
    await db_session.commit()

    open_alerts = (
        await db_session.execute(select(Alert).where(Alert.dismissed.is_(False)))
    ).scalars().all()
    assert list(open_alerts) == []


@pytest.mark.parametrize(("port", "expected_port"), [(22, "22"), (None, None)])
async def test_accept_risk_ssh_creates_network_accept_rule(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    port: int | None,
    expected_port: str | None,
) -> None:
    network, scan = network_with_scan
    alert = await _alert(
        db_session,
        network.id,
        scan,
        source="ssh",
        alert_type=AlertType.SSH_WEAK_KEX,
        port=port,
    )

    resp = await client.post(_url(alert.id), headers=admin_headers, json={"reason": "legacy box"})

    assert resp.status_code == 200, resp.text
    [rule] = (await db_session.execute(select(AlertRule))).scalars().all()
    expected = {"ip": IP, "alert_type": "ssh_weak_kex"}
    if expected_port is not None:
        expected["port"] = expected_port
    assert rule.match_criteria == expected
    assert rule.source == "ssh"
    assert rule.rule_type == RuleType.ACCEPTED
    assert rule.network_id == network.id
    assert rule.description == "legacy box"
    assert resp.json()["dismissed"] is True


async def test_accept_risk_ssh_without_network_creates_global_rule(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    _network, scan = network_with_scan
    alert = await _alert(
        db_session, None, scan, source="ssh", alert_type=AlertType.SSH_INSECURE_AUTH, port=22
    )

    resp = await client.post(_url(alert.id), headers=admin_headers, json={"reason": "jump host"})

    assert resp.status_code == 200, resp.text
    [rule] = (await db_session.execute(select(AlertRule))).scalars().all()
    assert rule.network_id is None


async def test_accept_risk_rejects_port_alerts(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    alert = await _alert(
        db_session, network.id, scan, source="port", alert_type=AlertType.NEW_PORT, port=80
    )

    resp = await client.post(_url(alert.id), headers=admin_headers, json={"reason": "x"})

    assert resp.status_code == 400
    assert resp.json()["detail"] == "Use Expected for port alerts"
    await db_session.refresh(alert)
    assert alert.dismissed is False


async def test_accept_risk_unknown_alert(
    client: AsyncClient, admin_headers: dict[str, str]
) -> None:
    resp = await client.post(_url(99999), headers=admin_headers, json={"reason": "x"})
    assert resp.status_code == 404


@pytest.mark.parametrize("body", [{}, {"reason": ""}, {"reason": "   "}])
async def test_accept_risk_requires_reason(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    body: dict[str, str],
) -> None:
    network, scan = network_with_scan
    alert = await _gvm_alert(db_session, network, scan)
    resp = await client.post(_url(alert.id), headers=admin_headers, json=body)
    assert resp.status_code == 422


async def test_accept_risk_requires_operator(
    client: AsyncClient, viewer_headers: dict[str, str]
) -> None:
    assert (await client.post(_url(1), json={"reason": "x"})).status_code == 401
    resp = await client.post(_url(1), headers=viewer_headers, json={"reason": "x"})
    assert resp.status_code == 403


async def test_accept_risk_ssh_silences_next_scan_on_network(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    """Network-scoped SSH accept rules must be honoured by the SSH generator."""
    network, scan = network_with_scan
    alert = await _alert(
        db_session, network.id, scan, source="ssh", alert_type=AlertType.SSH_WEAK_KEX, port=22
    )
    resp = await client.post(_url(alert.id), headers=admin_headers, json={"reason": "legacy"})
    assert resp.status_code == 200

    network.alert_config = {"ssh_weak_kex": True}
    next_scan = Scan(
        network_id=network.id,
        scanner_id=network.scanner_id,
        status=ScanStatus.COMPLETED,
        trigger_type=TriggerType.MANUAL,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(next_scan)
    await db_session.commit()
    db_session.add(
        SSHScanResult(
            scan_id=next_scan.id,
            host_ip=IP,
            port=22,
            kex_algorithms=[{"name": "diffie-hellman-group1-sha1", "is_weak": True}],
        )
    )
    await db_session.commit()

    await generate_ssh_alerts_for_scan(db_session, next_scan)
    await db_session.commit()

    open_alerts = (
        await db_session.execute(select(Alert).where(Alert.dismissed.is_(False)))
    ).scalars().all()
    assert list(open_alerts) == []
