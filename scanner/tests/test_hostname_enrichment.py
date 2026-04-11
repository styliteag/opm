"""Unit tests for hostname enrichment module."""

from __future__ import annotations

import logging
from unittest.mock import MagicMock, patch

import httpx
import pytest

from src.hostname_enrichment import (
    _extract_hostname_from_nmap_ssl_cert,
    _is_ip_address,
    _parse_ssl_cert_xml,
    enrich_host_results,
    enrich_hostnames_crt_sh,
    enrich_hostnames_google_dns,
    enrich_hostnames_hackertarget,
    enrich_hostnames_ip_api,
    enrich_hostnames_ssl_cert,
)
from src.hostname_sources import HostnameLookupResult
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
# SSL certificate hostname extraction
# =============================================================================


class TestExtractHostnameFromNmapSslCert:
    """Test _extract_hostname_from_nmap_ssl_cert with XML elements."""

    def test_extracts_san_dns_name(self) -> None:
        import xml.etree.ElementTree as ET

        xml = """<script id="ssl-cert">
            <table key="subject"><elem key="commonName">fallback.example.com</elem></table>
            <table key="extensions">
                <table>
                    <elem key="name">X509v3 Subject Alternative Name</elem>
                    <elem key="value">DNS:san.example.com, DNS:other.example.com</elem>
                </table>
            </table>
        </script>"""
        elem = ET.fromstring(xml)
        assert _extract_hostname_from_nmap_ssl_cert(elem) == "san.example.com"

    def test_falls_back_to_cn(self) -> None:
        import xml.etree.ElementTree as ET

        xml = """<script id="ssl-cert">
            <table key="subject"><elem key="commonName">cn.example.com</elem></table>
        </script>"""
        elem = ET.fromstring(xml)
        assert _extract_hostname_from_nmap_ssl_cert(elem) == "cn.example.com"

    def test_skips_wildcard_san(self) -> None:
        import xml.etree.ElementTree as ET

        xml = """<script id="ssl-cert">
            <table key="subject"><elem key="commonName">cn.example.com</elem></table>
            <table key="extensions">
                <table>
                    <elem key="name">X509v3 Subject Alternative Name</elem>
                    <elem key="value">DNS:*.example.com</elem>
                </table>
            </table>
        </script>"""
        elem = ET.fromstring(xml)
        # Wildcard SAN skipped, should fall back to CN
        assert _extract_hostname_from_nmap_ssl_cert(elem) == "cn.example.com"

    def test_skips_wildcard_cn(self) -> None:
        import xml.etree.ElementTree as ET

        xml = """<script id="ssl-cert">
            <table key="subject"><elem key="commonName">*.example.com</elem></table>
        </script>"""
        elem = ET.fromstring(xml)
        assert _extract_hostname_from_nmap_ssl_cert(elem) is None

    def test_no_cert_data(self) -> None:
        import xml.etree.ElementTree as ET

        xml = """<script id="ssl-cert"></script>"""
        elem = ET.fromstring(xml)
        assert _extract_hostname_from_nmap_ssl_cert(elem) is None


class TestParseSslCertXml:
    def test_parses_full_xml(self, logger: logging.Logger) -> None:
        xml = """<?xml version="1.0"?>
        <nmaprun>
            <host>
                <address addr="1.2.3.4" addrtype="ipv4"/>
                <ports>
                    <port protocol="tcp" portid="443">
                        <state state="open"/>
                        <script id="ssl-cert">
                            <table key="subject">
                                <elem key="commonName">server.example.com</elem>
                            </table>
                        </script>
                    </port>
                </ports>
            </host>
        </nmaprun>"""
        result = _parse_ssl_cert_xml(xml, logger)
        assert result == {"1.2.3.4": "server.example.com"}

    def test_empty_xml(self, logger: logging.Logger) -> None:
        xml = """<?xml version="1.0"?><nmaprun></nmaprun>"""
        assert _parse_ssl_cert_xml(xml, logger) == {}

    def test_invalid_xml(self, logger: logging.Logger) -> None:
        assert _parse_ssl_cert_xml("not xml", logger) == {}


