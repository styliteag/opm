"""Tests for get_hostname_cache_status service + include_expired endpoint.

Verifies that the cache pre-flight correctly categorizes IPs into fresh
(with hostnames), fresh (no_results), expired, and unknown buckets — so
the scanner can skip already-cached IPs and log why each remaining IP
is queried.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import HostnameLookup
from app.services.hostname_lookup import (
    HostnameLookupResult,
    get_hostname_cache_status,
    upsert_cache_row,
)


# ── Service: get_hostname_cache_status ──────────────────────────────


class TestGetHostnameCacheStatus:
    async def test_empty_input_returns_empty(
        self, db_session: AsyncSession
    ) -> None:
        result = await get_hostname_cache_status(db_session, [])
        assert result.fresh == {}
        assert result.expired_ips == []

    async def test_fresh_success_appears_in_fresh(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(status="success", hostnames=["a.example"]),
            source="hackertarget",
        )
        await db_session.commit()

        result = await get_hostname_cache_status(db_session, ["10.0.0.1"])
        assert result.fresh == {"10.0.0.1": ["a.example"]}
        assert result.expired_ips == []

    async def test_fresh_no_results_appears_in_fresh_with_empty_list(
        self, db_session: AsyncSession
    ) -> None:
        """A no_results row that hasn't expired should still be 'fresh'
        with an empty hostname list — so the scanner skips re-querying."""
        await upsert_cache_row(
            db_session,
            "10.0.0.2",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="hackertarget",
        )
        await db_session.commit()

        result = await get_hostname_cache_status(db_session, ["10.0.0.2"])
        assert "10.0.0.2" in result.fresh
        assert result.fresh["10.0.0.2"] == []
        assert result.expired_ips == []

    async def test_expired_row_appears_in_expired_ips(
        self, db_session: AsyncSession
    ) -> None:
        """A row past its expires_at should land in expired_ips."""
        await upsert_cache_row(
            db_session,
            "10.0.0.3",
            HostnameLookupResult(status="success", hostnames=["old.example"]),
            source="hackertarget",
        )
        await db_session.commit()

        # Manually expire the row.
        row = (
            await db_session.execute(
                HostnameLookup.__table__.select().where(
                    HostnameLookup.ip == "10.0.0.3"
                )
            )
        ).first()
        assert row is not None
        await db_session.execute(
            HostnameLookup.__table__.update()
            .where(HostnameLookup.ip == "10.0.0.3")
            .values(expires_at=datetime.utcnow() - timedelta(hours=1))
        )
        await db_session.commit()

        result = await get_hostname_cache_status(db_session, ["10.0.0.3"])
        assert result.fresh == {}
        assert "10.0.0.3" in result.expired_ips

    async def test_failed_row_appears_in_expired_ips(
        self, db_session: AsyncSession
    ) -> None:
        """Failed rows (even if not past TTL) are treated as expired
        since status='failed' is filtered out by the is_fresh check."""
        await upsert_cache_row(
            db_session,
            "10.0.0.4",
            HostnameLookupResult(
                status="failed", hostnames=[], error_message="timeout"
            ),
            source="hackertarget",
        )
        await db_session.commit()

        result = await get_hostname_cache_status(db_session, ["10.0.0.4"])
        assert result.fresh == {}
        assert "10.0.0.4" in result.expired_ips

    async def test_unknown_ip_absent_from_both(
        self, db_session: AsyncSession
    ) -> None:
        """An IP with no cache row should not appear in fresh or expired."""
        result = await get_hostname_cache_status(db_session, ["10.99.99.99"])
        assert result.fresh == {}
        assert result.expired_ips == []

    async def test_mixed_ips_categorized_correctly(
        self, db_session: AsyncSession
    ) -> None:
        """Mix of fresh, expired, and unknown IPs in a single query."""
        # Fresh success
        await upsert_cache_row(
            db_session,
            "10.0.1.1",
            HostnameLookupResult(status="success", hostnames=["fresh.example"]),
            source="hackertarget",
        )
        # Fresh no_results
        await upsert_cache_row(
            db_session,
            "10.0.1.2",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="rapiddns",
        )
        # Will be expired
        await upsert_cache_row(
            db_session,
            "10.0.1.3",
            HostnameLookupResult(status="success", hostnames=["old.example"]),
            source="hackertarget",
        )
        await db_session.commit()

        # Expire 10.0.1.3
        await db_session.execute(
            HostnameLookup.__table__.update()
            .where(HostnameLookup.ip == "10.0.1.3")
            .values(expires_at=datetime.utcnow() - timedelta(hours=1))
        )
        await db_session.commit()

        result = await get_hostname_cache_status(
            db_session,
            ["10.0.1.1", "10.0.1.2", "10.0.1.3", "10.0.1.99"],
        )

        # Fresh with hostnames
        assert result.fresh["10.0.1.1"] == ["fresh.example"]
        # Fresh no_results
        assert result.fresh["10.0.1.2"] == []
        # Expired
        assert "10.0.1.3" in result.expired_ips
        # Unknown — absent from both
        assert "10.0.1.99" not in result.fresh
        assert "10.0.1.99" not in result.expired_ips


# ── Endpoint: include_expired=true ──────────────────────────────────


class TestScannerHostnamesIncludeExpired:
    async def test_include_expired_returns_expired_ips(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        # Fresh row
        await upsert_cache_row(
            db_session,
            "10.0.2.1",
            HostnameLookupResult(status="success", hostnames=["ok.example"]),
            source="hackertarget",
        )
        # Will be expired
        await upsert_cache_row(
            db_session,
            "10.0.2.2",
            HostnameLookupResult(
                status="success", hostnames=["stale.example"]
            ),
            source="hackertarget",
        )
        await db_session.commit()

        # Expire 10.0.2.2
        await db_session.execute(
            HostnameLookup.__table__.update()
            .where(HostnameLookup.ip == "10.0.2.2")
            .values(expires_at=datetime.utcnow() - timedelta(hours=1))
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostnames?ips=10.0.2.1,10.0.2.2,10.0.2.99"
            "&include_expired=true",
            headers=scanner_headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["hostnames"] == {"10.0.2.1": ["ok.example"]}
        assert "10.0.2.2" in body["expired_ips"]
        # Unknown IP absent from both
        assert "10.0.2.99" not in body["hostnames"]
        assert "10.0.2.99" not in body["expired_ips"]

    async def test_without_include_expired_no_expired_ips(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        """Default (include_expired=false) still returns empty expired_ips."""
        await upsert_cache_row(
            db_session,
            "10.0.3.1",
            HostnameLookupResult(status="success", hostnames=["x.example"]),
            source="hackertarget",
        )
        await db_session.commit()

        # Expire the row
        await db_session.execute(
            HostnameLookup.__table__.update()
            .where(HostnameLookup.ip == "10.0.3.1")
            .values(expires_at=datetime.utcnow() - timedelta(hours=1))
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostnames?ips=10.0.3.1",
            headers=scanner_headers,
        )
        assert response.status_code == 200
        body = response.json()
        # Without include_expired, expired row is just absent
        assert body["hostnames"] == {}
        assert body["expired_ips"] == []

    async def test_include_expired_fresh_no_results_in_hostnames(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        """Fresh no_results rows appear in hostnames with empty list
        when include_expired=true, so scanner skips re-querying."""
        await upsert_cache_row(
            db_session,
            "10.0.4.1",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostnames?ips=10.0.4.1&include_expired=true",
            headers=scanner_headers,
        )
        assert response.status_code == 200
        body = response.json()
        assert body["hostnames"] == {"10.0.4.1": []}
        assert body["expired_ips"] == []
