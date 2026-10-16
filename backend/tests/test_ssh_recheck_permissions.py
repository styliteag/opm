"""POST /api/ssh/hosts/{ip}/recheck starts a scan — operator+ only."""

from httpx import AsyncClient

URL = "/api/ssh/hosts/10.0.0.77/recheck"


async def test_recheck_requires_auth(client: AsyncClient) -> None:
    assert (await client.post(URL)).status_code == 401


async def test_recheck_forbidden_for_viewer(
    client: AsyncClient, viewer_headers: dict[str, str]
) -> None:
    assert (await client.post(URL, headers=viewer_headers)).status_code == 403


async def test_recheck_allowed_for_operator(
    client: AsyncClient, operator_headers: dict[str, str]
) -> None:
    # Unknown host -> 404 proves the operator passed the auth gate.
    assert (await client.post(URL, headers=operator_headers)).status_code == 404
