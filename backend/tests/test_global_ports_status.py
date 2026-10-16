"""Ports page enrichment on GET /api/global-ports: host, status, why, status filter."""

from datetime import datetime, timezone

from conftest import NetworkFactory
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.alert_rule import AlertRule, RuleType
from app.models.global_open_port import GlobalOpenPort
from app.models.host import Host
from app.models.network import Network
from app.models.scan import Scan
from app.models.scanner import Scanner
from app.services.port_status import port_status

IP = "192.168.1.40"


async def _port(
    db_session: AsyncSession,
    network: Network,
    port: int,
    *,
    ip: str = IP,
    comment: str | None = None,
    host: Host | None = None,
) -> GlobalOpenPort:
    now = datetime.now(timezone.utc)
    row = GlobalOpenPort(
        ip=ip,
        port=port,
        protocol="tcp",
        first_seen_at=now,
        last_seen_at=now,
        seen_by_networks=[network.id],
        user_comment=comment,
        host_id=host.id if host else None,
    )
    db_session.add(row)
    await db_session.commit()
    await db_session.refresh(row)
    return row


async def _alert(
    db_session: AsyncSession,
    network: Network,
    scan: Scan,
    port: int,
    *,
    dismissed: bool = False,
    reason: str | None = None,
    source: str = "port",
) -> Alert:
    alert = Alert(
        scan_id=scan.id,
        network_id=network.id,
        alert_type=AlertType.NEW_PORT if source == "port" else AlertType.SSH_WEAK_KEX,
        source=source,
        ip=IP,
        port=port,
        message="m",
        dismissed=dismissed,
        dismiss_reason=reason,
    )
    db_session.add(alert)
    await db_session.commit()
    await db_session.refresh(alert)
    return alert


async def _rule(
    db_session: AsyncSession,
    port: str,
    rule_type: RuleType,
    *,
    network_id: int | None = None,
    ip: str | None = None,
    description: str | None = None,
) -> None:
    criteria: dict[str, str | None] = {"port": port}
    if ip:
        criteria["ip"] = ip
    db_session.add(
        AlertRule(
            network_id=network_id,
            source="port",
            rule_type=rule_type,
            match_criteria=criteria,
            description=description,
        )
    )
    await db_session.commit()


async def _list(client: AsyncClient, headers: dict[str, str], **params: object) -> list[dict]:
    query = {"sort_by": "port", "sort_dir": "asc", **params}
    resp = await client.get("/api/global-ports", headers=headers, params=query)
    assert resp.status_code == 200, resp.text
    return list(resp.json()["ports"])


def test_port_status_precedence() -> None:
    assert port_status("critical", "new") == "critical"
    assert port_status("accepted", "new") == "expected"
    assert port_status(None, "new") == "new"
    assert port_status(None, "dismissed") == "snoozed"
    assert port_status(None, None) == "review"