class TestEnrichSslCert:
    def test_empty_list(self, logger: logging.Logger) -> None:
        result = enrich_hostnames_ssl_cert([], logger)
        assert result == {}

    @patch("src.hostname_enrichment.subprocess.Popen")
    def test_nmap_failure(self, mock_popen: MagicMock, logger: logging.Logger) -> None:
        mock_popen.side_effect = OSError("nmap not found")
        result = enrich_hostnames_ssl_cert(["1.1.1.1"], logger)
        assert result == {}


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
        assert result == {
            "1.1.1.1": ["one.one.one.one"],
            "8.8.8.8": ["dns.google"],
        }

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
        assert result == {"1.1.1.1": ["one.one.one.one"]}

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


class _StubHackerTargetSource:
    """In-memory stand-in for HackerTargetSource — no httpx."""

    name = "hackertarget"

    def __init__(self, results: dict[str, HostnameLookupResult]) -> None:
        self._results = results
        self.calls: list[str] = []

    def fetch(self, ip: str) -> HostnameLookupResult:
        self.calls.append(ip)
        return self._results.get(
            ip, HostnameLookupResult(status="no_results", hostnames=[])
        )


class TestEnrichHackerTarget:
    def test_empty_list(self, logger: logging.Logger) -> None:
        result = enrich_hostnames_hackertarget([], logger)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    def test_successful_lookup_keeps_all_hostnames(
        self, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        stub = _StubHackerTargetSource(
            {
                "192.0.2.103": HostnameLookupResult(
                    status="success",
                    hostnames=["web-prod.example.com", "mail.example.com"],
                )
            }
        )
        result = enrich_hostnames_hackertarget(
            ["192.0.2.103"], logger, source=stub
        )
        assert result == {
            "192.0.2.103": ["web-prod.example.com", "mail.example.com"]
        }

    @patch("src.hostname_enrichment.time.sleep")
    def test_no_results(self, mock_sleep: MagicMock, logger: logging.Logger) -> None:
        stub = _StubHackerTargetSource(
            {
                "10.0.0.1": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="error check your search parameter",
                )
            }
        )
        result = enrich_hostnames_hackertarget(["10.0.0.1"], logger, source=stub)
        assert result == {}

    @patch("src.hostname_enrichment.time.sleep")
    def test_api_limit_stops_remaining(
        self, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        stub = _StubHackerTargetSource(
            {
                "1.1.1.1": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="API count exceeded - Bandwidth limit exceeded",
                ),
                "8.8.8.8": HostnameLookupResult(
                    status="success",
                    hostnames=["should.not.see.example"],
                ),
            }
        )
        result = enrich_hostnames_hackertarget(
            ["1.1.1.1", "8.8.8.8"], logger, source=stub
        )
        assert result == {}
        # Should have bailed out after the first IP hit the rate limit
        assert stub.calls == ["1.1.1.1"]

    @patch("src.hostname_enrichment.time.sleep")
    def test_http_error_returns_empty(
        self, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        stub = _StubHackerTargetSource(
            {
                "1.1.1.1": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="HTTP error: Connection refused",
                )
            }
        )
        result = enrich_hostnames_hackertarget(["1.1.1.1"], logger, source=stub)
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

        result = enrich_hostnames_crt_sh(["192.0.2.103"], logger)
        assert result == {"192.0.2.103": ["server.example.com"]}

    @patch("src.hostname_enrichment.time.sleep")
    @patch("src.hostname_enrichment.httpx.Client")
    def test_skips_ip_common_name(
        self, mock_client_cls: MagicMock, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        """If crt.sh returns an IP as common_name, it should be skipped."""
        mock_response = MagicMock()
        mock_response.json.return_value = [
            {"common_name": "192.0.2.103", "name_value": "192.0.2.103"},
        ]
        mock_response.raise_for_status = MagicMock()

        mock_client = MagicMock()
        mock_client.__enter__ = MagicMock(return_value=mock_client)
        mock_client.__exit__ = MagicMock(return_value=False)
        mock_client.get.return_value = mock_response
        mock_client_cls.return_value = mock_client

        result = enrich_hostnames_crt_sh(["192.0.2.103"], logger)
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
        assert result == {"8.8.8.8": ["dns.google"]}

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
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_ssl_cert_resolves_first(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """SSL cert is queried first; later providers skip resolved IPs."""
        mock_ssl.return_value = {"1.1.1.1": ["one.one.one.one"]}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="1.1.1.1", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
            HostResult(ip="8.8.8.8", hostname="dns.google", is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "one.one.one.one"
        assert result[1].hostname == "dns.google"
        mock_ht.assert_not_called()
        mock_crt_sh.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_google_dns_fallback(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """Google DNS is queried for IPs not resolved by SSL cert."""
        # Use a clearly-public IP — TEST-NET-1 (192.0.2.0/24) is treated
        # as private by Python's ``ipaddress.is_private`` and would be
        # filtered out by the orchestrator before mocks could run.
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {"8.8.4.4": ["web-prod.example.com"]}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="8.8.4.4", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "web-prod.example.com"
        mock_ht.assert_not_called()
        mock_crt_sh.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_hackertarget_fallback(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """HackerTarget is queried for IPs not resolved by earlier steps."""
        # Use a clearly-public IP — TEST-NET-1 (192.0.2.0/24) is treated
        # as private by Python's ``ipaddress.is_private`` and would be
        # filtered out by the orchestrator before mocks could run.
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {"8.8.4.4": ["web-prod.example.com"]}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="8.8.4.4", hostname=None, is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "web-prod.example.com"
        mock_crt_sh.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_crt_sh_last_resort(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """crt.sh is only queried for IPs not resolved by any earlier provider."""
        mock_ssl.return_value = {"1.1.1.1": ["one.one.one.one"]}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_crt_sh.return_value = {"93.184.216.34": ["server.example.com"]}

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
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_nmap_hostname_not_overwritten(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """Existing nmap hostnames should never be overwritten by API results."""
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {"1.1.1.1": ["different.name.com"]}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="1.1.1.1", hostname="original.nmap.com", is_pingable=True, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname == "original.nmap.com"
        mock_ssl.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_non_pingable_hosts_skipped(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """Non-pingable hosts should not be enriched."""
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(ip="1.1.1.1", hostname=None, is_pingable=False, mac_address=None, mac_vendor=None),
        ]

        result = enrich_host_results(hosts, logger)
        assert result[0].hostname is None
        mock_ssl.assert_not_called()


# =============================================================================
# enrich_hostnames_rapiddns
# =============================================================================


class _StubRapidDnsSource:
    """In-memory stand-in for RapidDnsSource — no httpx."""

    name = "rapiddns"

    def __init__(self, results: dict[str, HostnameLookupResult]) -> None:
        self._results = results
        self.calls: list[str] = []

    def fetch(self, ip: str) -> HostnameLookupResult:
        self.calls.append(ip)
        return self._results.get(
            ip, HostnameLookupResult(status="no_results", hostnames=[])
        )


class TestEnrichRapidDns:
    def test_empty_list(self, logger: logging.Logger) -> None:
        from src.hostname_enrichment import enrich_hostnames_rapiddns

        assert enrich_hostnames_rapiddns([], logger) == {}

    @patch("src.hostname_enrichment.time.sleep")
    def test_successful_lookup_keeps_all_hostnames(
        self, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        from src.hostname_enrichment import enrich_hostnames_rapiddns
        stub = _StubRapidDnsSource(
            {
                "1.2.3.4": HostnameLookupResult(
                    status="success",
                    hostnames=["a.example", "b.example", "c.example"],
                )
            }
        )
        result = enrich_hostnames_rapiddns(["1.2.3.4"], logger, source=stub)
        assert result == {"1.2.3.4": ["a.example", "b.example", "c.example"]}

    @patch("src.hostname_enrichment.time.sleep")
    def test_rate_limit_stops_remaining(
        self, mock_sleep: MagicMock, logger: logging.Logger
    ) -> None:
        from src.hostname_enrichment import enrich_hostnames_rapiddns
        stub = _StubRapidDnsSource(
            {
                "1.2.3.4": HostnameLookupResult(
                    status="failed",
                    hostnames=[],
                    error_message="rapiddns: Cloudflare challenge - API count exceeded",
                ),
                "5.6.7.8": HostnameLookupResult(
                    status="success",
                    hostnames=["should.not.see.example"],
                ),
            }
        )
        result = enrich_hostnames_rapiddns(
            ["1.2.3.4", "5.6.7.8"], logger, source=stub
        )
        assert result == {}
        assert stub.calls == ["1.2.3.4"]


# =============================================================================
# enrich_host_results — budget pre-flight + backend post-back
# =============================================================================


class _StubScannerClient:
    """Minimal scanner client stand-in for budget + post-back tests."""

    def __init__(self, budget: dict[str, int] | None = None) -> None:
        self._budget = budget or {}
        self.posted: list[dict[str, object]] = []
        self.budget_calls = 0

    def get_hostname_budget(self) -> dict[str, int]:
        self.budget_calls += 1
        return dict(self._budget)

    def post_hostname_results(self, results: list[dict[str, object]]) -> None:
        self.posted.extend(results)


class TestEnrichHostResultsBudgetAwareness:
    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_skips_hackertarget_when_budget_zero(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {"1.2.3.4": ["should.not.appear.example"]}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        client = _StubScannerClient(budget={"hackertarget": 0, "rapiddns": 100})

        hosts = [
            HostResult(
                ip="1.2.3.4",
                hostname=None,
                is_pingable=True,
                mac_address=None,
                mac_vendor=None,
            ),
        ]
        result = enrich_host_results(hosts, logger, client=client)  # type: ignore[arg-type]

        assert result[0].hostname is None
        # Budget pre-flight happened, HT was skipped, RapidDNS still ran
        assert client.budget_calls == 1
        mock_ht.assert_not_called()
        mock_rd.assert_called_once()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_skips_rapiddns_when_budget_zero(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_rd.return_value = {"1.2.3.4": ["should.not.appear.example"]}
        mock_crt_sh.return_value = {}

        client = _StubScannerClient(budget={"hackertarget": 50, "rapiddns": 0})

        hosts = [
            HostResult(
                ip="1.2.3.4",
                hostname=None,
                is_pingable=True,
                mac_address=None,
                mac_vendor=None,
            ),
        ]
        enrich_host_results(hosts, logger, client=client)  # type: ignore[arg-type]

        mock_ht.assert_called_once()
        mock_rd.assert_not_called()

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_posts_vhost_results_to_backend(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {"1.2.3.4": ["a.example", "b.example"]}
        mock_rd.return_value = {"5.6.7.8": ["c.example"]}
        mock_crt_sh.return_value = {}

        client = _StubScannerClient(budget={"hackertarget": 50, "rapiddns": 100})

        hosts = [
            HostResult(
                ip="1.2.3.4",
                hostname=None,
                is_pingable=True,
                mac_address=None,
                mac_vendor=None,
            ),
            HostResult(
                ip="5.6.7.8",
                hostname=None,
                is_pingable=True,
                mac_address=None,
                mac_vendor=None,
            ),
        ]
        enrich_host_results(hosts, logger, client=client)  # type: ignore[arg-type]

        # Two results should be posted: one HT, one RapidDNS
        assert len(client.posted) == 2
        sources = sorted(r["source"] for r in client.posted)
        assert sources == ["hackertarget", "rapiddns"]
        for entry in client.posted:
            assert entry["status"] == "success"
            assert entry["ip"] in {"1.2.3.4", "5.6.7.8"}

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_does_not_post_display_name_sources(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """SSL / Google DNS / ip-api results never go to the cache."""
        mock_ssl.return_value = {"1.2.3.4": ["ssl.example"]}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        client = _StubScannerClient(budget={"hackertarget": 50, "rapiddns": 100})

        hosts = [
            HostResult(
                ip="1.2.3.4",
                hostname=None,
                is_pingable=True,
                mac_address=None,
                mac_vendor=None,
            ),
        ]
        enrich_host_results(hosts, logger, client=client)  # type: ignore[arg-type]

        # SSL result resolved the host, but nothing should be posted.
        assert client.posted == []

    @patch("src.hostname_enrichment.enrich_hostnames_crt_sh")
    @patch("src.hostname_enrichment.enrich_hostnames_rapiddns")
    @patch("src.hostname_enrichment.enrich_hostnames_hackertarget")
    @patch("src.hostname_enrichment.enrich_hostnames_ip_api")
    @patch("src.hostname_enrichment.enrich_hostnames_google_dns")
    @patch("src.hostname_enrichment.enrich_hostnames_ssl_cert")
    def test_no_client_means_no_budget_call(
        self,
        mock_ssl: MagicMock,
        mock_google_dns: MagicMock,
        mock_ip_api: MagicMock,
        mock_ht: MagicMock,
        mock_rd: MagicMock,
        mock_crt_sh: MagicMock,
        logger: logging.Logger,
    ) -> None:
        """Legacy path: client=None preserves the no-budget no-post-back behaviour."""
        mock_ssl.return_value = {}
        mock_google_dns.return_value = {}
        mock_ip_api.return_value = {}
        mock_ht.return_value = {"1.2.3.4": ["a.example"]}
        mock_rd.return_value = {}
        mock_crt_sh.return_value = {}

        hosts = [
            HostResult(
                ip="1.2.3.4",
                hostname=None,
                is_pingable=True,
                mac_address=None,
                mac_vendor=None,
            ),
        ]
        result = enrich_host_results(hosts, logger)
        # HT still ran, host got the first hostname
        assert result[0].hostname == "a.example"
        mock_ht.assert_called_once()


# =============================================================================
# post_hostname_results_to_backend
# =============================================================================


class TestPostHostnameResultsToBackend:
    def test_filters_display_name_sources(self, logger: logging.Logger) -> None:
        from src.hostname_enrichment import post_hostname_results_to_backend

        client = _StubScannerClient()
        results = [
            {
                "ip": "1.2.3.4",
                "source": "hackertarget",
                "status": "success",
                "hostnames": ["a.example"],
            },
            {
                "ip": "1.2.3.4",
                "source": "ssl_cert",
                "status": "success",
                "hostnames": ["b.example"],
            },
            {
                "ip": "5.6.7.8",
                "source": "rapiddns",
                "status": "success",
                "hostnames": ["c.example"],
            },
            {
                "ip": "9.10.11.12",
                "source": "ip_api",
                "status": "success",
                "hostnames": ["d.example"],
            },
            {
                "ip": "13.14.15.16",
                "source": "crt_sh",
                "status": "success",
                "hostnames": ["e.example"],
            },
        ]
        post_hostname_results_to_backend(client, results, logger)  # type: ignore[arg-type]

        sources = sorted(r["source"] for r in client.posted)
        assert sources == ["crt_sh", "hackertarget", "rapiddns"]

    def test_empty_results_no_call(self, logger: logging.Logger) -> None:
        from src.hostname_enrichment import post_hostname_results_to_backend

        client = _StubScannerClient()
        post_hostname_results_to_backend(client, [], logger)  # type: ignore[arg-type]
        assert client.posted == []

    def test_only_display_sources_no_call(self, logger: logging.Logger) -> None:
        from src.hostname_enrichment import post_hostname_results_to_backend

        client = _StubScannerClient()
        post_hostname_results_to_backend(  # type: ignore[arg-type]
            client,
            [
                {
                    "ip": "1.2.3.4",
                    "source": "ssl_cert",
                    "status": "success",
                    "hostnames": ["a.example"],
                },
                {
                    "ip": "5.6.7.8",
                    "source": "google_dns",
                    "status": "success",
                    "hostnames": ["b.example"],
                },
            ],
            logger,
        )
        assert client.posted == []
