"""Tests for the ScannerClient methods that talk to the hostname API.

Pin the contract for the two new methods added in Commit 5 of the
scanner-centric hostname cache refactor (Plan C, 2.3.0):

- ``ScannerClient.get_hostname_budget()`` — pre-flight read against
  ``GET /api/scanner/hostname-budget`` returning
  ``{source: remaining}``.
- ``ScannerClient.post_hostname_results()`` — bulk POST against
  ``POST /api/scanner/hostname-results`` with
  ``{"results": [...]}``.

Both methods are best-effort: transport errors and non-2xx responses
must never propagate to the surrounding scan. Tests cover happy
paths plus the failure modes that the orchestrator relies on.
"""

from __future__ import annotations

import logging
from unittest.mock import MagicMock

from src.client import ScannerClient
from src.models import HostnameLookupJob


def _make_client(monkeypatched_request: MagicMock) -> ScannerClient:
    """Build a ScannerClient with a mocked _request method."""
    client = ScannerClient(
        base_url="http://test",
        api_key="test-key",
        logger=logging.getLogger("test"),
    )
    client._request = monkeypatched_request  # type: ignore[method-assign]
    return client


# --- get_hostname_budget --------------------------------------------


class TestGetHostnameBudget:
    def test_returns_remaining_per_source(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "budgets": [
                {"source": "hackertarget", "used": 5, "limit": 50, "remaining": 45},
                {"source": "rapiddns", "used": 0, "limit": 100, "remaining": 100},
            ]
        }
        client = _make_client(MagicMock(return_value=mock_response))

        result = client.get_hostname_budget()
        assert result == {"hackertarget": 45, "rapiddns": 100}

    def test_returns_empty_on_non_200(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 500
        client = _make_client(MagicMock(return_value=mock_response))

        assert client.get_hostname_budget() == {}

    def test_returns_empty_on_transport_error(self) -> None:
        client = _make_client(MagicMock(side_effect=RuntimeError("network down")))
        # Best-effort: must not raise
        assert client.get_hostname_budget() == {}

    def test_returns_empty_on_malformed_payload(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"unexpected": True}
        client = _make_client(MagicMock(return_value=mock_response))

        assert client.get_hostname_budget() == {}

    def test_skips_invalid_entries_in_payload(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "budgets": [
                {"source": "hackertarget", "remaining": 30},  # ok
                {"source": 123, "remaining": 0},  # bad source type
                {"source": "rapiddns", "remaining": "100"},  # bad remaining type
                "not a dict",
            ]
        }
        client = _make_client(MagicMock(return_value=mock_response))

        # Only the well-formed entry survives.
        assert client.get_hostname_budget() == {"hackertarget": 30}


# --- post_hostname_results -----------------------------------------


class TestPostHostnameResults:
    def test_empty_results_short_circuits(self) -> None:
        request_mock = MagicMock()
        client = _make_client(request_mock)

        client.post_hostname_results([])
        request_mock.assert_not_called()

    def test_posts_results_under_results_key(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "accepted": 1,
            "rejected": 0,
            "cache_rows_written": 1,
            "hosts_synced": 0,
            "budget_pinned_sources": [],
        }
        request_mock = MagicMock(return_value=mock_response)
        client = _make_client(request_mock)

        results = [
            {
                "ip": "1.2.3.4",
                "source": "hackertarget",
                "status": "success",
                "hostnames": ["a.example"],
            }
        ]
        client.post_hostname_results(results)

        request_mock.assert_called_once()
        args, kwargs = request_mock.call_args
        assert args[0] == "POST"
        assert args[1] == "/api/scanner/hostname-results"
        assert kwargs["json"] == {"results": results}
        assert kwargs["auth_required"] is True

    def test_non_200_is_swallowed(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 500
        mock_response.text = "internal server error"
        request_mock = MagicMock(return_value=mock_response)
        client = _make_client(request_mock)

        # Must not raise
        client.post_hostname_results(
            [
                {
                    "ip": "1.2.3.4",
                    "source": "hackertarget",
                    "status": "success",
                    "hostnames": ["a.example"],
                }
            ]
        )
        request_mock.assert_called_once()

    def test_transport_error_is_swallowed(self) -> None:
        client = _make_client(MagicMock(side_effect=RuntimeError("connection refused")))
        client.post_hostname_results(
            [
                {
                    "ip": "1.2.3.4",
                    "source": "hackertarget",
                    "status": "success",
                    "hostnames": ["a.example"],
                }
            ]
        )
        # No assertion needed — just that we didn't raise.


# --- get_hostname_lookup_jobs --------------------------------------


class TestGetHostnameLookupJobs:
    def test_decodes_jobs_payload(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "jobs": [
                {
                    "id": 1,
                    "ip": "1.2.3.4",
                    "status": "claimed",
                    "requested_by_user_id": 42,
                    "requested_at": "2026-04-11T12:00:00",
                    "claimed_at": "2026-04-11T12:00:01",
                    "completed_at": None,
                    "error_message": None,
                },
                {
                    "id": 2,
                    "ip": "5.6.7.8",
                    "status": "claimed",
                    "requested_by_user_id": None,
                    "requested_at": "2026-04-11T12:00:02",
                    "claimed_at": "2026-04-11T12:00:03",
                    "completed_at": None,
                    "error_message": None,
                },
            ]
        }
        request_mock = MagicMock(return_value=mock_response)
        client = _make_client(request_mock)

        jobs = client.get_hostname_lookup_jobs(limit=5)

        assert jobs == [
            HostnameLookupJob(id=1, ip="1.2.3.4", requested_by_user_id=42),
            HostnameLookupJob(id=2, ip="5.6.7.8", requested_by_user_id=None),
        ]
        request_mock.assert_called_once()
        args, kwargs = request_mock.call_args
        assert args[0] == "GET"
        assert args[1] == "/api/scanner/hostname-lookup-jobs"
        assert kwargs["params"] == {"limit": "5"}
        assert kwargs["auth_required"] is True

    def test_empty_jobs_returns_empty_list(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"jobs": []}
        client = _make_client(MagicMock(return_value=mock_response))

        assert client.get_hostname_lookup_jobs() == []

    def test_non_200_returns_empty(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 500
        client = _make_client(MagicMock(return_value=mock_response))

        assert client.get_hostname_lookup_jobs() == []

    def test_transport_error_returns_empty(self) -> None:
        client = _make_client(MagicMock(side_effect=RuntimeError("network down")))
        assert client.get_hostname_lookup_jobs() == []

    def test_skips_invalid_entries(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.json.return_value = {
            "jobs": [
                {"id": 1, "ip": "1.2.3.4"},  # ok (minimal)
                "not a dict",  # ignored
                {"id": "abc", "ip": "5.6.7.8"},  # bad id type → skipped
                {"ip": "no-id"},  # missing id → skipped
            ]
        }
        client = _make_client(MagicMock(return_value=mock_response))

        jobs = client.get_hostname_lookup_jobs()
        assert jobs == [HostnameLookupJob(id=1, ip="1.2.3.4")]


# --- complete_hostname_lookup_job ----------------------------------


class TestCompleteHostnameLookupJob:
    def test_posts_completed_status(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        request_mock = MagicMock(return_value=mock_response)
        client = _make_client(request_mock)

        client.complete_hostname_lookup_job(42, status="completed")

        request_mock.assert_called_once()
        args, kwargs = request_mock.call_args
        assert args[0] == "POST"
        assert args[1] == "/api/scanner/hostname-lookup-jobs/42/complete"
        assert kwargs["json"] == {"status": "completed"}
        assert kwargs["auth_required"] is True

    def test_posts_failed_with_error(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        request_mock = MagicMock(return_value=mock_response)
        client = _make_client(request_mock)

        client.complete_hostname_lookup_job(
            7, status="failed", error="rate limited"
        )

        kwargs = request_mock.call_args.kwargs
        assert kwargs["json"] == {"status": "failed", "error": "rate limited"}

    def test_truncates_long_error(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 200
        request_mock = MagicMock(return_value=mock_response)
        client = _make_client(request_mock)

        long_error = "x" * 800
        client.complete_hostname_lookup_job(7, status="failed", error=long_error)

        kwargs = request_mock.call_args.kwargs
        assert len(kwargs["json"]["error"]) == 500

    def test_transport_error_is_swallowed(self) -> None:
        client = _make_client(MagicMock(side_effect=RuntimeError("network down")))
        # Must not raise
        client.complete_hostname_lookup_job(7, status="completed")

    def test_non_200_is_swallowed(self) -> None:
        mock_response = MagicMock()
        mock_response.status_code = 404
        client = _make_client(MagicMock(return_value=mock_response))
        client.complete_hostname_lookup_job(99, status="completed")
