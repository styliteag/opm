"""Alert CSV/PDF export honours queue_state and policy_state like the list API."""

import csv
import io

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.alert import Alert, AlertType
from app.models.alert_rule import AlertRule, RuleType
from app.models.network import Network
from app.models.scan import Scan
from app.routers.alerts.list import _export_status_label
from app.services.alert_policy import NO_POLICY, POLICY_ALLOWED_GLOBAL, PolicyState

CSV = "/api/alerts/export/csv"
PDF = "/api/alerts/export/pdf"


@pytest.fixture
async def alerts(
    db_session: AsyncSession, network_with_scan: tuple[Network, Scan]
) -> dict[str, Alert]:
    """open (10.0.0.1), snoozed = dismissed without rule (10.0.0.2),
    expected = dismissed + accepted rule (10.0.0.3)."""
    network, scan = network_with_scan
    rows = {
        "open": Alert(ip="10.0.0.1", dismissed=False),
        "snoozed": Alert(ip="10.0.0.2", dismissed=True),
        "expected": Alert(ip="10.0.0.3", dismissed=True),
    }
    for alert in rows.values():
        alert.scan_id = scan.id
        alert.network_id = network.id
        alert.alert_type = AlertType.NEW_PORT
        alert.source = "port"
        alert.port = 80
        alert.message = "m"
        db_session.add(alert)
    db_session.add(
        AlertRule(
            network_id=network.id,
            source="port",
            rule_type=RuleType.ACCEPTED,
            match_criteria={"ip": "10.0.0.3", "port": "80"},
        )
    )
    await db_session.commit()
    return rows


async def _csv_ips(client: AsyncClient, headers: dict[str, str], **params: str) -> set[str]:
    resp = await client.get(CSV, headers=headers, params=params)
    assert resp.status_code == 200, resp.text
    reader = csv.reader(io.StringIO(resp.text))
    next(reader)
    return {row[1] for row in reader if row}


async def test_export_policy_state_separates_expected_from_snoozed(
    client: AsyncClient, viewer_headers: dict[str, str], alerts: dict[str, Alert]
) -> None:
    allowed = await _csv_ips(client, viewer_headers, policy_state="allowed")
    allowed_network = await _csv_ips(client, viewer_headers, policy_state="allowed_network")
    snoozed = await _csv_ips(
        client, viewer_headers, queue_state="out_of_inbox", policy_state="none"
    )

    assert allowed == {"10.0.0.3"}
    assert allowed_network == {"10.0.0.3"}
    assert snoozed == {"10.0.0.2"}


async def test_export_queue_state(
    client: AsyncClient, viewer_headers: dict[str, str], alerts: dict[str, Alert]
) -> None:
    assert await _csv_ips(client, viewer_headers, queue_state="inbox") == {"10.0.0.1"}
    assert await _csv_ips(client, viewer_headers, queue_state="out_of_inbox") == {
        "10.0.0.2",
        "10.0.0.3",
    }


async def test_export_dismissed_still_works(
    client: AsyncClient, viewer_headers: dict[str, str], alerts: dict[str, Alert]
) -> None:
    assert await _csv_ips(client, viewer_headers, dismissed="true") == {"10.0.0.2", "10.0.0.3"}
    assert await _csv_ips(client, viewer_headers) == {"10.0.0.1", "10.0.0.2", "10.0.0.3"}


@pytest.mark.parametrize("url", [CSV, PDF])
async def test_export_rejects_conflicts_and_bad_values(
    client: AsyncClient, viewer_headers: dict[str, str], url: str
) -> None:
    conflict = await client.get(
        url, headers=viewer_headers, params={"queue_state": "inbox", "dismissed": "true"}
    )
    bad = await client.get(url, headers=viewer_headers, params={"policy_state": "maybe"})
    assert conflict.status_code == 400
    assert bad.status_code == 422


async def test_pdf_export_accepts_policy_filters(
    client: AsyncClient, viewer_headers: dict[str, str], alerts: dict[str, Alert]
) -> None:
    resp = await client.get(
        PDF, headers=viewer_headers, params={"queue_state": "out_of_inbox", "policy_state": "none"}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"


async def test_csv_status_column_uses_v4_wording(
    client: AsyncClient, viewer_headers: dict[str, str], alerts: dict[str, Alert]
) -> None:
    resp = await client.get(CSV, headers=viewer_headers)
    reader = csv.reader(io.StringIO(resp.text))
    header = next(reader)
    status_col = header.index("Status")
    by_ip = {row[1]: row[status_col] for row in reader if row}

    assert by_ip == {"10.0.0.1": "Open", "10.0.0.2": "Snoozed", "10.0.0.3": "Expected"}


def test_export_status_label() -> None:
    allowed = PolicyState(POLICY_ALLOWED_GLOBAL, 1, "global")
    assert _export_status_label(False, allowed) == "Open"
    assert _export_status_label(True, allowed) == "Expected"
    assert _export_status_label(True, NO_POLICY) == "Snoozed"
    assert _export_status_label(False, NO_POLICY) == "Open"
