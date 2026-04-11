"""Tests for the scanner-facing hostname results + budget endpoints.

These two endpoints close the loop in the scanner-centric refactor:

- ``GET /api/scanner/hostname-budget`` lets the scanner check daily
  per-source caps before burning quota on HackerTarget / RapidDNS.
- ``POST /api/scanner/hostname-results`` is how the scanner hands its
  enrichment outcomes back to the backend for cache storage,
  post-fact budget accounting, host hostname backfill, and pin-on-
  rate-limit signal handling.

Together they replace the legacy backend filler — the scanner becomes
the only egress point for external hostname APIs and the backend keeps
just storage + observability.
"""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.host import Host
from app.models.hostname_lookup import HostnameLookup, HostnameLookupBudget
from app.services.hostname_lookup import (
    HACKERTARGET_DAILY_LIMIT_ANON,
    apply_scanner_hostname_results,
    consume_budget,
    get_scanner_budget_snapshot,
)

# --- Service: budget snapshot ---------------------------------------


class TestGetScannerBudgetSnapshot:
    async def test_returns_zero_used_when_no_rows(
        self, db_session: AsyncSession
    ) -> None:
        snapshot = await get_scanner_budget_snapshot(db_session)
        sources = {entry.source for entry in snapshot}
        assert sources == {"hackertarget", "rapiddns"}
        for entry in snapshot:
            assert entry.used == 0
            assert entry.remaining == entry.limit

    async def test_reflects_consumed_budget(
        self, db_session: AsyncSession
    ) -> None:
        await consume_budget(db_session, "hackertarget", HACKERTARGET_DAILY_LIMIT_ANON)
        await consume_budget(db_session, "hackertarget", HACKERTARGET_DAILY_LIMIT_ANON)
        await db_session.commit()

        snapshot = await get_scanner_budget_snapshot(db_session)
        ht = next(e for e in snapshot if e.source == "hackertarget")
        assert ht.used == 2
        assert ht.remaining == ht.limit - 2

    async def test_remaining_clamps_to_zero_when_pinned(
        self, db_session: AsyncSession
    ) -> None:
        # Pin via the budget table directly so we don't depend on
        # pin_budget_exhausted's internals.
        row = HostnameLookupBudget(
            source="hackertarget",
            day=__import__("datetime").datetime.utcnow().date(),
            used=999,  # past any sane cap
        )
        db_session.add(row)
        await db_session.commit()

        snapshot = await get_scanner_budget_snapshot(db_session)
        ht = next(e for e in snapshot if e.source == "hackertarget")
        assert ht.remaining == 0


# --- Service: apply scanner results ---------------------------------


