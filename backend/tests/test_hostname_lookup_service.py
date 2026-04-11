"""Unit tests for the hostname lookup cache service.

Covers three layers independently:
1. ``HackerTargetSource.parse`` — response-body classification, purely
   synchronous, no HTTP mocking needed.
2. Cache read/write — round-trips through ``HostnameLookup`` rows,
   including expiry, no_results vs miss disambiguation, and upsert
   overwrite of existing rows.
3. Budget + high-level ``lookup_with_cache`` — cache-hit shortcut,
   cache-miss fetch + write, budget exhaustion, source-side rate-limit
   pinning.

Source fetches are tested via a ``_StubSource`` that implements the
``HostnameLookupSource`` protocol without any network I/O, plus a
subclass of ``HackerTargetSource`` that overrides ``_fetch_text`` so
the ``fetch`` -> ``parse`` integration path is exercised once end-to
-end.
"""

from __future__ import annotations

from datetime import datetime, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import HostnameLookup
from app.services.hostname_lookup import (
    HackerTargetSource,
    HostnameLookupResult,
    consume_budget,
    get_budget_used,
    get_cached_hostnames,
    get_hostnames_for_ips,
    lookup_with_cache,
    pin_budget_exhausted,
    upsert_cache_row,
)

# --- Test doubles ----------------------------------------------------


class _StubSource:
    """In-memory HostnameLookupSource for cache/budget tests."""

    def __init__(
        self,
        result: HostnameLookupResult,
        name: str = "stub",
    ) -> None:
        self.name = name
        self._result = result
        self.calls: list[str] = []

    async def fetch(self, ip: str) -> HostnameLookupResult:
        self.calls.append(ip)
        return self._result


# --- HackerTargetSource.parse ---------------------------------------


class TestHackerTargetParse:
    """Pure unit tests on the response-body classifier."""

    def test_parses_real_reverseip_body(self) -> None:
        body = (
            "example.com\n"
            "www.example.com\n"
            "foo.example.com\n"
            "bar.example.com\n"
        )
        result = HackerTargetSource.parse(body)
        assert result.status == "success"
        assert result.hostnames == [
            "example.com",
            "www.example.com",
            "foo.example.com",
            "bar.example.com",
        ]

    def test_deduplicates_preserving_order(self) -> None:
        body = "a.example\nb.example\na.example\nc.example\n"
        result = HackerTargetSource.parse(body)
        assert result.hostnames == ["a.example", "b.example", "c.example"]

    def test_strips_ipv4_literals_from_result_lines(self) -> None:
        body = "a.example\n1.2.3.4\nb.example\n"
        result = HackerTargetSource.parse(body)
        assert result.hostnames == ["a.example", "b.example"]

    def test_empty_body_is_no_results(self) -> None:
        result = HackerTargetSource.parse("")
        assert result.status == "no_results"
        assert result.hostnames == []

    def test_whitespace_only_body_is_no_results(self) -> None:
        result = HackerTargetSource.parse("  \n\n")
        assert result.status == "no_results"

    def test_no_dns_response_is_no_results(self) -> None:
        result = HackerTargetSource.parse("No DNS A records found")
        assert result.status == "no_results"

    def test_api_count_exceeded_is_failed(self) -> None:
        result = HackerTargetSource.parse("error API count exceeded - try later")
        assert result.status == "failed"
        assert "api count exceeded" in (result.error_message or "").lower()

    def test_error_prefix_is_failed(self) -> None:
        result = HackerTargetSource.parse("error check your query")
        assert result.status == "failed"

    def test_error_message_is_capped(self) -> None:
        body = "error " + ("x" * 1000)
        result = HackerTargetSource.parse(body)
        assert result.error_message is not None
        assert len(result.error_message) <= 500


# --- HackerTargetSource.fetch (with network override) --------------


