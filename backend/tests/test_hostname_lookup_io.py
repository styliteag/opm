"""Tests for the hostname lookup cache export/import service + API.

Covers three layers:
1. ``export_cache`` — serialization shape, ordering, full-row coverage
   regardless of status/TTL.
2. ``import_cache`` — skip vs overwrite strategies, new-row insert,
   missing-timestamp backfill via ``_ttl_for_status``, rejected-entry
   accounting, round-trip lossless-ness when paired with ``export``.
3. HTTP endpoints — admin gating, export body shape, import summary
   return, query-param strategy selection, malformed payload
   rejection (wrong format_version).
"""

from __future__ import annotations

from datetime import datetime

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hostname_lookup import HostnameLookup
from app.schemas.hostname_lookup import (
    CacheImportSummary,
    HostnameLookupEntry,
)
from app.services.hostname_lookup import (
    HostnameLookupResult,
    upsert_cache_row,
)
from app.services.hostname_lookup_io import (
    export_cache,
    get_cache_status,
    import_cache,
)

# --- export_cache ----------------------------------------------------


class TestExportCache:
    async def test_empty_cache(self, db_session: AsyncSession) -> None:
        doc = await export_cache(db_session)
        assert doc.format_version == 1
        assert doc.entry_count == 0
        assert doc.entries == []

    async def test_includes_all_statuses(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(
                status="success", hostnames=["a.example", "b.example"]
            ),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.2",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.3",
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="boom",
            ),
            source="hackertarget",
        )
        await db_session.commit()

        doc = await export_cache(db_session)
        assert doc.entry_count == 3
        statuses = {e.status for e in doc.entries}
        assert statuses == {"success", "no_results", "failed"}

    async def test_ordered_by_ip(self, db_session: AsyncSession) -> None:
        for ip in ["10.0.0.3", "10.0.0.1", "10.0.0.2"]:
            await upsert_cache_row(
                db_session,
                ip,
                HostnameLookupResult(status="success", hostnames=[ip]),
                source="hackertarget",
            )
        await db_session.commit()

        doc = await export_cache(db_session)
        assert [e.ip for e in doc.entries] == [
            "10.0.0.1",
            "10.0.0.2",
            "10.0.0.3",
        ]

    async def test_preserves_hostnames_and_metadata(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.42",
            HostnameLookupResult(
                status="success",
                hostnames=["a.example.com", "b.example.com", "c.example.com"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        doc = await export_cache(db_session)
        entry = doc.entries[0]
        assert entry.ip == "10.0.0.42"
        assert entry.hostnames == [
            "a.example.com",
            "b.example.com",
            "c.example.com",
        ]
        assert entry.source == "hackertarget"
        assert entry.status == "success"
        assert entry.queried_at is not None
        assert entry.expires_at is not None


# --- import_cache ----------------------------------------------------


class TestImportCacheSkip:
    async def test_insert_into_empty_cache(
        self, db_session: AsyncSession
    ) -> None:
        entries = [
            HostnameLookupEntry(
                ip="10.0.0.1",
                hostnames=["x.example", "y.example"],
                source="imported",
                status="success",
            ),
            HostnameLookupEntry(
                ip="10.0.0.2",
                hostnames=[],
                source="imported",
                status="no_results",
            ),
        ]

        summary = await import_cache(db_session, entries, strategy="skip")
        await db_session.commit()

        assert summary.total == 2
        assert summary.inserted == 2
        assert summary.skipped == 0
        assert summary.overwritten == 0

        rows = (
            (await db_session.execute(select(HostnameLookup)))
            .scalars()
            .all()
        )
        assert len(rows) == 2

    async def test_skip_preserves_existing(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(
                status="success", hostnames=["existing.example"]
            ),
            source="hackertarget",
        )
        await db_session.commit()

        entries = [
            HostnameLookupEntry(
                ip="10.0.0.1",
                hostnames=["imported.example"],
                source="imported",
                status="success",
            ),
            HostnameLookupEntry(
                ip="10.0.0.2",
                hostnames=["new.example"],
                source="imported",
                status="success",
            ),
        ]

        summary = await import_cache(db_session, entries, strategy="skip")
        await db_session.commit()

        assert summary.inserted == 1
        assert summary.skipped == 1

        row = (
            (
                await db_session.execute(
                    select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.1")
                )
            ).scalar_one()
        )
        # Existing row preserved
        assert row.hostnames_json == ["existing.example"]
        assert row.source == "hackertarget"

    async def test_backfills_missing_timestamps(
        self, db_session: AsyncSession
    ) -> None:
        entries = [
            HostnameLookupEntry(
                ip="10.0.0.5",
                hostnames=["only.example"],
                source="bootstrap",
                status="success",
                # queried_at / expires_at omitted
            ),
        ]

        await import_cache(db_session, entries, strategy="skip")
        await db_session.commit()

        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.5")
            )
        ).scalar_one()
        assert row.queried_at is not None
        assert row.expires_at is not None
        # Success TTL = 30 days → expires must be ~30 days in the future.
        delta = row.expires_at - row.queried_at
        assert 29 <= delta.days <= 30


class TestImportCacheOverwrite:
    async def test_overwrites_existing_row(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(
                status="success", hostnames=["old.example"]
            ),
            source="hackertarget",
        )
        await db_session.commit()

        entries = [
            HostnameLookupEntry(
                ip="10.0.0.1",
                hostnames=["new1.example", "new2.example"],
                source="imported",
                status="success",
            ),
        ]

        summary = await import_cache(db_session, entries, strategy="overwrite")
        await db_session.commit()

        assert summary.overwritten == 1
        assert summary.skipped == 0

        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.1")
            )
        ).scalar_one()
        assert row.hostnames_json == ["new1.example", "new2.example"]
        assert row.source == "imported"