class TestApplyScannerHostnameResults:
    async def test_writes_cache_row_and_increments_budget(
        self, db_session: AsyncSession
    ) -> None:
        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[
                (
                    "10.0.0.1",
                    "hackertarget",
                    "success",
                    ["a.example", "b.example"],
                    None,
                )
            ],
        )
        await db_session.commit()

        assert outcome.accepted == 1
        assert outcome.rejected == 0
        assert outcome.cache_rows_written == 1
        assert outcome.hosts_synced == 0
        assert outcome.budget_pinned_sources == []

        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.1")
            )
        ).scalar_one()
        assert row.hostnames_json == ["a.example", "b.example"]
        assert row.source == "hackertarget"
        assert row.status == "success"

        snapshot = await get_scanner_budget_snapshot(db_session)
        ht = next(e for e in snapshot if e.source == "hackertarget")
        assert ht.used == 1

    async def test_no_results_status_writes_empty_row(
        self, db_session: AsyncSession
    ) -> None:
        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[("10.0.0.2", "rapiddns", "no_results", [], None)],
        )
        await db_session.commit()
        assert outcome.cache_rows_written == 1

        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.2")
            )
        ).scalar_one()
        assert row.status == "no_results"
        assert row.hostnames_json == []

    async def test_unknown_source_is_rejected(
        self, db_session: AsyncSession
    ) -> None:
        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[
                ("10.0.0.3", "shodan_paid", "success", ["x.example"], None)
            ],
        )
        await db_session.commit()
        assert outcome.accepted == 0
        assert outcome.rejected == 1
        assert outcome.cache_rows_written == 0

        rows = (
            (
                await db_session.execute(
                    select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.3")
                )
            )
            .scalars()
            .all()
        )
        assert rows == []

    async def test_pins_budget_on_rate_limit_signal(
        self, db_session: AsyncSession
    ) -> None:
        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[
                (
                    "10.0.0.4",
                    "hackertarget",
                    "failed",
                    [],
                    "HTTP 429: API count exceeded",
                ),
                (
                    "10.0.0.5",
                    "hackertarget",
                    "failed",
                    [],
                    "HTTP 429: API count exceeded",
                ),
            ],
        )
        await db_session.commit()

        assert outcome.budget_pinned_sources == ["hackertarget"]

        snapshot = await get_scanner_budget_snapshot(db_session)
        ht = next(e for e in snapshot if e.source == "hackertarget")
        assert ht.remaining == 0

    async def test_backfills_host_hostname_when_empty(
        self, db_session: AsyncSession
    ) -> None:
        host = Host(ip="10.0.0.6", hostname=None, is_pingable=True)
        db_session.add(host)
        await db_session.commit()

        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[
                (
                    "10.0.0.6",
                    "hackertarget",
                    "success",
                    ["primary.example", "secondary.example"],
                    None,
                )
            ],
        )
        await db_session.commit()
        assert outcome.hosts_synced == 1

        await db_session.refresh(host)
        assert host.hostname == "primary.example"

    async def test_does_not_overwrite_existing_host_hostname(
        self, db_session: AsyncSession
    ) -> None:
        host = Host(ip="10.0.0.7", hostname="manual.example", is_pingable=True)
        db_session.add(host)
        await db_session.commit()

        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[
                (
                    "10.0.0.7",
                    "hackertarget",
                    "success",
                    ["primary.example"],
                    None,
                )
            ],
        )
        await db_session.commit()
        assert outcome.hosts_synced == 0

        await db_session.refresh(host)
        assert host.hostname == "manual.example"

    async def test_no_host_sync_for_no_results(
        self, db_session: AsyncSession
    ) -> None:
        host = Host(ip="10.0.0.8", hostname=None, is_pingable=True)
        db_session.add(host)
        await db_session.commit()

        outcome = await apply_scanner_hostname_results(
            db_session,
            results=[("10.0.0.8", "hackertarget", "no_results", [], None)],
        )
        await db_session.commit()
        assert outcome.hosts_synced == 0

        await db_session.refresh(host)
        assert host.hostname is None


# --- Endpoint: GET /api/scanner/hostname-budget ----------------------