async def test_status_and_why_per_port(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    host = Host(ip=IP, hostname="web01.example.test", seen_by_networks=[network.id])
    db_session.add(host)
    await db_session.commit()
    await db_session.refresh(host)

    for p in (22, 23, 80, 443, 8080):
        await _port(db_session, network, p, host=host)
    await _rule(db_session, "23", RuleType.CRITICAL, description="Telnet is banned")
    await _alert(db_session, network, scan, 23)
    await _rule(
        db_session, "443", RuleType.ACCEPTED, network_id=network.id, ip=IP, description="Web server"
    )
    await _alert(db_session, network, scan, 80)
    await _alert(db_session, network, scan, 8080, dismissed=True, reason="Temporary test")
    # SSH alert on port 22 does not make the port "new".
    await _alert(db_session, network, scan, 22, source="ssh")

    ports = {p["port"]: p for p in await _list(client, viewer_headers)}

    assert {p: ports[p]["status"] for p in ports} == {
        22: "review",
        23: "critical",
        80: "new",
        443: "expected",
        8080: "snoozed",
    }
    assert ports[23]["why"] == "Telnet is banned"
    assert ports[443]["why"] == "Web server"
    assert ports[8080]["why"] == "Temporary test"
    assert ports[22]["why"] is None
    assert ports[80]["alert_id"] is not None
    assert ports[443]["host_id"] == host.id
    assert ports[443]["hostname"] == "web01.example.test"


async def test_why_prefers_port_comment(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    await _port(db_session, network, 443, comment="Customer portal")
    await _rule(db_session, "443", RuleType.ACCEPTED, description="Web server")
    await _alert(db_session, network, scan, 443, dismissed=True, reason="old reason")

    [port] = await _list(client, viewer_headers)

    assert port["status"] == "expected"
    assert port["why"] == "Customer portal"


async def test_rule_without_description_falls_back_to_dismiss_reason(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    await _port(db_session, network, 443)
    await _rule(db_session, "443", RuleType.ACCEPTED, network_id=network.id)
    await _alert(db_session, network, scan, 443, dismissed=True, reason="ok per ticket 42")

    [port] = await _list(client, viewer_headers)

    assert port["why"] == "ok per ticket 42"


async def test_rule_of_other_network_does_not_apply(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    network_factory: NetworkFactory,
    scanner: Scanner,
) -> None:
    network, _scan = network_with_scan
    other = await network_factory.create(scanner, name="Other", cidr="10.9.0.0/24")
    await _port(db_session, network, 443)
    await _rule(db_session, "443", RuleType.ACCEPTED, network_id=other.id, description="x")

    [port] = await _list(client, viewer_headers)

    assert port["status"] == "review"


async def test_status_filter_paginates_after_filtering(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    for p in (21, 22, 23, 24, 25):
        await _port(db_session, network, p)
    await _alert(db_session, network, scan, 22)
    await _alert(db_session, network, scan, 25)

    first = await _list(client, viewer_headers, status="new", limit=1, offset=0)
    second = await _list(client, viewer_headers, status="new", limit=1, offset=1)
    review = await _list(client, viewer_headers, status="review")

    assert [p["port"] for p in first] == [22]
    assert [p["port"] for p in second] == [25]
    assert [p["port"] for p in review] == [21, 23, 24]


async def test_status_filter_rejects_unknown_value(
    client: AsyncClient, viewer_headers: dict[str, str]
) -> None:
    resp = await client.get(
        "/api/global-ports", headers=viewer_headers, params={"status": "bogus"}
    )
    assert resp.status_code == 422


async def test_network_filter_paginates_after_filtering(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
    network_factory: NetworkFactory,
    scanner: Scanner,
) -> None:
    network, _scan = network_with_scan
    other = await network_factory.create(scanner, name="Other", cidr="10.9.0.0/24")
    for p in (21, 22, 23):
        await _port(db_session, network, p)
    for p in (24, 25):
        await _port(db_session, other, p)

    page = await _list(client, viewer_headers, network_id=other.id, limit=1, offset=1)
    in_first = await _list(client, viewer_headers, network_id=network.id)
    unknown = await _list(client, viewer_headers, network_id=99999)

    assert [p["port"] for p in page] == [25]
    assert [p["port"] for p in in_first] == [21, 22, 23]
    assert unknown == []


async def test_q_matches_ip_hostname_and_service(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, _scan = network_with_scan
    host = Host(ip="10.1.1.1", hostname="Mail01.Example.test", seen_by_networks=[network.id])
    db_session.add(host)
    await db_session.commit()
    await db_session.refresh(host)
    await _port(db_session, network, 25, ip="10.1.1.1", host=host)
    ssh = await _port(db_session, network, 22, ip="10.2.2.2")
    ssh.service_guess = "OpenSSH"
    await _port(db_session, network, 80, ip="10.3.3.3")
    await db_session.commit()

    def ports(rows: list[dict]) -> list[int]:
        return [r["port"] for r in rows]

    assert ports(await _list(client, viewer_headers, q="10.3.3")) == [80]
    assert ports(await _list(client, viewer_headers, q="mail01")) == [25]
    assert ports(await _list(client, viewer_headers, q="  openssh ")) == [22]
    assert ports(await _list(client, viewer_headers, q="   ")) == [22, 25, 80]
    assert ports(await _list(client, viewer_headers, q="nomatch")) == []


async def test_q_and_network_combine_with_status(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    for p in (22, 80, 443):
        await _port(db_session, network, p)
    await _port(db_session, network, 8080, ip="10.5.5.5")
    await _alert(db_session, network, scan, 80)
    await _alert(db_session, network, scan, 443)

    rows = await _list(
        client, viewer_headers, status="new", q=IP, network_id=network.id, limit=1, offset=1
    )

    assert [r["port"] for r in rows] == [443]


async def test_repeated_status_returns_union_and_paginates(
    client: AsyncClient,
    db_session: AsyncSession,
    viewer_headers: dict[str, str],
    network_with_scan: tuple[Network, Scan],
) -> None:
    network, scan = network_with_scan
    for p in (21, 22, 23, 24):
        await _port(db_session, network, p)
    await _rule(db_session, "21", RuleType.ACCEPTED, description="ftp ok")
    await _alert(db_session, network, scan, 22)
    await _alert(db_session, network, scan, 24, dismissed=True)

    resp = await client.get(
        "/api/global-ports",
        headers=viewer_headers,
        params=[
            ("sort_by", "port"),
            ("sort_dir", "asc"),
            ("status", "new"),
            ("status", "review"),
            ("limit", "1"),
            ("offset", "1"),
        ],
    )
    union = await client.get(
        "/api/global-ports",
        headers=viewer_headers,
        params=[("sort_by", "port"), ("sort_dir", "asc"), ("status", "new"), ("status", "review")],
    )
    bad = await client.get(
        "/api/global-ports", headers=viewer_headers, params=[("status", "new"), ("status", "x")]
    )

    assert [p["port"] for p in resp.json()["ports"]] == [23]
    assert [p["port"] for p in union.json()["ports"]] == [22, 23]
    assert bad.status_code == 422
