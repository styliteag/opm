"""Unit tests for the scanner-side reverse-IP hostname sources.

Mirrors the backend's ``test_hostname_lookup_service.py`` parse + fetch
suites against the synchronous copies that live in
``scanner/src/hostname_sources.py``. The two implementations should
classify identical bodies the same way; the tests below are the
contract that holds them in sync until Commit 10 deletes the backend
copy.

Tests cover:
1. ``HackerTargetSource.parse`` — pure response-body classification.
2. ``HackerTargetSource.fetch`` — transport wrapper with httpx error
   handling, including the HTTP 429 → "api count exceeded" marker
   that the orchestrator uses to pin the backend budget.
3. ``RapidDnsSource.parse`` — HTML extraction, FQDN filtering,
   Cloudflare challenge handling.
4. ``RapidDnsSource.fetch`` — transport wrapper.
"""

from __future__ import annotations

import httpx

from src.hostname_sources import (
    HackerTargetSource,
    RapidDnsSource,
)

# --- HackerTargetSource.parse ---------------------------------------


class TestHackerTargetParse:
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


# --- HackerTargetSource.fetch (with transport override) -------------


class _HappySource(HackerTargetSource):
    def _fetch_text(self, ip: str) -> str:
        assert ip == "1.2.3.4"
        return "a.example\nb.example\n"


class _ExplodingSource(HackerTargetSource):
    def _fetch_text(self, ip: str) -> str:
        raise httpx.ConnectError("boom")


class _ThrottledSource(HackerTargetSource):
    def _fetch_text(self, ip: str) -> str:
        request = httpx.Request("GET", "https://api.hackertarget.com/")
        response = httpx.Response(429, request=request, text="")
        raise httpx.HTTPStatusError(
            "Too Many Requests", request=request, response=response
        )


class _ServerErrorSource(HackerTargetSource):
    def _fetch_text(self, ip: str) -> str:
        request = httpx.Request("GET", "https://api.hackertarget.com/")
        response = httpx.Response(500, request=request, text="")
        raise httpx.HTTPStatusError(
            "Internal Server Error", request=request, response=response
        )


class TestHackerTargetFetch:
    def test_fetch_wraps_parse(self) -> None:
        result = _HappySource().fetch("1.2.3.4")
        assert result.status == "success"
        assert result.hostnames == ["a.example", "b.example"]

    def test_http_error_returns_failed(self) -> None:
        result = _ExplodingSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "boom" in result.error_message

    def test_http_429_is_failed_with_api_count_marker(self) -> None:
        """HTTP 429 maps to the marker that pins the backend budget."""
        result = _ThrottledSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "api count exceeded" in result.error_message.lower()

    def test_other_http_status_is_failed_without_pin_marker(self) -> None:
        result = _ServerErrorSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "500" in result.error_message
        assert "api count exceeded" not in result.error_message.lower()


# --- RapidDnsSource.parse -------------------------------------------


_RAPIDDNS_SAMPLE_HTML = """
<html><head><title>RapidDNS</title></head>
<body>
<h1>Same IP results for 1.2.3.4</h1>
<table class="table">
<thead><tr><th>Name</th><th>Type</th><th>Value</th></tr></thead>
<tbody>
<tr><td>example.com</td><td>A</td><td>1.2.3.4</td></tr>
<tr><td>www.example.com</td><td>A</td><td>1.2.3.4</td></tr>
<tr><td>blog.example.com</td><td>A</td><td>1.2.3.4</td></tr>
<tr><td>1.2.3.4</td><td>A</td><td>1.2.3.4</td></tr>
<tr><td>EXAMPLE.com</td><td>A</td><td>1.2.3.4</td></tr>
</tbody>
</table>
""" + ("x" * 200)


class TestRapidDnsParse:
    def test_parses_table_extracts_fqdns(self) -> None:
        result = RapidDnsSource.parse(_RAPIDDNS_SAMPLE_HTML)
        assert result.status == "success"
        # IPv4 literal filtered out, case-insensitive dedupe applied.
        assert result.hostnames == [
            "example.com",
            "www.example.com",
            "blog.example.com",
        ]

    def test_empty_body_is_no_results(self) -> None:
        result = RapidDnsSource.parse("")
        assert result.status == "no_results"

    def test_short_stub_body_is_no_results(self) -> None:
        result = RapidDnsSource.parse("<html></html>")
        assert result.status == "no_results"

    def test_cloudflare_challenge_signals_pin_budget(self) -> None:
        body = "<html>" + ("x" * 200) + "challenge-platform/h/g/orchestrate</html>"
        result = RapidDnsSource.parse(body)
        assert result.status == "failed"
        assert result.error_message is not None
        assert "api count exceeded" in result.error_message.lower()

    def test_captcha_without_table_signals_pin_budget(self) -> None:
        body = "<html>" + ("x" * 200) + "Please complete the captcha to continue</html>"
        result = RapidDnsSource.parse(body)
        assert result.status == "failed"
        assert result.error_message is not None
        assert "api count exceeded" in result.error_message.lower()

    def test_table_with_only_invalid_entries_is_no_results(self) -> None:
        body = (
            "<html><table>"
            + ("<td>1.2.3.4</td>" * 10)
            + "</table>"
            + ("x" * 200)
            + "</html>"
        )
        result = RapidDnsSource.parse(body)
        assert result.status == "no_results"


# --- RapidDnsSource.fetch (with transport override) ----------------


class _RapidHappySource(RapidDnsSource):
    def _fetch_text(self, ip: str) -> str:
        assert ip == "1.2.3.4"
        return _RAPIDDNS_SAMPLE_HTML


class _RapidThrottledSource(RapidDnsSource):
    def _fetch_text(self, ip: str) -> str:
        request = httpx.Request("GET", "https://rapiddns.io/")
        response = httpx.Response(429, request=request, text="")
        raise httpx.HTTPStatusError(
            "Too Many Requests", request=request, response=response
        )


class _RapidExplodingSource(RapidDnsSource):
    def _fetch_text(self, ip: str) -> str:
        raise httpx.ConnectError("boom")


class TestRapidDnsFetch:
    def test_fetch_wraps_parse(self) -> None:
        result = _RapidHappySource().fetch("1.2.3.4")
        assert result.status == "success"
        assert "example.com" in result.hostnames

    def test_http_429_marks_api_count_exceeded(self) -> None:
        result = _RapidThrottledSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "api count exceeded" in result.error_message.lower()

    def test_http_error_returns_failed(self) -> None:
        result = _RapidExplodingSource().fetch("1.2.3.4")
        assert result.status == "failed"
        assert result.error_message is not None
        assert "boom" in result.error_message