class TestScannerBudgetEndpoint:
    async def test_requires_scanner_auth(
        self, client: AsyncClient
    ) -> None:
        response = await client.get("/api/scanner/hostname-budget")
        assert response.status_code in (401, 403)

    async def test_admin_jwt_is_rejected(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.get(
            "/api/scanner/hostname-budget", headers=admin_headers
        )
        assert response.status_code in (401, 403)

    async def test_returns_default_budgets_when_empty(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        response = await client.get(
            "/api/scanner/hostname-budget", headers=scanner_headers
        )
        assert response.status_code == 200
        body = response.json()
        sources = {entry["source"] for entry in body["budgets"]}
        assert sources == {"hackertarget", "rapiddns"}
        for entry in body["budgets"]:
            assert entry["used"] == 0
            assert entry["remaining"] == entry["limit"]

    async def test_reflects_post_consumption(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        # Use the service path so the budget row is created with the
        # same UTC date semantics as the endpoint reads.
        await apply_scanner_hostname_results(
            db_session,
            results=[
                ("10.0.0.10", "hackertarget", "success", ["a.example"], None)
            ],
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostname-budget", headers=scanner_headers
        )
        body = response.json()
        ht = next(e for e in body["budgets"] if e["source"] == "hackertarget")
        assert ht["used"] == 1
        assert ht["remaining"] == ht["limit"] - 1


# --- Endpoint: POST /api/scanner/hostname-results --------------------


class TestScannerResultsEndpoint:
    async def test_requires_scanner_auth(
        self, client: AsyncClient
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-results", json={"results": []}
        )
        assert response.status_code in (401, 403)

    async def test_admin_jwt_is_rejected(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-results",
            headers=admin_headers,
            json={"results": []},
        )
        assert response.status_code in (401, 403)

    async def test_empty_batch_succeeds(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-results",
            headers=scanner_headers,
            json={"results": []},
        )
        assert response.status_code == 200
        body = response.json()
        assert body == {
            "accepted": 0,
            "rejected": 0,
            "cache_rows_written": 0,
            "hosts_synced": 0,
            "budget_pinned_sources": [],
        }

    async def test_writes_multiple_results(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-results",
            headers=scanner_headers,
            json={
                "results": [
                    {
                        "ip": "10.0.0.20",
                        "source": "hackertarget",
                        "status": "success",
                        "hostnames": ["a.example", "b.example"],
                    },
                    {
                        "ip": "10.0.0.21",
                        "source": "rapiddns",
                        "status": "no_results",
                        "hostnames": [],
                    },
                    {
                        "ip": "10.0.0.22",
                        "source": "hackertarget",
                        "status": "failed",
                        "hostnames": [],
                        "error_message": "HTTP 500",
                    },
                ]
            },
        )
        assert response.status_code == 200
        body = response.json()
        assert body["accepted"] == 3
        assert body["rejected"] == 0
        assert body["cache_rows_written"] == 3
        assert body["budget_pinned_sources"] == []

        rows = (
            (await db_session.execute(select(HostnameLookup)))
            .scalars()
            .all()
        )
        by_ip = {r.ip: r for r in rows}
        assert by_ip["10.0.0.20"].status == "success"
        assert by_ip["10.0.0.20"].hostnames_json == ["a.example", "b.example"]
        assert by_ip["10.0.0.21"].status == "no_results"
        assert by_ip["10.0.0.22"].status == "failed"

    async def test_unknown_source_returns_422(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        """Pydantic Literal validation rejects unknown sources before the service runs."""
        response = await client.post(
            "/api/scanner/hostname-results",
            headers=scanner_headers,
            json={
                "results": [
                    {
                        "ip": "10.0.0.30",
                        "source": "shodan_paid",
                        "status": "success",
                        "hostnames": ["x.example"],
                    }
                ]
            },
        )
        assert response.status_code == 422

    async def test_rate_limit_signal_pins_budget(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-results",
            headers=scanner_headers,
            json={
                "results": [
                    {
                        "ip": "10.0.0.40",
                        "source": "hackertarget",
                        "status": "failed",
                        "hostnames": [],
                        "error_message": "API count exceeded — try later",
                    }
                ]
            },
        )
        assert response.status_code == 200
        assert response.json()["budget_pinned_sources"] == ["hackertarget"]

        # GET budget should now show remaining=0 for hackertarget
        budget = (
            await client.get(
                "/api/scanner/hostname-budget", headers=scanner_headers
            )
        ).json()
        ht = next(e for e in budget["budgets"] if e["source"] == "hackertarget")
        assert ht["remaining"] == 0

    async def test_normalises_hostnames(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-results",
            headers=scanner_headers,
            json={
                "results": [
                    {
                        "ip": "10.0.0.50",
                        "source": "hackertarget",
                        "status": "success",
                        "hostnames": [
                            "  a.example  ",
                            "a.example",
                            "",
                            "b.example",
                        ],
                    }
                ]
            },
        )
        assert response.status_code == 200

        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.50")
            )
        ).scalar_one()
        assert row.hostnames_json == ["a.example", "b.example"]
