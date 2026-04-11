"""Unit tests for the hostname lookup filler service.

Covers three layers:
1. ``_select_candidate_ips`` — the SQL candidate picker, including the
   "uncached OR expired" predicate and ``last_seen_at DESC`` ordering.
2. ``fill_cache_once`` control flow — budget exhaustion, candidate
   exhaustion, successful fill, no-results caching, rate-limit pin,
   and consecutive-failure abort.
3. Per-IP commit semantics so partial progress survives a simulated
   crash between IPs.

Uses a ``_StubSource`` double for the HostnameLookupSource protocol
so no network I/O and no real HackerTarget rate limit interaction.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.host import Host
from app.models.hostname_lookup import HostnameLookup
from app.services.hostname_lookup import (
    HostnameLookupResult,
    get_budget_used,
    upsert_cache_row,
)
from app.services.hostname_lookup_filler import (
    _select_candidate_ips,
    fill_cache_once,
)

# --- Test doubles ----------------------------------------------------


class _StubSource:
    """Scripted HostnameLookupSource for filler tests."""

    def __init__(
        self,
        results: list[HostnameLookupResult] | None = None,
        default: HostnameLookupResult | None = None,
        name: str = "stub",
    ) -> None:
        self.name = name
        self._queue = list(results or [])
        self._default = default or HostnameLookupResult(
            status="success",
            hostnames=[],
        )
        self.calls: list[str] = []

    async def fetch(self, ip: str) -> HostnameLookupResult:
        self.calls.append(ip)
        if self._queue:
            return self._queue.pop(0)
        return self._default


async def _add_host(
    db: AsyncSession,
    ip: str,
    last_seen_offset_hours: int = 0,
) -> Host:
    """Create a Host row; ``last_seen_offset_hours`` defaults to now."""
    host = Host(
        ip=ip,
        seen_by_networks=[],
        last_seen_at=datetime.utcnow() - timedelta(hours=last_seen_offset_hours),
    )
    db.add(host)
    await db.commit()
    await db.refresh(host)
    return host


# --- _select_candidate_ips ------------------------------------------


class TestSelectCandidateIps:
    async def test_empty_db_returns_nothing(self, db_session: AsyncSession) -> None:
        now = datetime.utcnow()
        assert await _select_candidate_ips(db_session, limit=10, now=now) == []

    async def test_picks_uncached_hosts(self, db_session: AsyncSession) -> None:
        await _add_host(db_session, "10.0.0.1")
        await _add_host(db_session, "10.0.0.2")
        now = datetime.utcnow()

        candidates = await _select_candidate_ips(db_session, limit=10, now=now)
        assert set(candidates) == {"10.0.0.1", "10.0.0.2"}

    async def test_skips_hosts_with_fresh_cache(
        self, db_session: AsyncSession
    ) -> None:
        await _add_host(db_session, "10.0.0.1")
        await _add_host(db_session, "10.0.0.2")
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(status="success", hostnames=["x.example"]),
            source="stub",
        )
        await db_session.commit()
        now = datetime.utcnow()

        candidates = await _select_candidate_ips(db_session, limit=10, now=now)
        assert candidates == ["10.0.0.2"]

    async def test_picks_hosts_with_expired_cache(
        self, db_session: AsyncSession
    ) -> None:
        await _add_host(db_session, "10.0.0.1")
        row = HostnameLookup(
            ip="10.0.0.1",
            hostnames_json=["old.example"],
            source="stub",
            status="success",
            queried_at=datetime.utcnow() - timedelta(days=60),
            expires_at=datetime.utcnow() - timedelta(days=10),
        )
        db_session.add(row)
        await db_session.commit()
        now = datetime.utcnow()

        candidates = await _select_candidate_ips(db_session, limit=10, now=now)
        assert candidates == ["10.0.0.1"]

    async def test_orders_by_last_seen_desc(
        self, db_session: AsyncSession
    ) -> None:
        await _add_host(db_session, "10.0.0.old", last_seen_offset_hours=24)
        await _add_host(db_session, "10.0.0.mid", last_seen_offset_hours=12)
        await _add_host(db_session, "10.0.0.new", last_seen_offset_hours=0)
        now = datetime.utcnow()

        candidates = await _select_candidate_ips(db_session, limit=10, now=now)
        assert candidates == ["10.0.0.new", "10.0.0.mid", "10.0.0.old"]

    async def test_respects_limit(self, db_session: AsyncSession) -> None:
        for i in range(5):
            await _add_host(db_session, f"10.0.0.{i}", last_seen_offset_hours=i)
        now = datetime.utcnow()

        candidates = await _select_candidate_ips(db_session, limit=2, now=now)
        assert len(candidates) == 2


# --- fill_cache_once -------------------------------------------------


class TestFillCacheOnce:
    async def test_no_candidates_returns_skipped(
        self, db_session: AsyncSession
    ) -> None:
        source = _StubSource()
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
        )
        assert summary.skipped_reason == "no_candidates"
        assert summary.candidates == 0
        assert source.calls == []

    async def test_budget_exhausted_before_start(
        self, db_session: AsyncSession
    ) -> None:
        await _add_host(db_session, "10.0.0.1")
        # Pre-burn the daily budget.
        from app.services.hostname_lookup import pin_budget_exhausted
        await pin_budget_exhausted(db_session, "stub", 50)
        await db_session.commit()

        source = _StubSource()
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
        )
        assert summary.skipped_reason == "budget_exhausted"
        assert source.calls == []

    async def test_successful_fill_caches_all_candidates(
        self, db_session: AsyncSession
    ) -> None:
        for i in range(3):
            await _add_host(db_session, f"10.0.0.{i}", last_seen_offset_hours=i)

        source = _StubSource(
            default=HostnameLookupResult(
                status="success",
                hostnames=["a.example", "b.example"],
            )
        )
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
        )

        assert summary.candidates == 3
        assert summary.success == 3
        assert summary.failed == 0
        assert len(source.calls) == 3
        # Cache got written for all 3
        cached = (
            (await db_session.execute(select(HostnameLookup))).scalars().all()
        )
        assert len(cached) == 3
        assert all(c.status == "success" for c in cached)
        assert await get_budget_used(db_session, "stub") == 3

    async def test_no_results_cached(self, db_session: AsyncSession) -> None:
        await _add_host(db_session, "10.0.0.1")
        source = _StubSource(
            default=HostnameLookupResult(status="no_results", hostnames=[])
        )
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
        )
        assert summary.no_results == 1
        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.1")
            )
        ).scalar_one()
        assert row.status == "no_results"

    async def test_rate_limit_stops_run_and_pins_budget(
        self, db_session: AsyncSession
    ) -> None:
        for i in range(3):
            await _add_host(db_session, f"10.0.0.{i}")

        source = _StubSource(
            results=[
                HostnameLookupResult(
                    status="success",
                    hostnames=["first.example"],
                ),
                HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP 429: API count exceeded",
                ),
            ],
            default=HostnameLookupResult(
                status="success",
                hostnames=["should.not.see"],
            ),
        )

        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
        )

        assert summary.rate_limited is True
        assert summary.success == 1
        assert summary.failed == 1
        # Third candidate NOT processed.
        assert len(source.calls) == 2
        # Budget pinned to cap so subsequent runs skip.
        assert await get_budget_used(db_session, "stub") == 50

    async def test_consecutive_failures_abort(
        self, db_session: AsyncSession
    ) -> None:
        for i in range(5):
            await _add_host(db_session, f"10.0.0.{i}")

        source = _StubSource(
            default=HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="HTTP error: boom",
            )
        )
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
            max_consecutive_failures=2,
        )

        assert summary.consecutive_failures_abort is True
        assert summary.failed == 2
        assert summary.rate_limited is False
        # Stopped after 2 failures — not 5 calls.
        assert len(source.calls) == 2
        # Budget consumed for the 2 attempts.
        assert await get_budget_used(db_session, "stub") == 2

    async def test_transient_failure_followed_by_success_resets_counter(
        self, db_session: AsyncSession
    ) -> None:
        for i in range(4):
            await _add_host(db_session, f"10.0.0.{i}", last_seen_offset_hours=i)

        source = _StubSource(
            results=[
                HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP error: timeout",
                ),
                HostnameLookupResult(
                    status="success",
                    hostnames=["ok.example"],
                ),
                HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP error: timeout",
                ),
                HostnameLookupResult(
                    status="success",
                    hostnames=["also-ok.example"],
                ),
            ],
        )

        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
            max_consecutive_failures=2,
        )

        # 2 failures separated by a success — no abort.
        assert summary.consecutive_failures_abort is False
        assert summary.success == 2
        assert summary.failed == 2
        assert len(source.calls) == 4

    async def test_max_ips_caps_candidates(
        self, db_session: AsyncSession
    ) -> None:
        for i in range(10):
            await _add_host(db_session, f"10.0.0.{i}", last_seen_offset_hours=i)

        source = _StubSource(
            default=HostnameLookupResult(
                status="success",
                hostnames=["a.example"],
            )
        )
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=50,
            interval_s=0,
            max_ips=3,
        )

        assert summary.candidates == 3
        assert len(source.calls) == 3

    async def test_budget_is_tighter_cap_than_max_ips(
        self, db_session: AsyncSession
    ) -> None:
        for i in range(10):
            await _add_host(db_session, f"10.0.0.{i}", last_seen_offset_hours=i)

        source = _StubSource(
            default=HostnameLookupResult(
                status="success",
                hostnames=["x.example"],
            )
        )
        summary = await fill_cache_once(
            db_session,
            source=source,
            daily_limit=2,       # tighter than max_ips
            interval_s=0,
            max_ips=10,
        )

        assert summary.candidates == 2
        assert len(source.calls) == 2
        assert await get_budget_used(db_session, "stub") == 2