class TestHackerTargetFetch:
    async def test_fetch_wraps_parse(self) -> None:
        """End-to-end fetch path — subclass overrides the transport."""

        class _HappySource(HackerTargetSource):
            async def _fetch_text(self, ip: str) -> str:
                assert ip == "1.2.3.4"
                return "a.example\nb.example\n"

        result = await _HappySource().fetch("1.2.3.4")
        assert result.status == "success"
        assert result.hostnames == ["a.example", "b.example"]

    async def test_http_error_returns_failed(self) -> None:
        class _ExplodingSource(HackerTargetSource):
            async def _fetch_text(self, ip: str) -> str:
                raise httpx.ConnectError("boom")

        result = await _ExplodingSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "boom" in result.error_message

    async def test_http_429_is_failed_with_api_count_marker(self) -> None:
        """HTTP 429 from HackerTarget maps to the budget-pinning marker."""

        class _ThrottledSource(HackerTargetSource):
            async def _fetch_text(self, ip: str) -> str:
                request = httpx.Request("GET", HackerTargetSource.__module__)
                response = httpx.Response(429, request=request, text="")
                raise httpx.HTTPStatusError(
                    "Too Many Requests", request=request, response=response
                )

        result = await _ThrottledSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        # Must contain the "api count exceeded" marker so the service
        # layer's pin-budget logic triggers for both 200-body and 429.
        assert "api count exceeded" in result.error_message.lower()

    async def test_other_http_status_is_failed_without_pin_marker(self) -> None:
        class _ServerErrorSource(HackerTargetSource):
            async def _fetch_text(self, ip: str) -> str:
                request = httpx.Request("GET", HackerTargetSource.__module__)
                response = httpx.Response(500, request=request, text="")
                raise httpx.HTTPStatusError(
                    "Internal Server Error", request=request, response=response
                )

        result = await _ServerErrorSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "500" in result.error_message
        assert "api count exceeded" not in result.error_message.lower()


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


# --- lookup_with_cache high-level path ------------------------------


class TestLookupWithCache:
    async def test_cache_hit_short_circuits_source(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.10",
            HostnameLookupResult(
                status="success",
                hostnames=["cached.example"],
            ),
            source="stub",
        )
        await db_session.commit()

        source = _StubSource(
            HostnameLookupResult(
                status="success",
                hostnames=["fresh.example"],
            )
        )
        result = await lookup_with_cache(
            db_session, source, "10.0.0.10", daily_limit=20
        )

        assert result == ["cached.example"]
        assert source.calls == []
        assert await get_budget_used(db_session, "stub") == 0

    async def test_cache_miss_calls_source_and_writes_cache(
        self, db_session: AsyncSession
    ) -> None:
        source = _StubSource(
            HostnameLookupResult(
                status="success",
                hostnames=["a.example", "b.example"],
            )
        )

        result = await lookup_with_cache(
            db_session, source, "10.0.0.11", daily_limit=20
        )

        assert result == ["a.example", "b.example"]
        assert source.calls == ["10.0.0.11"]
        assert await get_cached_hostnames(db_session, "10.0.0.11") == [
            "a.example",
            "b.example",
        ]
        assert await get_budget_used(db_session, "stub") == 1

    async def test_no_results_response_is_cached(
        self, db_session: AsyncSession
    ) -> None:
        source = _StubSource(
            HostnameLookupResult(status="no_results", hostnames=[])
        )
        result = await lookup_with_cache(
            db_session, source, "10.0.0.12", daily_limit=20
        )

        assert result == []
        # The second call must hit cache (no second source call).
        source2 = _StubSource(
            HostnameLookupResult(
                status="success",
                hostnames=["should.not.see.example"],
            ),
            name="stub",
        )
        assert (
            await lookup_with_cache(db_session, source2, "10.0.0.12", daily_limit=20)
            == []
        )
        assert source2.calls == []

    async def test_expired_budget_returns_empty_without_source_call(
        self, db_session: AsyncSession
    ) -> None:
        await pin_budget_exhausted(db_session, "stub", 20)
        source = _StubSource(
            HostnameLookupResult(
                status="success",
                hostnames=["wont.reach.example"],
            )
        )

        result = await lookup_with_cache(
            db_session, source, "10.0.0.13", daily_limit=20
        )

        assert result == []
        assert source.calls == []
        # Cache untouched
        assert await get_cached_hostnames(db_session, "10.0.0.13") is None

    async def test_source_api_count_exceeded_pins_budget(
        self, db_session: AsyncSession
    ) -> None:
        source = _StubSource(
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="API count exceeded - try again later",
            )
        )

        result = await lookup_with_cache(
            db_session, source, "10.0.0.14", daily_limit=20
        )

        assert result == []
        # Budget pinned so a second IP in the same run skips the source.
        assert await get_budget_used(db_session, "stub") == 20
        source2 = _StubSource(
            HostnameLookupResult(
                status="success",
                hostnames=["another.example"],
            )
        )
        assert (
            await lookup_with_cache(db_session, source2, "10.0.0.15", daily_limit=20)
            == []
        )
        assert source2.calls == []

    async def test_generic_failure_does_not_pin_budget(
        self, db_session: AsyncSession
    ) -> None:
        source = _StubSource(
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="HTTP error: timeout",
            )
        )
        await lookup_with_cache(db_session, source, "10.0.0.16", daily_limit=20)

        # One unit consumed, 19 still available.
        assert await get_budget_used(db_session, "stub") == 1


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
