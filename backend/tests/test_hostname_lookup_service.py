"""Unit tests for the hostname lookup cache service.

Post-2.3.0 the backend service is storage-only — external API egress
moved to the scanner in the Plan C refactor. These tests cover the
three remaining concerns:

1. Cache read/write — round-trips through ``HostnameLookup`` rows,
   including expiry, no_results vs miss disambiguation, and upsert
   overwrite of existing rows.
2. Budget — atomic ``consume_budget`` increments, daily-cap blocking,
   per-source isolation, ``pin_budget_exhausted`` semantics.
3. Bulk read helper ``get_hostnames_for_ips`` used by the scanner
   hostnames endpoint to prime nuclei's SNI fan-out.

Source-class parse/fetch tests live scanner-side in
``scanner/tests/test_hostname_sources.py`` since the backend no
longer ships those classes.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import HostnameLookup
from app.services.hostname_lookup import (
    HostnameLookupResult,
    consume_budget,
    get_budget_used,
    get_cached_hostnames,
    get_hostnames_for_ips,
    pin_budget_exhausted,
    upsert_cache_row,
)

# --- Cache read/write ------------------------------------------------


class TestCacheReadWrite:
    async def test_miss_returns_none(self, db_session: AsyncSession) -> None:
        assert await get_cached_hostnames(db_session, "10.0.0.1") is None

    async def test_success_round_trips(self, db_session: AsyncSession) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(
                status="success",
                hostnames=["a.example", "b.example"],
            ),
            source="stub",
        )
        await db_session.commit()

        cached = await get_cached_hostnames(db_session, "10.0.0.1")
        assert cached == ["a.example", "b.example"]

    async def test_no_results_returns_empty_not_none(
        self, db_session: AsyncSession
    ) -> None:
        """Cache hit for no_results is empty list, distinguishable from miss."""
        await upsert_cache_row(
            db_session,
            "10.0.0.2",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="stub",
        )
        await db_session.commit()

        assert await get_cached_hostnames(db_session, "10.0.0.2") == []

    async def test_expired_row_returns_none(
        self, db_session: AsyncSession
    ) -> None:
        row = HostnameLookup(
            ip="10.0.0.3",
            hostnames_json=["stale.example"],
            source="stub",
            status="success",
            queried_at=datetime.utcnow() - timedelta(days=60),
            expires_at=datetime.utcnow() - timedelta(days=10),
        )
        db_session.add(row)
        await db_session.commit()

        assert await get_cached_hostnames(db_session, "10.0.0.3") is None

    async def test_failed_row_returns_none_for_retry(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.4",
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="HTTP 500",
            ),
            source="stub",
        )
        await db_session.commit()

        assert await get_cached_hostnames(db_session, "10.0.0.4") is None

    async def test_upsert_overwrites_existing_row(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.5",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="stub",
        )
        await db_session.commit()

        await upsert_cache_row(
            db_session,
            "10.0.0.5",
            HostnameLookupResult(
                status="success",
                hostnames=["new.example"],
            ),
            source="stub",
        )
        await db_session.commit()

        rows = (
            (
                await db_session.execute(
                    select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.5")
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
        assert rows[0].status == "success"
        assert rows[0].hostnames_json == ["new.example"]


# --- Budget ----------------------------------------------------------


class TestBudget:
    async def test_consume_increments_counter(
        self, db_session: AsyncSession
    ) -> None:
        assert await consume_budget(db_session, "stub", 5) is True
        assert await get_budget_used(db_session, "stub") == 1

    async def test_consume_blocks_once_exhausted(
        self, db_session: AsyncSession
    ) -> None:
        for _ in range(3):
            assert await consume_budget(db_session, "stub", 3) is True
        assert await consume_budget(db_session, "stub", 3) is False
        assert await get_budget_used(db_session, "stub") == 3

    async def test_zero_limit_blocks(self, db_session: AsyncSession) -> None:
        assert await consume_budget(db_session, "stub", 0) is False
        assert await get_budget_used(db_session, "stub") == 0

    async def test_pin_exhausted_sets_counter_to_limit(
        self, db_session: AsyncSession
    ) -> None:
        await consume_budget(db_session, "stub", 20)
        await pin_budget_exhausted(db_session, "stub", 20)
        assert await get_budget_used(db_session, "stub") == 20
        assert await consume_budget(db_session, "stub", 20) is False

    async def test_budgets_are_per_source(
        self, db_session: AsyncSession
    ) -> None:
        for _ in range(3):
            await consume_budget(db_session, "source_a", 3)
        assert await consume_budget(db_session, "source_a", 3) is False
        # source_b has its own fresh counter
        assert await consume_budget(db_session, "source_b", 3) is True


# --- get_hostnames_for_ips (bulk cache read for the scanner) --------


class TestGetHostnamesForIps:
    async def test_empty_input_returns_empty_dict(
        self, db_session: AsyncSession
    ) -> None:
        assert await get_hostnames_for_ips(db_session, []) == {}

    async def test_miss_is_absent_from_result(
        self, db_session: AsyncSession
    ) -> None:
        result = await get_hostnames_for_ips(db_session, ["10.0.0.1"])
        assert "10.0.0.1" not in result
        assert result == {}

    async def test_returns_cached_hostnames(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.10",
            HostnameLookupResult(
                status="success",
                hostnames=["a.example", "b.example", "c.example"],
            ),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.11",
            HostnameLookupResult(
                status="success",
                hostnames=["d.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        result = await get_hostnames_for_ips(
            db_session, ["10.0.0.10", "10.0.0.11", "10.0.0.99"]
        )
        assert result == {
            "10.0.0.10": ["a.example", "b.example", "c.example"],
            "10.0.0.11": ["d.example"],
        }
        # Un-cached IP is simply absent.
        assert "10.0.0.99" not in result

    async def test_skips_empty_hostname_lists(
        self, db_session: AsyncSession
    ) -> None:
        """no_results rows exist in the cache but have no hostnames;
        the bulk helper should not include them in the map."""
        await upsert_cache_row(
            db_session,
            "10.0.0.20",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="hackertarget",
        )
        await db_session.commit()

        result = await get_hostnames_for_ips(db_session, ["10.0.0.20"])
        assert result == {}

    async def test_skips_failed_rows(self, db_session: AsyncSession) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.30",
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="HTTP 500",
            ),
            source="hackertarget",
        )
        await db_session.commit()

        assert await get_hostnames_for_ips(db_session, ["10.0.0.30"]) == {}

    async def test_skips_expired_rows(
        self, db_session: AsyncSession
    ) -> None:
        row = HostnameLookup(
            ip="10.0.0.40",
            hostnames_json=["stale.example"],
            source="hackertarget",
            status="success",
            queried_at=datetime.utcnow() - timedelta(days=60),
            expires_at=datetime.utcnow() - timedelta(days=10),
        )
        db_session.add(row)
        await db_session.commit()

        assert await get_hostnames_for_ips(db_session, ["10.0.0.40"]) == {}
