"""Unit tests for hostname enrichment module."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock, patch

import httpx
import pytest

from src.hostname_enrichment import (
    _is_ip_address,
    enrich_host_results,
    enrich_hostnames_crt_sh,
    enrich_hostnames_google_dns,
    enrich_hostnames_hackertarget,
    enrich_hostnames_ip_api,
)
from src.models import HostResult


@pytest.fixture()
def logger() -> logging.Logger:
    return logging.getLogger("test")


# =============================================================================
# _is_ip_address
# =============================================================================


class TestIsIpAddress:
    def test_ipv4(self) -> None:
        assert _is_ip_address("192.168.1.1") is True

    def test_ipv6(self) -> None:
        assert _is_ip_address("2001:db8::1") is True

    def test_hostname(self) -> None:
        assert _is_ip_address("example.com") is False

    def test_subdomain(self) -> None:
        assert _is_ip_address("mail.example.com") is False


# =============================================================================
# enrich_hostnames_ip_api
# =============================================================================


class TestEnrichIpApi:
    def test_empty_list(self, logger: logging.Logger) -> None:
        result = enrich_hostnames_ip_api([], logger)
        assert result == {}

    @patch("src.hostname_enrichment.httpx.Client")
    def test_successful_batch(self, mock_client_cls: MagicMock, logger: logging.Logger) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"query": "1.1.1.1", "reverse": "one.one.one.one", "status": "success"},
            {"query": "8.8.8.8", "reverse": "dns.google", "status": "success"},
        ]
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_ip_api(["1.1.1.1", "8.8.8.8"], logger)
        assert result == {"1.1.1.1": "one.one.one.one", "8.8.8.8": "dns.google"}

    @patch("src.hostname_enrichment.httpx.Client")
    def test_partial_results(self, mock_client_cls: MagicMock, logger: logging.Logger) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"query": "1.1.1.1", "reverse": "one.one.one.one", "status": "success"},
            {"query": "10.0.0.1", "reverse": "", "status": "fail"},
        ]
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_ip_api(["1.1.1.1", "10.0.0.1"], logger)
        assert result == {"1.1.1.1": "one.one.one.one"}

    @patch("src.hostname_enrichment.httpx.Client")
    def test_http_error(self, mock_client_cls: MagicMock, logger: logging.Logger) -> None:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.post.side_effect = httpx.ConnectError("Connection refused")
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_ip_api(["1.1.1.1"], logger)
        assert result == {}


# =============================================================================
# enrich_hostnames_hackertarget
# =============================================================================


class TestEnrichHackerTarget:
    def test_empty_list(self, logger: logging.Logger) -> None:
        result = enrich_hostnames_hackertarget([], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_successful_lookup(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.text = "web-prod.stylite.eu\nmail.stylite.eu\n"
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_hackertarget(["213.183.76.103"], logger)
        assert result == {"213.183.76.103": "web-prod.stylite.eu"}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_no_results(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.text = "error check your search parameter"
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_hackertarget(["10.0.0.1"], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_api_limit_stops_remaining(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.text = "API count exceeded - Bandwidth limit exceeded"
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_hackertarget(["1.1.1.1", "8.8.8.8"], logger)
        assert result == {}
        # Should have stopped after first IP hit the limit
        assert mock_client.get.call_count == 1

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_http_error(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = httpx.ConnectError("Connection refused")
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_hackertarget(["1.1.1.1"], logger)
        assert result == {}


# =============================================================================
# enrich_hostnames_crt_sh
# =============================================================================


class TestEnrichCrtSh:
    def test_empty_list(self, logger: logging.Logger) -> None:
        result = enrich_hostnames_crt_sh([], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_successful_lookup(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"common_name": "server.example.com", "name_value": "server.example.com"},
        ]
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_crt_sh(["213.183.76.103"], logger)
        assert result == {"213.183.76.103": "server.example.com"}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_skips_ip_common_name(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        """If crt.sh returns an IP as common_name, it should be skipped."""
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"common_name": "213.183.76.103", "name_value": "213.183.76.103"},
        ]
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_crt_sh(["213.183.76.103"], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_empty_response(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = []
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_crt_sh(["10.0.0.1"], logger)
        assert result == {}


# =============================================================================
# enrich_hostnames_google_dns
# =============================================================================


class TestEnrichGoogleDns:
    def test_empty_list(self, logger: logging.Logger) -> None:
        result = enrich_hostnames_google_dns([], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_successful_ptr_lookup(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "Status": 0,
            "Answer": [{"type": 12, "data": "dns.google."}],
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_google_dns(["8.8.8.8"], logger)
        assert result == {"8.8.8.8": "dns.google"}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_no_ptr_record(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_response = MagicMock()
        mock_response.json.return_value = {"Status": 3, "Answer": None}
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_google_dns(["10.0.0.1"], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_http_error(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = httpx.ConnectError("Connection refused")
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_google_dns(["1.1.1.1"], logger)
        assert result == {}


# =============================================================================
# crt.sh bail-out on consecutive failures
# =============================================================================


class TestCrtShBailOut:
    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_bails_after_consecutive_failures(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        """crt.sh should stop after 3 consecutive failures."""
        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.side_effect = httpx.ReadTimeout("The read operation timed out")
        mock_client_cls.return_value = mock_client

        ips = [f"1.2.3.{i}" for i in range(10)]
        result = enrich_hostnames_crt_sh(ips, logger)
        assert result == {}
        # Should bail after 3 consecutive failures, not try all 10
        assert mock_client.get.call_count == 3

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_404_does_not_count_as_failure(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        """404 responses should not count toward the bail-out threshold."""
        mock_404_response = MagicMock()
        mock_404_response.status_code = 404
        mock_404_response.raise_for_status.side_effect = httpx.HTTPStatusError(
            "404", request=MagicMock(), response=mock_404_response
        )

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_404_response
        mock_client_cls.return_value = mock_client

        ips = [f"1.2.3.{i}" for i in range(5)]
        result = enrich_hostnames_crt_sh(ips, logger)
        assert result == {}
        # All 5 should be attempted since 404 doesn't trigger bail-out
        assert mock_client.get.call_count == 5


# =============================================================================
# enrich_host_results (integration of all APIs)
# =============================================================================


class TestEnrichHostResults:
    def test_all_hosts_have_hostnames(self, logger: logging.Logger) -> None:
        """Hosts with existing hostnames should not be modified."""
        hosts = [
            HostResult(ip="1.1.1.1", hostname="one.one.one.one", is_pingable=True, mac_address=None, mac_vendor=None),
        ]
        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "one.one.one.one"

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    def test_enriches_via_ip_api(
        self,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_google_dns: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        mock_ip_api.return_value = {"1.1.1.1": "one.one.one.one"}
        mock_ht.return_value = {}
        mock_google_dns.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="1.1.1.1", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
            HostResult(ip="8.8.8.8", hostname="dns.google", is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "one.one.one.one"
        assert result[1].hostname == "dns.google"

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    def test_hackertarget_fallback(
        self,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_google_dns: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """HackerTarget should be queried for IPs that ip-api.com didn't resolve."""
        mock_ip_api.return_value = {}
        mock_ht.return_value = {"213.183.76.103": "web-prod.stylite.eu"}
        mock_google_dns.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="213.183.76.103", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "web-prod.stylite.eu"
        # Google DNS and crt.sh should not be called since HackerTarget resolved it
        mock_google_dns.assert_not_called()
        mock_crt_sh.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    def test_google_dns_fallback(
        self,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_google_dns: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """Google DNS should be queried for IPs not resolved by ip-api or HackerTarget."""
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_google_dns.return_value = {"213.183.76.103": "server.example.com"}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="213.183.76.103", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "server.example.com"
        mock_crt_sh.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    def test_crt_sh_fallback(
        self,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_google_dns: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """crt.sh should only be queried for IPs not resolved by earlier steps."""
        mock_ip_api.return_value = {"1.1.1.1": "one.one.one.one"}
        mock_ht.return_value = {}
        mock_google_dns.return_value = {}
        mock_crt_sh.return_value = {"93.184.216.34": "server.example.com"}

        hosts = [
            HostResult(ip="1.1.1.1", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
            HostResult(ip="93.184.216.34", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "one.one.one.one"
        assert result[1].hostname == "server.example.com"

        mock_crt_sh.assert_called_once()
        call_args = mock_crt_sh.call_args
        assert call_args[0][0] == ["93.184.216.34"]

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    def test_nmap_hostname_not_overwritten(
        self,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_google_dns: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """Existing nmap hostnames should never be overwritten by API results."""
        mock_ip_api.return_value = {"1.1.1.1": "different.name.com"}
        mock_ht.return_value = {}
        mock_google_dns.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="1.1.1.1", hostname="original.nmap.com", is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "original.nmap.com"
        # ip-api should not have been called since all hosts have hostnames
        mock_ip_api.assert_not_called()
