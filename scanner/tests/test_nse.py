"""Unit tests for NSE scanner command construction helpers."""

from src.scanners.nse import _protocol_scan_flags


class TestProtocolScanFlags:
    def test_tcp_defaults_to_tcp_connect(self) -> None:
        assert _protocol_scan_flags("tcp") == ["-sT"]

    def test_udp_uses_udp_scan(self) -> None:
        assert _protocol_scan_flags("udp") == ["-sU"]

    def test_both_scans_tcp_and_udp(self) -> None:
        assert _protocol_scan_flags("both") == ["-sT", "-sU"]
