"""Tests for the scanner-side hostname cache read endpoint.

``GET /api/scanner/hostnames?ips=a,b,c`` is called by the scanner
between the port_scan phase and the nuclei phase when the network has
``nuclei_sni_enabled=true``. It should return a ``{ip: [hostnames]}``
map drawn from the fresh, non-failed entries in
``hostname_lookup_cache``.
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.hostname_lookup import HostnameLookupResult, upsert_cache_row


class TestScannerHostnamesEndpoint:
    async def test_requires_scanner_auth(
        self, client: AsyncClient
    ) -> None:
        response = await client.get("/api/scanner/hostnames?ips=10.0.0.1")
        assert response.status_code in (401, 403)

    async def test_admin_auth_is_rejected(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        """Admin JWTs don't have the 'scanner' scope and must be refused."""
        response = await client.get(
            "/api/scanner/hostnames?ips=10.0.0.1", headers=admin_headers
        )
        assert response.status_code in (401, 403)

    async def test_empty_ips_returns_empty_map(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        response = await client.get(
            "/api/scanner/hostnames?ips=", headers=scanner_headers
        )
        assert response.status_code == 200
        assert response.json() == {"hostnames": {}}

    async def test_returns_cached_hostnames_for_ips(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(
                status="success",
                hostnames=["a.example", "b.example"],
            ),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.2",
            HostnameLookupResult(
                status="success",
                hostnames=["c.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostnames?ips=10.0.0.1,10.0.0.2,10.0.0.99",
            headers=scanner_headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["hostnames"] == {
            "10.0.0.1": ["a.example", "b.example"],
            "10.0.0.2": ["c.example"],
        }
        # Un-cached IP is silently absent — scanner falls back to IP:PORT.
        assert "10.0.0.99" not in body["hostnames"]

    async def test_trims_whitespace_and_skips_empty_tokens(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.5",
            HostnameLookupResult(
                status="success",
                hostnames=["w.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostnames?ips=,10.0.0.5  ,,",
            headers=scanner_headers,
        )
        assert response.status_code == 200
        assert response.json()["hostnames"] == {"10.0.0.5": ["w.example"]}

    async def test_no_results_rows_are_omitted(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        """no_results rows serve as 'do not re-query' markers, not as
        real cache content — they must not appear in the scanner map."""
        await upsert_cache_row(
            db_session,
            "10.0.0.7",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostnames?ips=10.0.0.7", headers=scanner_headers
        )
        assert response.status_code == 200
        assert response.json() == {"hostnames": {}}
