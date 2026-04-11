"""Tests for the on-demand hostname lookup queue.

Covers the three layers of the manual-refresh handoff between users
(via the host detail page or admin UI), the backend queue table, and
the scanner that eventually drains it:

1. Service primitives — enqueue, claim (atomic + dedup), complete,
   stuck-claim sweep, lazy GC of terminal rows.
2. Scanner-facing endpoints — ``GET /api/scanner/hostname-lookup-jobs``
   and ``POST /api/scanner/hostname-lookup-jobs/{id}/complete``.
3. User / admin enqueue endpoints — ``POST /api/hosts/{id}/hostname-
   lookup/refresh`` and ``POST /api/admin/hostname-lookup/entries/{ip}/
   refresh``.

The queue is the bridge that lets the backend keep storage + manual
edit + observability concerns while the scanner owns all external
hostname API egress; these tests pin its semantics so the rest of the
2.3.0 refactor can layer on top safely.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.host import Host
from app.models.hostname_lookup import HostnameLookupQueueEntry
from app.models.user import User
from app.services.hostname_lookup import (
    QUEUE_STUCK_CLAIM_AFTER,
    QUEUE_TERMINAL_RETENTION,
    claim_pending_lookup_jobs,
    enqueue_hostname_lookup,
    get_pending_queue_count,
    mark_queue_entry_completed,
)

# --- Service: enqueue ------------------------------------------------


class TestEnqueueHostnameLookup:
    async def test_enqueue_creates_pending_row(
        self, db_session: AsyncSession
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()

        assert entry.id is not None
        assert entry.ip == "10.0.0.1"
        assert entry.status == "pending"
        assert entry.claimed_at is None
        assert entry.completed_at is None
        assert entry.requested_at is not None

    async def test_enqueue_records_user_id(
        self, db_session: AsyncSession, admin_user: User
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=admin_user.id
        )
        await db_session.commit()
        assert entry.requested_by_user_id == admin_user.id

    async def test_enqueue_allows_duplicate_ip_pending(
        self, db_session: AsyncSession
    ) -> None:
        """Multiple pending rows for the same IP are allowed; dedup is at claim time."""
        a = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        b = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()
        assert a.id != b.id


# --- Service: claim --------------------------------------------------


class TestClaimPendingLookupJobs:
    async def test_returns_empty_when_queue_is_empty(
        self, db_session: AsyncSession
    ) -> None:
        assert await claim_pending_lookup_jobs(db_session, limit=10) == []

    async def test_claims_oldest_first(self, db_session: AsyncSession) -> None:
        first = await enqueue_hostname_lookup(db_session, ip="10.0.0.1", requested_by_user_id=None)
        # Backdate the first row so requested_at ordering is deterministic.
        first.requested_at = datetime.utcnow() - timedelta(minutes=5)
        await enqueue_hostname_lookup(db_session, ip="10.0.0.2", requested_by_user_id=None)
        await db_session.commit()

        claimed = await claim_pending_lookup_jobs(db_session, limit=1)
        await db_session.commit()

        assert len(claimed) == 1
        assert claimed[0].ip == "10.0.0.1"
        assert claimed[0].status == "claimed"
        assert claimed[0].claimed_at is not None

    async def test_dedupes_same_ip_within_batch(
        self, db_session: AsyncSession
    ) -> None:
        """Three pending rows for the same IP → only one is claimed."""
        for _ in range(3):
            await enqueue_hostname_lookup(
                db_session, ip="10.0.0.1", requested_by_user_id=None
            )
        await db_session.commit()

        claimed = await claim_pending_lookup_jobs(db_session, limit=10)
        await db_session.commit()

        assert len(claimed) == 1
        assert claimed[0].ip == "10.0.0.1"

        # Other two stay pending; cache write covers them implicitly.
        rows = (
            (
                await db_session.execute(
                    select(HostnameLookupQueueEntry).where(
                        HostnameLookupQueueEntry.status == "pending"
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 2

    async def test_zero_or_negative_limit_returns_empty(
        self, db_session: AsyncSession
    ) -> None:
        await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()
        assert await claim_pending_lookup_jobs(db_session, limit=0) == []
        assert await claim_pending_lookup_jobs(db_session, limit=-5) == []

    async def test_resweeps_stuck_claimed_rows(
        self, db_session: AsyncSession
    ) -> None:
        """A row stuck in 'claimed' beyond the window gets re-queued."""
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        entry.status = "claimed"
        entry.claimed_at = datetime.utcnow() - QUEUE_STUCK_CLAIM_AFTER - timedelta(minutes=5)
        await db_session.commit()

        # Next claim cycle should resurrect it.
        claimed = await claim_pending_lookup_jobs(db_session, limit=10)
        await db_session.commit()

        assert len(claimed) == 1
        assert claimed[0].id == entry.id

    async def test_does_not_resweep_recently_claimed_rows(
        self, db_session: AsyncSession
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        entry.status = "claimed"
        entry.claimed_at = datetime.utcnow() - timedelta(minutes=5)
        await db_session.commit()

        claimed = await claim_pending_lookup_jobs(db_session, limit=10)
        await db_session.commit()
        assert claimed == []

    async def test_lazy_gc_drops_terminal_rows_past_retention(
        self, db_session: AsyncSession
    ) -> None:
        """Completed rows older than the retention window are deleted on next read."""
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        entry.status = "completed"
        entry.completed_at = datetime.utcnow() - QUEUE_TERMINAL_RETENTION - timedelta(days=1)
        await db_session.commit()

        await claim_pending_lookup_jobs(db_session, limit=10)
        await db_session.commit()

        rows = (
            (await db_session.execute(select(HostnameLookupQueueEntry)))
            .scalars()
            .all()
        )
        assert rows == []

    async def test_lazy_gc_keeps_recent_terminal_rows(
        self, db_session: AsyncSession
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        entry.status = "completed"
        entry.completed_at = datetime.utcnow() - timedelta(days=1)
        await db_session.commit()

        await claim_pending_lookup_jobs(db_session, limit=10)
        await db_session.commit()

        row = (
            await db_session.execute(
                select(HostnameLookupQueueEntry).where(
                    HostnameLookupQueueEntry.id == entry.id
                )
            )
        ).scalar_one_or_none()
        assert row is not None


# --- Service: complete -----------------------------------------------


class TestMarkQueueEntryCompleted:
    async def test_marks_completed(self, db_session: AsyncSession) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()

        result = await mark_queue_entry_completed(
            db_session, entry.id, status="completed"
        )
        await db_session.commit()
        assert result is not None
        assert result.status == "completed"
        assert result.completed_at is not None
        assert result.error_message is None

    async def test_marks_failed_with_error(
        self, db_session: AsyncSession
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()

        result = await mark_queue_entry_completed(
            db_session,
            entry.id,
            status="failed",
            error="HackerTarget 429",
        )
        await db_session.commit()
        assert result is not None
        assert result.status == "failed"
        assert result.error_message == "HackerTarget 429"

    async def test_truncates_long_error_message(
        self, db_session: AsyncSession
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()
        long_error = "x" * 800
        result = await mark_queue_entry_completed(
            db_session, entry.id, status="failed", error=long_error
        )
        await db_session.commit()
        assert result is not None
        assert result.error_message is not None
        assert len(result.error_message) == 500

    async def test_unknown_id_returns_none(
        self, db_session: AsyncSession
    ) -> None:
        assert await mark_queue_entry_completed(db_session, 9999) is None


# --- Service: pending count ------------------------------------------


class TestPendingCount:
    async def test_counts_pending_and_claimed(
        self, db_session: AsyncSession
    ) -> None:
        await enqueue_hostname_lookup(db_session, ip="10.0.0.1", requested_by_user_id=None)
        await enqueue_hostname_lookup(db_session, ip="10.0.0.2", requested_by_user_id=None)
        claimed = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.3", requested_by_user_id=None
        )
        claimed.status = "claimed"
        claimed.claimed_at = datetime.utcnow()
        completed = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.4", requested_by_user_id=None
        )
        completed.status = "completed"
        completed.completed_at = datetime.utcnow()
        await db_session.commit()

        # 2 pending + 1 claimed = 3, completed excluded
        assert await get_pending_queue_count(db_session) == 3


# --- Scanner endpoints ----------------------------------------------


class TestScannerHostnameLookupJobsEndpoints:
    async def test_get_requires_scanner_auth(
        self, client: AsyncClient
    ) -> None:
        response = await client.get("/api/scanner/hostname-lookup-jobs")
        assert response.status_code in (401, 403)

    async def test_admin_jwt_is_rejected(
        self, client: AsyncClient, admin_headers: dict[str, str]
    ) -> None:
        response = await client.get(
            "/api/scanner/hostname-lookup-jobs", headers=admin_headers
        )
        assert response.status_code in (401, 403)

    async def test_returns_empty_when_queue_empty(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        response = await client.get(
            "/api/scanner/hostname-lookup-jobs", headers=scanner_headers
        )
        assert response.status_code == 200
        assert response.json() == {"jobs": []}

    async def test_claims_pending_jobs(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await enqueue_hostname_lookup(
            db_session, ip="10.0.0.2", requested_by_user_id=None
        )
        await db_session.commit()

        response = await client.get(
            "/api/scanner/hostname-lookup-jobs?limit=10",
            headers=scanner_headers,
        )
        assert response.status_code == 200
        body = response.json()
        ips = sorted(j["ip"] for j in body["jobs"])
        assert ips == ["10.0.0.1", "10.0.0.2"]
        for j in body["jobs"]:
            assert j["status"] == "claimed"
            assert j["claimed_at"] is not None

    async def test_complete_marks_terminal(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()

        response = await client.post(
            f"/api/scanner/hostname-lookup-jobs/{entry.id}/complete",
            headers=scanner_headers,
            json={"status": "completed"},
        )
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "completed"
        assert body["completed_at"] is not None

    async def test_complete_failed_records_error(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        entry = await enqueue_hostname_lookup(
            db_session, ip="10.0.0.1", requested_by_user_id=None
        )
        await db_session.commit()

        response = await client.post(
            f"/api/scanner/hostname-lookup-jobs/{entry.id}/complete",
            headers=scanner_headers,
            json={"status": "failed", "error": "rate limited"},
        )
        assert response.status_code == 200
        assert response.json()["error_message"] == "rate limited"

    async def test_complete_unknown_id_returns_404(
        self,
        client: AsyncClient,
        scanner_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/scanner/hostname-lookup-jobs/99999/complete",
            headers=scanner_headers,
            json={"status": "completed"},
        )
        assert response.status_code == 404


# --- User refresh endpoint -------------------------------------------


async def _create_host(db_session: AsyncSession, ip: str = "10.0.0.42") -> Host:
    host = Host(ip=ip, hostname=None, is_pingable=True)
    db_session.add(host)
    await db_session.commit()
    await db_session.refresh(host)
    return host


class TestHostRefreshEndpoint:
    async def test_requires_auth(self, client: AsyncClient) -> None:
        response = await client.post("/api/hosts/1/hostname-lookup/refresh")
        assert response.status_code in (401, 403)

    async def test_unknown_host_returns_404(
        self,
        client: AsyncClient,
        viewer_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/hosts/99999/hostname-lookup/refresh",
            headers=viewer_headers,
        )
        assert response.status_code == 404

    async def test_enqueues_pending_row(
        self,
        client: AsyncClient,
        viewer_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        host = await _create_host(db_session, ip="10.0.0.42")

        response = await client.post(
            f"/api/hosts/{host.id}/hostname-lookup/refresh",
            headers=viewer_headers,
        )
        assert response.status_code == 202
        body = response.json()
        assert body["status"] == "queued"
        assert body["queue_entry"]["ip"] == "10.0.0.42"
        assert body["queue_entry"]["status"] == "pending"


# --- Admin refresh endpoint ------------------------------------------


class TestAdminRefreshEndpoint:
    async def test_requires_admin(
        self,
        client: AsyncClient,
        viewer_headers: dict[str, str],
    ) -> None:
        response = await client.post(
            "/api/admin/hostname-lookup/entries/10.0.0.1/refresh",
            headers=viewer_headers,
        )
        assert response.status_code == 403

    async def test_enqueues_for_arbitrary_ip(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
    ) -> None:
        response = await client.post(
            "/api/admin/hostname-lookup/entries/10.99.0.1/refresh",
            headers=admin_headers,
        )
        assert response.status_code == 202
        body = response.json()
        assert body["status"] == "queued"
        assert body["queue_entry"]["ip"] == "10.99.0.1"
        assert body["queue_entry"]["status"] == "pending"

        rows = (
            (
                await db_session.execute(
                    select(HostnameLookupQueueEntry).where(
                        HostnameLookupQueueEntry.ip == "10.99.0.1"
                    )
                )
            )
            .scalars()
            .all()
        )
        assert len(rows) == 1
