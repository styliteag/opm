"""POST /api/nse/scan: manual network scan with a chosen NSE profile."""

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.network import Network
from app.models.nse_template import NseTemplate
from app.models.scan import Scan, ScanStatus


async def _profile(db_session: AsyncSession) -> NseTemplate:
    profile = NseTemplate(name="Quick vulns", nse_scripts=["ssl-heartbleed"])
    db_session.add(profile)
    await db_session.commit()
    await db_session.refresh(profile)
    return profile


async def test_nse_scan_stores_profile_on_planned_scan(
    client: AsyncClient,
    db_session: AsyncSession,
    operator_headers: dict[str, str],
    network: Network,
) -> None:
    profile = await _profile(db_session)

    resp = await client.post(
        "/api/nse/scan",
        headers=operator_headers,
        json={"network_id": network.id, "template_id": profile.id},
    )

    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["template_id"] == profile.id
    scan = (await db_session.execute(select(Scan).where(Scan.id == body["scan_id"]))).scalar_one()
    assert scan.nse_template_id == profile.id
    assert scan.status == ScanStatus.PLANNED
    assert scan.target_ip is None


async def test_nse_scan_unknown_profile_or_network(
    client: AsyncClient,
    operator_headers: dict[str, str],
    network: Network,
) -> None:
    unknown_profile = await client.post(
        "/api/nse/scan",
        headers=operator_headers,
        json={"network_id": network.id, "template_id": 99999},
    )
    unknown_network = await client.post(
        "/api/nse/scan",
        headers=operator_headers,
        json={"network_id": 99999, "template_id": 1},
    )
    assert unknown_profile.status_code == 400
    assert unknown_network.status_code == 400


async def test_nse_scan_requires_operator(
    client: AsyncClient, viewer_headers: dict[str, str]
) -> None:
    body = {"network_id": 1, "template_id": 1}
    assert (await client.post("/api/nse/scan", json=body)).status_code == 401
    assert (
        await client.post("/api/nse/scan", headers=viewer_headers, json=body)
    ).status_code == 403


async def test_network_scan_without_body_still_works(
    client: AsyncClient,
    operator_headers: dict[str, str],
    network: Network,
) -> None:
    resp = await client.post(f"/api/networks/{network.id}/scan", headers=operator_headers)
    assert resp.status_code == 201
