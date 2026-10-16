"""Expected (bulk accept) scope parameter and optional reason (ADR 0012)."""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.alert_comment import AlertComment
from app.models.alert_rule import AlertRule
from app.models.global_open_port import GlobalOpenPort
from app.models.network import Network
from app.models.scan import Scan

IP = "192.168.1.20"
GLOBAL = "/api/alerts/bulk-accept-global"
NETWORK = "/api/alerts/bulk-accept-network"


async def _alert(
    db_session: AsyncSession,
    network: Network,
    scan: Scan,
    *,
    alert_type: AlertType = AlertType.NEW_PORT,
    source: str = "port",
    port: int | None = 80,
    source_key: str | None = None,
) -> Alert:
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
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


async def _rules(db_session: AsyncSession) -> list[AlertRule]:
    return list((await db_session.execute(select(AlertRule))).scalars().all())


@pytest.mark.parametrize(
    ("url", "match", "expected_criteria", "scoped"),
    [
        (NETWORK, None, {"ip": IP, "port": "80"}, True),
        (NETWORK, "host", {"ip": IP, "port": "80"}, True),
        (NETWORK, "all_hosts", {"port": "80"}, True),
        (GLOBAL, "host", {"ip": IP, "port": "80"}, False),
        (GLOBAL, "all_hosts", {"port": "80"}, False),
    ],
)
async def test_port_accept_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    url: str,
    match: str | None,
    expected_criteria: dict[str, str],
    scoped: bool,
) -> None:
    network, scan = network_with_scan
    alert = await _alert(db_session, network, scan)
    body: dict[str, object] = {"alert_ids": [alert.id], "reason": "Web server"}
    if match is not None:
        body["match"] = match

    resp = await client.post(url, headers=admin_headers, json=body)

    assert resp.status_code == 200, resp.text
    [rule] = await _rules(db_session)
    assert rule.source == "port"
    assert rule.match_criteria == expected_criteria
    assert rule.network_id == (network.id if scoped else None)
    assert rule.description == "Web server"


@pytest.mark.parametrize(
    ("match", "expected_criteria"),
    [
        ("host", {"ip": IP, "alert_type": "ssh_weak_cipher", "port": "22"}),
        ("all_hosts", {"alert_type": "ssh_weak_cipher", "port": "22"}),
    ],
)
async def test_ssh_accept_scope(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    match: str,
    expected_criteria: dict[str, str],
) -> None:
    network, scan = network_with_scan
    alert = await _alert(
        db_session, network, scan, alert_type=AlertType.SSH_WEAK_CIPHER, source="ssh", port=22
    )

    resp = await client.post(
        NETWORK, headers=admin_headers, json={"alert_ids": [alert.id], "match": match}
    )

    assert resp.status_code == 200, resp.text
    [rule] = await _rules(db_session)
    assert rule.match_criteria == expected_criteria


async def test_finding_accept_all_hosts_keys_on_identifier_only(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    alert = await _alert(
        db_session,
        network,
        scan,
        alert_type=AlertType.GVM_VULNERABILITY,
        source="gvm",
        port=443,
        source_key=f"gvm:{network.id}:{IP}:443:tcp:1.2.3.4",
    )

    resp = await client.post(
        GLOBAL,
        headers=admin_headers,
        json={"alert_ids": [alert.id], "match": "all_hosts", "reason": "tolerated"},
    )

    assert resp.status_code == 200, resp.text
    [rule] = await _rules(db_session)
    assert rule.match_criteria == {"oid": "1.2.3.4"}


@pytest.mark.parametrize("reason", [None, "", "   "])
async def test_accept_without_reason_writes_no_text(
    client: AsyncClient,
    db_session: AsyncSession,
    admin_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    reason: str | None,
) -> None:
    network, scan = network_with_scan
    port_row = GlobalOpenPort(ip=IP, port=80, protocol="tcp", seen_by_networks=[network.id])
    db_session.add(port_row)
    await db_session.commit()
    alert = await _alert(db_session, network, scan)
    body: dict[str, object] = {"alert_ids": [alert.id], "match": "all_hosts"}
    if reason is not None:
        body["reason"] = reason

    resp = await client.post(GLOBAL, headers=admin_headers, json=body)

    assert resp.status_code == 200, resp.text
    assert resp.json()["dismissed_ids"] == [alert.id]
    [rule] = await _rules(db_session)
    assert rule.description is None
    await db_session.refresh(alert)
    await db_session.refresh(port_row)
    assert alert.dismissed is True
    assert alert.dismiss_reason is None
    assert port_row.user_comment is None
    comments = (await db_session.execute(select(AlertComment))).scalars().all()
    assert list(comments) == []


async def test_accept_reason_propagates_to_port_comment(
    client: AsyncClient,
    db_session: AsyncSession,
    operator_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    port_row = GlobalOpenPort(ip=IP, port=80, protocol="tcp", seen_by_networks=[network.id])
    db_session.add(port_row)
    await db_session.commit()
    alert = await _alert(db_session, network, scan)

    resp = await client.post(
        NETWORK,
        headers=operator_headers,
        json={"alert_ids": [alert.id], "reason": "  Web server  "},
    )

    assert resp.status_code == 200, resp.text
    await db_session.refresh(port_row)
    await db_session.refresh(alert)
    assert port_row.user_comment == "Web server"
    assert alert.dismiss_reason == "Web server"


async def test_accept_rejects_unknown_match(
    client: AsyncClient,
    admin_headers: dict[str, str],
) -> None:
    resp = await client.post(
        GLOBAL, headers=admin_headers, json={"alert_ids": [1], "match": "everywhere"}
    )
    assert resp.status_code == 422


@pytest.mark.parametrize("url", [GLOBAL, NETWORK])
async def test_accept_requires_operator(
    client: AsyncClient,
    viewer_headers: dict[str, str],
    url: str,
) -> None:
    body = {"alert_ids": [1]}
    assert (await client.post(url, json=body)).status_code == 401
    assert (await client.post(url, headers=viewer_headers, json=body)).status_code == 403