class TestRoundTrip:
    async def test_export_then_import_overwrite_is_lossless(
        self, db_session: AsyncSession
    ) -> None:
        now = datetime.utcnow()
        await upsert_cache_row(
            db_session,
            "10.0.0.100",
            HostnameLookupResult(
                status="success",
                hostnames=["roundtrip.example", "second.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        exported = await export_cache(db_session)
        assert len(exported.entries) == 1

        # Simulate a restore — overwrite the existing row with its own data.
        summary = await import_cache(
            db_session, exported.entries, strategy="overwrite"
        )
        await db_session.commit()
        assert summary.overwritten == 1

        row = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.100")
            )
        ).scalar_one()
        assert row.hostnames_json == ["roundtrip.example", "second.example"]
        # Timestamps survive round-trip (within DB precision).
        assert abs((row.queried_at - now).total_seconds()) < 5


# --- HTTP endpoints --------------------------------------------------


class TestExportEndpoint:
    async def test_export_requires_admin(
        self, client: AsyncClient
    ) -> None:
        response = await client.get("/api/admin/hostname-lookup/export")
        assert response.status_code in (401, 403)

    async def test_export_empty_cache(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.get(
            "/api/admin/hostname-lookup/export", headers=admin_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert body["format_version"] == 1
        assert body["entry_count"] == 0
        assert body["entries"] == []

    async def test_export_returns_stored_entries(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.200",
            HostnameLookupResult(
                status="success",
                hostnames=["api.example", "www.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get(
            "/api/admin/hostname-lookup/export", headers=admin_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert body["entry_count"] == 1
        assert body["entries"][0]["ip"] == "10.0.0.200"
        assert body["entries"][0]["hostnames"] == ["api.example", "www.example"]


class TestImportEndpoint:
    async def test_import_requires_admin(
        self, client: AsyncClient
    ) -> None:
        response = await client.post(
            "/api/admin/hostname-lookup/import",
            json={"format_version": 1, "entries": []},
        )
        assert response.status_code in (401, 403)

    async def test_import_inserts_new_rows(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        payload = {
            "format_version": 1,
            "entries": [
                {
                    "ip": "10.0.0.201",
                    "hostnames": ["from-api.example"],
                    "source": "bootstrap",
                    "status": "success",
                },
            ],
        }
        response = await client.post(
            "/api/admin/hostname-lookup/import",
            headers=admin_headers,
            json=payload,
        )
        assert response.status_code == 200
        summary = CacheImportSummary(**response.json())
        assert summary.inserted == 1
        assert summary.skipped == 0

    async def test_import_rejects_wrong_format_version(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        payload = {
            "format_version": 99,
            "entries": [],
        }
        response = await client.post(
            "/api/admin/hostname-lookup/import",
            headers=admin_headers,
            json=payload,
        )
        assert response.status_code == 422
        detail = response.json()["detail"][0]
        assert "format_version" in str(detail).lower()

    async def test_import_strategy_param_overwrite(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.202",
            HostnameLookupResult(
                status="success", hostnames=["pre.example"]
            ),
            source="hackertarget",
        )
        await db_session.commit()

        payload = {
            "format_version": 1,
            "entries": [
                {
                    "ip": "10.0.0.202",
                    "hostnames": ["post.example"],
                    "source": "bootstrap",
                    "status": "success",
                },
            ],
        }
        response = await client.post(
            "/api/admin/hostname-lookup/import?strategy=overwrite",
            headers=admin_headers,
            json=payload,
        )
        assert response.status_code == 200
        summary = response.json()
        assert summary["overwritten"] == 1
        assert summary["skipped"] == 0

    async def test_import_strategy_param_rejects_unknown(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.post(
            "/api/admin/hostname-lookup/import?strategy=merge",
            headers=admin_headers,
            json={"format_version": 1, "entries": []},
        )
        assert response.status_code == 422


# --- get_cache_status service ---------------------------------------


class TestGetCacheStatus:
    async def test_empty_db_returns_zero_state(
        self, db_session: AsyncSession
    ) -> None:
        status = await get_cache_status(db_session)
        assert status.total_entries == 0
        assert status.entries_by_status.success == 0
        assert status.total_vhosts == 0
        assert status.total_hosts == 0
        assert status.enriched_hosts == 0
        assert status.coverage_percent == 0.0
        assert status.last_queried_at is None
        # HackerTarget budget row always surfaced even when no filler ran.
        assert any(b.source == "hackertarget" for b in status.budgets)

    async def test_counts_by_status_and_vhosts(
        self, db_session: AsyncSession
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.1",
            HostnameLookupResult(
                status="success",
                hostnames=["a.example", "b.example", "c.example"],
            ),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.2",
            HostnameLookupResult(
                status="success",
                hostnames=["d.example"],
            ),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.3",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="hackertarget",
        )
        await upsert_cache_row(
            db_session,
            "10.0.0.4",
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="boom",
            ),
            source="hackertarget",
        )
        await db_session.commit()

        status = await get_cache_status(db_session)
        assert status.total_entries == 4
        assert status.entries_by_status.success == 2
        assert status.entries_by_status.no_results == 1
        assert status.entries_by_status.failed == 1
        assert status.total_vhosts == 4
        assert status.last_queried_at is not None

    async def test_coverage_percent(self, db_session: AsyncSession) -> None:
        from app.models.host import Host

        # 4 hosts total
        for i in range(4):
            host = Host(ip=f"10.0.0.{i + 100}", seen_by_networks=[])
            db_session.add(host)

        # 1 enriched
        await upsert_cache_row(
            db_session,
            "10.0.0.100",
            HostnameLookupResult(
                status="success",
                hostnames=["one.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        status = await get_cache_status(db_session)
        assert status.total_hosts == 4
        assert status.enriched_hosts == 1
        assert status.coverage_percent == 25.0

    async def test_expired_success_row_not_counted_as_enriched(
        self, db_session: AsyncSession
    ) -> None:
        from datetime import datetime, timedelta

        from app.models.host import Host

        host = Host(ip="10.0.0.200", seen_by_networks=[])
        db_session.add(host)

        row = HostnameLookup(
            ip="10.0.0.200",
            hostnames_json=["stale.example"],
            source="hackertarget",
            status="success",
            queried_at=datetime.utcnow() - timedelta(days=60),
            expires_at=datetime.utcnow() - timedelta(days=10),
        )
        db_session.add(row)
        await db_session.commit()

        status = await get_cache_status(db_session)
        # Host counted, but enrichment is stale so coverage is 0%.
        assert status.total_hosts == 1
        assert status.enriched_hosts == 0

    async def test_status_endpoint_returns_payload(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.get(
            "/api/admin/hostname-lookup/status", headers=admin_headers
        )
        assert response.status_code == 200
        body = response.json()
        # The filler_enabled / filler_interval_minutes fields were
        # removed in the 2.3.0 scanner-centric refactor (Plan C) —
        # pin that they really are gone so nothing accidentally
        # re-adds them.
        assert "filler_enabled" not in body
        assert "filler_interval_minutes" not in body
        assert "coverage_percent" in body
        assert "budgets" in body
        assert "pending_queue_count" in body

    async def test_status_endpoint_requires_admin(
        self, client: AsyncClient
    ) -> None:
        response = await client.get("/api/admin/hostname-lookup/status")
        assert response.status_code in (401, 403)


# --- PUT /entries/{ip} — manual hand-edit --------------------------


class TestManualEditEndpoint:
    async def test_put_requires_admin(self, client: AsyncClient) -> None:
        response = await client.put(
            "/api/admin/hostname-lookup/entries/10.0.0.1",
            json={"hostnames": ["a.example"]},
        )
        assert response.status_code in (401, 403)

    async def test_put_creates_new_row(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.put(
            "/api/admin/hostname-lookup/entries/10.0.0.77",
            headers=admin_headers,
            json={"hostnames": ["manual.example", "www.manual.example"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ip"] == "10.0.0.77"
        assert body["hostnames"] == ["manual.example", "www.manual.example"]
        assert body["source"] == "manual"
        assert body["status"] == "success"

    async def test_put_overwrites_existing_row(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.78",
            HostnameLookupResult(
                status="success",
                hostnames=["from.hackertarget"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.put(
            "/api/admin/hostname-lookup/entries/10.0.0.78",
            headers=admin_headers,
            json={"hostnames": ["hand.example"]},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["source"] == "manual"
        assert body["hostnames"] == ["hand.example"]

    async def test_put_empty_list_creates_no_results_row(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.put(
            "/api/admin/hostname-lookup/entries/10.0.0.79",
            headers=admin_headers,
            json={"hostnames": []},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "no_results"
        assert body["hostnames"] == []

    async def test_put_uses_8_week_ttl(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
    ) -> None:
        """Manual edits get a long TTL so the filler doesn't overwrite."""
        response = await client.put(
            "/api/admin/hostname-lookup/entries/10.0.0.80",
            headers=admin_headers,
            json={"hostnames": ["stable.example"]},
        )
        assert response.status_code == 200
        body = response.json()
        queried_at = datetime.fromisoformat(body["queried_at"])
        expires_at = datetime.fromisoformat(body["expires_at"])
        delta_days = (expires_at - queried_at).days
        # 8 weeks = 56 days; allow ±1 day for the clock boundary.
        assert 55 <= delta_days <= 56

    async def test_put_dedupes_and_strips(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.put(
            "/api/admin/hostname-lookup/entries/10.0.0.81",
            headers=admin_headers,
            json={
                "hostnames": [
                    "  a.example  ",
                    "a.example",
                    "A.Example",
                    "",
                    "b.example",
                ],
            },
        )
        assert response.status_code == 200
        assert response.json()["hostnames"] == ["a.example", "b.example"]


# --- DELETE /entries/{ip} -------------------------------------------


class TestDeleteEntryEndpoint:
    async def test_delete_requires_admin(self, client: AsyncClient) -> None:
        response = await client.delete(
            "/api/admin/hostname-lookup/entries/10.0.0.90"
        )
        assert response.status_code in (401, 403)

    async def test_delete_removes_existing_row(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await upsert_cache_row(
            db_session,
            "10.0.0.91",
            HostnameLookupResult(
                status="success",
                hostnames=["gone.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.delete(
            "/api/admin/hostname-lookup/entries/10.0.0.91",
            headers=admin_headers,
        )
        assert response.status_code == 204

        remaining = (
            await db_session.execute(
                select(HostnameLookup).where(HostnameLookup.ip == "10.0.0.91")
            )
        ).scalar_one_or_none()
        assert remaining is None

    async def test_delete_missing_row_returns_404(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.delete(
            "/api/admin/hostname-lookup/entries/10.0.0.99",
            headers=admin_headers,
        )
        assert response.status_code == 404


# --- GET /api/hosts/{host_id}/hostnames -----------------------------


class TestHostHostnamesEndpoint:
    async def test_returns_empty_for_uncached_host(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        from app.models.host import Host

        host = Host(ip="10.0.1.1", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()
        await db_session.refresh(host)

        response = await client.get(
            f"/api/hosts/{host.id}/hostnames", headers=admin_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert body["ip"] == "10.0.1.1"
        assert body["hostnames"] == []
        assert body["source"] is None

    async def test_returns_cached_hostnames(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        from app.models.host import Host

        host = Host(ip="10.0.1.2", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()
        await db_session.refresh(host)

        await upsert_cache_row(
            db_session,
            "10.0.1.2",
            HostnameLookupResult(
                status="success",
                hostnames=["host.example", "www.host.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get(
            f"/api/hosts/{host.id}/hostnames", headers=admin_headers
        )
        assert response.status_code == 200
        body = response.json()
        assert body["hostnames"] == ["host.example", "www.host.example"]
        assert body["source"] == "hackertarget"
        assert body["queried_at"] is not None

    async def test_unknown_host_returns_404(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.get(
            "/api/hosts/99999/hostnames", headers=admin_headers
        )
        assert response.status_code == 404

    async def test_requires_auth(self, client: AsyncClient) -> None:
        response = await client.get("/api/hosts/1/hostnames")
        assert response.status_code in (401, 403)


# --- GET /api/hosts list — cached_hostname_count + display fields ---


class TestHostsListCachedHostnameProjection:
    """Pin the contract for the new cached_hostname_count +
    cached_display_hostname fields on the /api/hosts list response.

    The hosts list endpoint joins ``hostname_lookup_cache`` per page in
    a single batch query so the frontend can render the vhost chip
    + display hostname without an extra round-trip per row. Tests
    cover hosts with no cache row, success rows (count + first
    hostname), no_results rows (count=0, no display), and
    failed/expired rows (treated as cache miss).
    """

    async def test_no_cache_row_returns_zero_and_none(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        from app.models.host import Host

        host = Host(ip="10.5.0.1", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()

        response = await client.get("/api/hosts", headers=admin_headers)
        assert response.status_code == 200
        body = response.json()
        match = next(h for h in body["hosts"] if h["ip"] == "10.5.0.1")
        assert match["cached_hostname_count"] == 0
        assert match["cached_display_hostname"] is None

    async def test_success_row_populates_count_and_display(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        from app.models.host import Host

        host = Host(ip="10.5.0.2", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()

        await upsert_cache_row(
            db_session,
            "10.5.0.2",
            HostnameLookupResult(
                status="success",
                hostnames=["primary.example", "second.example", "third.example"],
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get("/api/hosts", headers=admin_headers)
        body = response.json()
        match = next(h for h in body["hosts"] if h["ip"] == "10.5.0.2")
        assert match["cached_hostname_count"] == 3
        assert match["cached_display_hostname"] == "primary.example"

    async def test_no_results_row_count_zero_no_display(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        """A no_results cache row says 'we looked, found nothing' —
        count is 0 (distinct from missing-row 0) and display is null."""
        from app.models.host import Host

        host = Host(ip="10.5.0.3", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()

        await upsert_cache_row(
            db_session,
            "10.5.0.3",
            HostnameLookupResult(status="no_results", hostnames=[]),
            source="rapiddns",
        )
        await db_session.commit()

        response = await client.get("/api/hosts", headers=admin_headers)
        body = response.json()
        match = next(h for h in body["hosts"] if h["ip"] == "10.5.0.3")
        assert match["cached_hostname_count"] == 0
        assert match["cached_display_hostname"] is None

    async def test_failed_row_treated_as_cache_miss(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        from app.models.host import Host

        host = Host(ip="10.5.0.4", seen_by_networks=[])
        db_session.add(host)
        await db_session.commit()

        await upsert_cache_row(
            db_session,
            "10.5.0.4",
            HostnameLookupResult(
                status="failed",
                hostnames=[],
                error_message="HTTP 500",
            ),
            source="hackertarget",
        )
        await db_session.commit()

        response = await client.get("/api/hosts", headers=admin_headers)
        body = response.json()
        match = next(h for h in body["hosts"] if h["ip"] == "10.5.0.4")
        assert match["cached_hostname_count"] == 0
        assert match["cached_display_hostname"] is None
