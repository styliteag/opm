"""Tests for the scanner-side hostname lookup queue poller.

Pin the contract for ``process_hostname_lookup_queue`` (Commit 6 of
the scanner-centric hostname cache refactor, Plan C 2.3.0): the
function the scanner calls every poll cycle to drain manual
"Refresh" requests that users have queued from the UI.

Lifecycle covered:

1. ``GET /api/scanner/hostname-lookup-jobs`` returns 0 → no-op
2. Returns N → for each, run HT/RapidDNS chain, post results,
   ``/complete``
3. HT success → mark completed, RapidDNS not called
4. HT no_results → fall through to RapidDNS, success → completed
5. Both fail → mark failed with the most informative error
6. HT rate-limit signal → pin local budget so subsequent jobs in
   the same batch don't burn an HT call
7. Pre-flight budget says hackertarget=0 → HT skipped, RapidDNS
   only
8. Per-job exception → fire-and-forget, mark failed with the
   exception text
9. Top-level transport error → swallowed, returns 0
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

from src.hostname_enrichment import process_hostname_lookup_queue
from src.hostname_sources import HostnameLookupResult
from src.models import HostnameLookupJob


class _StubClient:
    """In-memory ScannerClient stand-in for poller tests."""

    def __init__(
        self,
        jobs: list[HostnameLookupJob] | None = None,
        budget: dict[str, int] | None = None,
        get_jobs_raises: Exception | None = None,
    ) -> None:
        self._jobs = jobs or []
        self._budget = budget or {"hackertarget": 50, "rapiddns": 100}
        self._get_jobs_raises = get_jobs_raises
        self.posted: list[dict[str, object]] = []
        self.completed: list[tuple[int, str, str | None]] = []

    def get_hostname_lookup_jobs(self, limit: int = 10) -> list[HostnameLookupJob]:
        if self._get_jobs_raises is not None:
            raise self._get_jobs_raises
        return list(self._jobs[:limit])

    def get_hostname_budget(self) -> dict[str, int]:
        return dict(self._budget)

    def post_hostname_results(self, results: list[dict[str, object]]) -> None:
        self.posted.extend(results)

    def complete_hostname_lookup_job(
        self,
        job_id: int,
        *,
        status: str = "completed",
        error: str | None = None,
    ) -> None:
        self.completed.append((job_id, status, error))


def _patch_sources(
    monkeypatch,  # type: ignore[no-untyped-def]
    ht_results: dict[str, HostnameLookupResult] | None = None,
    rd_results: dict[str, HostnameLookupResult] | None = None,
) -> tuple[MagicMock, MagicMock]:
    """Replace the source classes used inside the poller with stubs."""
    ht_calls: list[str] = []
    rd_calls: list[str] = []

    def ht_fetch(self, ip: str) -> HostnameLookupResult:  # type: ignore[no-untyped-def]
        ht_calls.append(ip)
        return (ht_results or {}).get(
            ip, HostnameLookupResult(status="no_results", hostnames=[])
        )

    def rd_fetch(self, ip: str) -> HostnameLookupResult:  # type: ignore[no-untyped-def]
        rd_calls.append(ip)
        return (rd_results or {}).get(
            ip, HostnameLookupResult(status="no_results", hostnames=[])
        )

    monkeypatch.setattr(
        "src.hostname_enrichment.HackerTargetSource.fetch", ht_fetch
    )
    monkeypatch.setattr(
        "src.hostname_enrichment.RapidDnsSource.fetch", rd_fetch
    )
    ht_mock = MagicMock()
    ht_mock.calls = ht_calls
    rd_mock = MagicMock()
    rd_mock.calls = rd_calls
    return ht_mock, rd_mock


# --- Empty-queue + transport error paths ----------------------------


class TestEmptyQueue:
    def test_no_jobs_returns_zero(self) -> None:
        client = _StubClient(jobs=[])
        processed = process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]
        assert processed == 0
        assert client.posted == []
        assert client.completed == []

    def test_get_jobs_transport_error_swallowed(self) -> None:
        client = _StubClient(get_jobs_raises=RuntimeError("backend down"))
        processed = process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]
        assert processed == 0


# --- Happy path: HT resolves --------------------------------------


class TestHackerTargetHappyPath:
    def test_ht_success_completes_job(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        ht_calls, rd_calls = _patch_sources(
            monkeypatch,
            ht_results={
                "1.2.3.4": HostnameLookupResult(
                    status="success",
                    hostnames=["a.example", "b.example"],
                ),
            },
        )
        client = _StubClient(jobs=[HostnameLookupJob(id=42, ip="1.2.3.4")])

        processed = process_hostname_lookup_queue(
            client, logging.getLogger("t")  # type: ignore[arg-type]
        )

        assert processed == 1
        assert ht_calls.calls == ["1.2.3.4"]
        # RapidDNS not called when HT short-circuits
        assert rd_calls.calls == []
        # One result posted with the multi-vhost list
        assert len(client.posted) == 1
        post = client.posted[0]
        assert post == {
            "ip": "1.2.3.4",
            "source": "hackertarget",
            "status": "success",
            "hostnames": ["a.example", "b.example"],
            "error_message": None,
        }
        # Job marked completed
        assert client.completed == [(42, "completed", None)]


# --- Fallback: HT no_results → RapidDNS resolves --------------------


class TestRapidDnsFallback:
    def test_falls_through_when_ht_no_results(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        ht_calls, rd_calls = _patch_sources(
            monkeypatch,
            ht_results={
                "1.2.3.4": HostnameLookupResult(status="no_results", hostnames=[]),
            },
            rd_results={
                "1.2.3.4": HostnameLookupResult(
                    status="success",
                    hostnames=["c.example"],
                ),
            },
        )
        client = _StubClient(jobs=[HostnameLookupJob(id=7, ip="1.2.3.4")])

        process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]

        assert ht_calls.calls == ["1.2.3.4"]
        assert rd_calls.calls == ["1.2.3.4"]
        # Both results posted: HT no_results then RapidDNS success
        assert len(client.posted) == 2
        sources = [p["source"] for p in client.posted]
        assert sources == ["hackertarget", "rapiddns"]
        assert client.completed == [(7, "completed", None)]


# --- Both sources fail --------------------------------------------


class TestBothFail:
    def test_no_source_resolves_marks_failed_with_last_error(
        self, monkeypatch  # type: ignore[no-untyped-def]
    ) -> None:
        _patch_sources(
            monkeypatch,
            ht_results={
                "1.2.3.4": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP 500: server error",
                ),
            },
            rd_results={
                "1.2.3.4": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP 503: maintenance",
                ),
            },
        )
        client = _StubClient(jobs=[HostnameLookupJob(id=99, ip="1.2.3.4")])

        process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]

        # Both posted
        assert len(client.posted) == 2
        # Marked failed with the LAST source's error (most recent
        # information about why we couldn't resolve)
        assert len(client.completed) == 1
        job_id, status, error = client.completed[0]
        assert job_id == 99
        assert status == "failed"
        assert error == "HTTP 503: maintenance"

    def test_no_results_anywhere_marks_failed_with_generic_message(
        self, monkeypatch  # type: ignore[no-untyped-def]
    ) -> None:
        _patch_sources(
            monkeypatch,
            ht_results={},
            rd_results={},
        )
        client = _StubClient(jobs=[HostnameLookupJob(id=8, ip="9.9.9.9")])

        process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]

        # Both no_results entries posted
        assert len(client.posted) == 2
        assert client.completed == [(8, "failed", "no results from any source")]


# --- HT rate-limit pins budget for subsequent batch jobs -----------


class TestHtRateLimitPinning:
    def test_first_job_rate_limit_pins_budget_for_rest(
        self, monkeypatch  # type: ignore[no-untyped-def]
    ) -> None:
        ht_calls, rd_calls = _patch_sources(
            monkeypatch,
            ht_results={
                "1.1.1.1": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP 429: API count exceeded",
                ),
                # Second IP would resolve if HT were called
                "2.2.2.2": HostnameLookupResult(
                    status="success",
                    hostnames=["should.not.see.example"],
                ),
            },
            rd_results={
                "2.2.2.2": HostnameLookupResult(
                    status="success",
                    hostnames=["from.rapiddns.example"],
                ),
            },
        )
        client = _StubClient(
            jobs=[
                HostnameLookupJob(id=1, ip="1.1.1.1"),
                HostnameLookupJob(id=2, ip="2.2.2.2"),
            ]
        )

        process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]

        # HT called only for the first IP (then pinned)
        assert ht_calls.calls == ["1.1.1.1"]
        # RapidDNS called for both: first IP because HT failed, second
        # IP because HT was already pinned at the top of the batch
        assert rd_calls.calls == ["1.1.1.1", "2.2.2.2"]


# --- Pre-flight budget zero skips HT entirely ----------------------


class TestPreflightBudgetSkipsHt:
    def test_zero_ht_budget_skips_ht(
        self, monkeypatch  # type: ignore[no-untyped-def]
    ) -> None:
        ht_calls, rd_calls = _patch_sources(
            monkeypatch,
            ht_results={
                "1.2.3.4": HostnameLookupResult(
                    status="success",
                    hostnames=["should.not.see.example"],
                ),
            },
            rd_results={
                "1.2.3.4": HostnameLookupResult(
                    status="success",
                    hostnames=["from.rapiddns.example"],
                ),
            },
        )
        client = _StubClient(
            jobs=[HostnameLookupJob(id=3, ip="1.2.3.4")],
            budget={"hackertarget": 0, "rapiddns": 100},
        )

        process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]

        assert ht_calls.calls == []
        assert rd_calls.calls == ["1.2.3.4"]
        # Only the RapidDNS post, not HT
        assert len(client.posted) == 1
        assert client.posted[0]["source"] == "rapiddns"
        assert client.completed == [(3, "completed", None)]


# --- Per-job exception is fire-and-forget --------------------------


class TestPerJobExceptionMarksFailed:
    def test_unexpected_exception_marks_job_failed(
        self, monkeypatch  # type: ignore[no-untyped-def]
    ) -> None:
        # Raise from inside the source fetch
        def boom(self, ip: str) -> HostnameLookupResult:  # type: ignore[no-untyped-def]
            raise RuntimeError("kaboom")

        monkeypatch.setattr("src.hostname_enrichment.HackerTargetSource.fetch", boom)
        client = _StubClient(jobs=[HostnameLookupJob(id=11, ip="1.2.3.4")])

        # Should not raise
        process_hostname_lookup_queue(client, logging.getLogger("t"))  # type: ignore[arg-type]

        assert len(client.completed) == 1
        job_id, status, error = client.completed[0]
        assert job_id == 11
        assert status == "failed"
        assert error is not None
        assert "kaboom" in error
