"""Unit tests for SSH probe module JSON parsing.

Tests cover:
- Parsing valid ssh-audit JSON output
- Extraction of authentication methods
- Cipher/KEX/MAC classification (weak vs strong)
- Handling of malformed JSON
- Handling of connection timeout/error responses
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from src.ssh_probe import (
    AlgorithmInfo,
    SSHProbeResult,
    WEAK_CIPHERS,
    WEAK_KEX,
    WEAK_MACS,
    _classify_cipher,
    _classify_kex,
    _classify_mac,
    _extract_algorithm_notes,
    _parse_auth_methods,
    _parse_banner,
    _parse_ciphers,
    _parse_host_keys,
    _parse_kex,
    _parse_macs,
    _parse_ssh_audit_json,
    _probe_auth_methods_nmap,
    probe_ssh,
)


# =============================================================================
# Test fixtures - Sample ssh-audit JSON data
# =============================================================================


@pytest.fixture
def valid_ssh_audit_json() -> dict[str, Any]:
    """Complete valid ssh-audit JSON output for a modern OpenSSH server."""
    return {
        "banner": {
            "raw": "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1",
            "protocol": [2, 0],
            "software": "OpenSSH_8.9p1",
        },
        "auth": ["publickey", "password", "keyboard-interactive"],
        "kex": [
            {
                "algorithm": "curve25519-sha256",
                "keysize": None,
                "notes": {"info": ["secure curve"]},
            },
            {
                "algorithm": "diffie-hellman-group1-sha1",
                "keysize": 1024,
                "notes": {"fail": ["using weak 1024-bit DH group"]},
            },
        ],
        "enc": [
            {
                "algorithm": "chacha20-poly1305@openssh.com",
                "keysize": 256,
                "notes": {},
            },
            {
                "algorithm": "aes256-gcm@openssh.com",
                "keysize": 256,
                "notes": {},
            },
            {
                "algorithm": "3des-cbc",
                "keysize": 168,
                "notes": {"fail": ["weak cipher"]},
            },
        ],
        "mac": [
            {
                "algorithm": "hmac-sha2-256-etm@openssh.com",
                "keysize": 256,
                "notes": {},
            },
            {
                "algorithm": "hmac-md5",
                "keysize": 128,
                "notes": {"fail": ["weak MAC"]},
            },
        ],
        "key": [
            {"algorithm": "ssh-ed25519", "keysize": 256},
            {"algorithm": "rsa-sha2-512", "keysize": 4096},
        ],
    }


@pytest.fixture
def minimal_ssh_audit_json() -> dict[str, Any]:
    """Minimal valid ssh-audit output with only required fields."""
    return {
        "banner": "SSH-2.0-OpenSSH_9.0",
        "auth": ["publickey"],
        "kex": [{"algorithm": "curve25519-sha256"}],
        "enc": [{"algorithm": "aes256-gcm@openssh.com"}],
        "mac": [{"algorithm": "hmac-sha2-256"}],
        "key": [{"algorithm": "ssh-ed25519"}],
    }


@pytest.fixture
def weak_config_ssh_audit_json() -> dict[str, Any]:
    """SSH config with multiple weak algorithms and insecure auth."""
    return {
        "banner": {
            "raw": "SSH-1.99-OpenSSH_5.3",
            "protocol": [1, 99],
            "software": "OpenSSH_5.3",
        },
        "auth": ["password", "keyboard-interactive"],
        "kex": [
            {"algorithm": "diffie-hellman-group1-sha1", "keysize": 1024},
            {"algorithm": "diffie-hellman-group-exchange-sha1", "keysize": 2048},
        ],
        "enc": [
            {"algorithm": "3des-cbc", "keysize": 168},
            {"algorithm": "aes128-cbc", "keysize": 128},
            {"algorithm": "arcfour", "keysize": 128},
        ],
        "mac": [
            {"algorithm": "hmac-md5", "keysize": 128},
            {"algorithm": "hmac-sha1", "keysize": 160},
        ],
        "key": [{"algorithm": "ssh-dss", "keysize": 1024}],
    }


@pytest.fixture
def publickey_only_json() -> dict[str, Any]:
    """Secure SSH config with publickey-only auth."""
    return {
        "banner": "SSH-2.0-OpenSSH_9.5",
        "auth": ["publickey"],
        "kex": [{"algorithm": "sntrup761x25519-sha512@openssh.com"}],
        "enc": [{"algorithm": "aes256-gcm@openssh.com"}],
        "mac": [{"algorithm": "hmac-sha2-512-etm@openssh.com"}],
        "key": [{"algorithm": "ssh-ed25519"}],
    }


# =============================================================================
# Tests for banner parsing
# =============================================================================


class TestParseBanner:
    """Tests for _parse_banner function."""

    def test_parse_standard_openssh_banner(self) -> None:
        """Test parsing standard OpenSSH banner."""
        banner = "SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1"
        version, protocol = _parse_banner(banner)
        assert version == "OpenSSH_8.9p1"
        assert protocol == "2.0"

    def test_parse_banner_without_comments(self) -> None:
        """Test parsing banner without OS comments."""
        banner = "SSH-2.0-OpenSSH_9.0"
        version, protocol = _parse_banner(banner)
        assert version == "OpenSSH_9.0"
        assert protocol == "2.0"

    def test_parse_protocol_1_99(self) -> None:
        """Test parsing SSH protocol 1.99 (compat mode)."""
        banner = "SSH-1.99-OpenSSH_5.3"
        version, protocol = _parse_banner(banner)
        assert version == "OpenSSH_5.3"
        assert protocol == "1.99"

    def test_parse_empty_banner(self) -> None:
        """Test parsing empty banner returns None."""
        version, protocol = _parse_banner("")
        assert version is None
        assert protocol is None

    def test_parse_none_banner(self) -> None:
        """Test parsing None banner returns None."""
        version, protocol = _parse_banner(None)
        assert version is None
        assert protocol is None

    def test_parse_non_ssh_banner(self) -> None:
        """Test parsing non-SSH string returns None values."""
        banner = "not-an-ssh-banner"
        version, protocol = _parse_banner(banner)
        assert version is None
        assert protocol is None


# =============================================================================
# Tests for authentication method extraction
# =============================================================================


class TestParseAuthMethods:
    """Tests for _parse_auth_methods function."""

    def test_all_auth_methods_enabled(self) -> None:
        """Test when all auth methods are enabled."""
        auth_data = ["publickey", "password", "keyboard-interactive"]
        publickey, password, keyboard = _parse_auth_methods(auth_data)
        assert publickey is True
        assert password is True
        assert keyboard is True

    def test_publickey_only(self) -> None:
        """Test publickey-only authentication."""
        auth_data = ["publickey"]
        publickey, password, keyboard = _parse_auth_methods(auth_data)
        assert publickey is True
        assert password is False
        assert keyboard is False

    def test_password_only(self) -> None:
        """Test password-only authentication."""
        auth_data = ["password"]
        publickey, password, keyboard = _parse_auth_methods(auth_data)
        assert publickey is False
        assert password is True
        assert keyboard is False

    def test_keyboard_interactive_with_underscore(self) -> None:
        """Test keyboard_interactive with underscore variant."""
        auth_data = ["keyboard_interactive"]
        publickey, password, keyboard = _parse_auth_methods(auth_data)
        assert keyboard is True

    def test_empty_auth_list(self) -> None:
        """Test empty auth list returns all False."""
        publickey, password, keyboard = _parse_auth_methods([])
        assert publickey is False
        assert password is False
        assert keyboard is False

    def test_none_auth_data(self) -> None:
        """Test None auth data returns all False."""
        publickey, password, keyboard = _parse_auth_methods(None)
        assert publickey is False
        assert password is False
        assert keyboard is False

    def test_auth_case_insensitive(self) -> None:
        """Test auth method detection is case-insensitive."""
        auth_data = ["PUBLICKEY", "PASSWORD", "KEYBOARD-INTERACTIVE"]
        publickey, password, keyboard = _parse_auth_methods(auth_data)
        assert publickey is True
        assert password is True
        assert keyboard is True

    def test_non_string_items_ignored(self) -> None:
        """Test that non-string items in auth list are ignored."""
        auth_data: list[Any] = ["publickey", 123, None, {"nested": "dict"}, "password"]
        publickey, password, keyboard = _parse_auth_methods(auth_data)
        assert publickey is True
        assert password is True
        assert keyboard is False


# =============================================================================
# Tests for cipher classification
# =============================================================================


class TestClassifyCipher:
    """Tests for _classify_cipher function."""

    def test_strong_ciphers(self) -> None:
        """Test strong ciphers are not marked as weak."""
        strong = [
            "chacha20-poly1305@openssh.com",
            "aes256-gcm@openssh.com",
            "aes128-gcm@openssh.com",
            "aes256-ctr",
            "aes192-ctr",
            "aes128-ctr",
        ]
        for cipher in strong:
            assert _classify_cipher(cipher) is False, f"{cipher} should be strong"

    def test_weak_ciphers_in_set(self) -> None:
        """Test ciphers in WEAK_CIPHERS set are marked weak."""
        for cipher in WEAK_CIPHERS:
            assert _classify_cipher(cipher) is True, f"{cipher} should be weak"

    def test_des_variants_weak(self) -> None:
        """Test all DES variants are marked weak."""
        des_variants = ["des-cbc", "3des-cbc", "3des", "des"]
        for cipher in des_variants:
            assert _classify_cipher(cipher) is True, f"{cipher} should be weak"

    def test_rc4_arcfour_weak(self) -> None:
        """Test RC4/arcfour variants are marked weak."""
        rc4_variants = ["arcfour", "arcfour128", "arcfour256"]
        for cipher in rc4_variants:
            assert _classify_cipher(cipher) is True, f"{cipher} should be weak"

    def test_blowfish_weak(self) -> None:
        """Test Blowfish is marked weak."""
        assert _classify_cipher("blowfish-cbc") is True
        assert _classify_cipher("blowfish") is True

    def test_cbc_mode_ciphers_weak(self) -> None:
        """Test CBC mode ciphers are marked weak."""
        cbc_ciphers = ["aes128-cbc", "aes192-cbc", "aes256-cbc"]
        for cipher in cbc_ciphers:
            assert _classify_cipher(cipher) is True, f"{cipher} should be weak"


# =============================================================================
# Tests for KEX classification
# =============================================================================


class TestClassifyKex:
    """Tests for _classify_kex function."""

    def test_strong_kex_algorithms(self) -> None:
        """Test strong KEX algorithms are not marked weak."""
        strong = [
            "curve25519-sha256",
            "curve25519-sha256@libssh.org",
            "sntrup761x25519-sha512@openssh.com",
            "diffie-hellman-group16-sha512",
            "diffie-hellman-group18-sha512",
        ]
        for kex in strong:
            assert _classify_kex(kex) is False, f"{kex} should be strong"

    def test_weak_kex_in_set(self) -> None:
        """Test KEX algorithms in WEAK_KEX set are marked weak."""
        for kex in WEAK_KEX:
            assert _classify_kex(kex) is True, f"{kex} should be weak"

    def test_sha1_kex_weak(self) -> None:
        """Test SHA1-based KEX are marked weak."""
        sha1_kex = [
            "diffie-hellman-group1-sha1",
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group-exchange-sha1",
        ]
        for kex in sha1_kex:
            assert _classify_kex(kex) is True, f"{kex} should be weak"


# =============================================================================
# Tests for MAC classification
# =============================================================================


class TestClassifyMac:
    """Tests for _classify_mac function."""

    def test_strong_macs(self) -> None:
        """Test strong MACs are not marked weak."""
        strong = [
            "hmac-sha2-256",
            "hmac-sha2-512",
            "hmac-sha2-256-etm@openssh.com",
            "hmac-sha2-512-etm@openssh.com",
            "umac-128@openssh.com",
            "umac-128-etm@openssh.com",
        ]
        for mac in strong:
            assert _classify_mac(mac) is False, f"{mac} should be strong"

    def test_weak_macs_in_set(self) -> None:
        """Test MACs in WEAK_MACS set are marked weak."""
        for mac in WEAK_MACS:
            assert _classify_mac(mac) is True, f"{mac} should be weak"

    def test_md5_macs_weak(self) -> None:
        """Test MD5-based MACs are marked weak."""
        md5_macs = [
            "hmac-md5",
            "hmac-md5-96",
            "hmac-md5-etm@openssh.com",
        ]
        for mac in md5_macs:
            assert _classify_mac(mac) is True, f"{mac} should be weak"


# =============================================================================
# Tests for algorithm notes extraction
# =============================================================================


class TestExtractAlgorithmNotes:
    """Tests for _extract_algorithm_notes function."""

    def test_extract_fail_notes(self) -> None:
        """Test extraction of FAIL-level notes."""
        algo_data = {"notes": {"fail": ["using weak cipher"]}}
        notes = _extract_algorithm_notes(algo_data)
        assert len(notes) == 1
        assert "[FAIL]" in notes[0]
        assert "using weak cipher" in notes[0]

    def test_extract_warn_notes(self) -> None:
        """Test extraction of WARN-level notes."""
        algo_data = {"notes": {"warn": ["deprecated algorithm"]}}
        notes = _extract_algorithm_notes(algo_data)
        assert len(notes) == 1
        assert "[WARN]" in notes[0]

    def test_extract_info_notes(self) -> None:
        """Test extraction of INFO-level notes."""
        algo_data = {"notes": {"info": ["secure algorithm"]}}
        notes = _extract_algorithm_notes(algo_data)
        assert len(notes) == 1
        assert "[INFO]" in notes[0]

    def test_extract_multiple_levels(self) -> None:
        """Test extraction of notes at multiple severity levels."""
        algo_data = {
            "notes": {
                "fail": ["critical issue"],
                "warn": ["minor concern"],
                "info": ["informational"],
            }
        }
        notes = _extract_algorithm_notes(algo_data)
        assert len(notes) == 3

    def test_empty_notes(self) -> None:
        """Test extraction from empty notes returns empty list."""
        algo_data: dict[str, Any] = {"notes": {}}
        notes = _extract_algorithm_notes(algo_data)
        assert notes == []

    def test_no_notes_field(self) -> None:
        """Test extraction when no notes field present."""
        algo_data = {"algorithm": "aes256-gcm"}
        notes = _extract_algorithm_notes(algo_data)
        assert notes == []


# =============================================================================
# Tests for cipher parsing
# =============================================================================


class TestParseCiphers:
    """Tests for _parse_ciphers function."""

    def test_parse_valid_ciphers(self) -> None:
        """Test parsing valid cipher list."""
        enc_data = [
            {"algorithm": "aes256-gcm@openssh.com", "keysize": 256},
            {"algorithm": "3des-cbc", "keysize": 168},
        ]
        ciphers = _parse_ciphers(enc_data)
        assert len(ciphers) == 2
        assert ciphers[0].name == "aes256-gcm@openssh.com"
        assert ciphers[0].keysize == 256
        assert ciphers[0].is_weak is False
        assert ciphers[1].name == "3des-cbc"
        assert ciphers[1].is_weak is True

    def test_parse_cipher_with_fail_note_marked_weak(self) -> None:
        """Test cipher with FAIL note is marked weak."""
        enc_data = [
            {
                "algorithm": "custom-cipher",
                "keysize": 256,
                "notes": {"fail": ["known vulnerability"]},
            }
        ]
        ciphers = _parse_ciphers(enc_data)
        assert ciphers[0].is_weak is True

    def test_parse_empty_cipher_list(self) -> None:
        """Test parsing empty cipher list returns empty tuple."""
        assert _parse_ciphers([]) == ()
        assert _parse_ciphers(None) == ()

    def test_parse_cipher_invalid_keysize(self) -> None:
        """Test parsing cipher with invalid keysize."""
        enc_data = [{"algorithm": "aes256-gcm", "keysize": "invalid"}]
        ciphers = _parse_ciphers(enc_data)
        assert ciphers[0].keysize is None


# =============================================================================
# Tests for KEX parsing
# =============================================================================


class TestParseKex:
    """Tests for _parse_kex function."""

    def test_parse_valid_kex(self) -> None:
        """Test parsing valid KEX list."""
        kex_data: list[dict[str, Any]] = [
            {"algorithm": "curve25519-sha256", "keysize": None},
            {"algorithm": "diffie-hellman-group1-sha1", "keysize": 1024},
        ]
        kex = _parse_kex(kex_data)
        assert len(kex) == 2
        assert kex[0].name == "curve25519-sha256"
        assert kex[0].is_weak is False
        assert kex[1].name == "diffie-hellman-group1-sha1"
        assert kex[1].is_weak is True

    def test_parse_empty_kex_list(self) -> None:
        """Test parsing empty KEX list returns empty tuple."""
        assert _parse_kex([]) == ()
        assert _parse_kex(None) == ()


# =============================================================================
# Tests for MAC parsing
# =============================================================================


class TestParseMacs:
    """Tests for _parse_macs function."""

    def test_parse_valid_macs(self) -> None:
        """Test parsing valid MAC list."""
        mac_data = [
            {"algorithm": "hmac-sha2-256", "keysize": 256},
            {"algorithm": "hmac-md5", "keysize": 128},
        ]
        macs = _parse_macs(mac_data)
        assert len(macs) == 2
        assert macs[0].name == "hmac-sha2-256"
        assert macs[0].is_weak is False
        assert macs[1].name == "hmac-md5"
        assert macs[1].is_weak is True

    def test_parse_empty_mac_list(self) -> None:
        """Test parsing empty MAC list returns empty tuple."""
        assert _parse_macs([]) == ()
        assert _parse_macs(None) == ()


# =============================================================================
# Tests for host key parsing
# =============================================================================


class TestParseHostKeys:
    """Tests for _parse_host_keys function."""

    def test_parse_valid_host_keys(self) -> None:
        """Test parsing valid host key list."""
        key_data = [
            {"algorithm": "ssh-ed25519", "keysize": 256},
            {"algorithm": "rsa-sha2-512", "keysize": 4096},
        ]
        keys = _parse_host_keys(key_data)
        assert len(keys) == 2
        assert keys[0] == "ssh-ed25519"
        assert keys[1] == "rsa-sha2-512"

    def test_parse_empty_host_keys(self) -> None:
        """Test parsing empty host key list returns empty tuple."""
        assert _parse_host_keys([]) == ()
        assert _parse_host_keys(None) == ()


# =============================================================================
# Tests for complete JSON parsing
# =============================================================================


class TestParseSshAuditJson:
    """Tests for _parse_ssh_audit_json function."""

    def test_parse_complete_json(self, valid_ssh_audit_json: dict[str, Any]) -> None:
        """Test parsing complete ssh-audit JSON output."""
        result = _parse_ssh_audit_json(valid_ssh_audit_json, "192.168.1.1", 22)

        assert result.host == "192.168.1.1"
        assert result.port == 22
        assert result.success is True
        assert result.error_message is None

        # Auth methods
        assert result.publickey_enabled is True
        assert result.password_enabled is True
        assert result.keyboard_interactive_enabled is True

        # Version info
        assert result.ssh_version == "OpenSSH_8.9p1"
        assert result.protocol_version == "2"

        # Algorithms
        assert len(result.ciphers) == 3
        assert len(result.kex_algorithms) == 2
        assert len(result.mac_algorithms) == 2
        assert len(result.host_key_types) == 2

    def test_parse_minimal_json(self, minimal_ssh_audit_json: dict[str, Any]) -> None:
        """Test parsing minimal ssh-audit JSON output."""
        result = _parse_ssh_audit_json(minimal_ssh_audit_json, "10.0.0.1", 2222)

        assert result.host == "10.0.0.1"
        assert result.port == 2222
        assert result.success is True
        assert result.publickey_enabled is True
        assert result.password_enabled is False
        assert result.keyboard_interactive_enabled is False

    def test_parse_weak_config(self, weak_config_ssh_audit_json: dict[str, Any]) -> None:
        """Test parsing SSH config with weak algorithms."""
        result = _parse_ssh_audit_json(weak_config_ssh_audit_json, "192.168.1.100", 22)

        # All auth methods should show insecure state
        assert result.publickey_enabled is False
        assert result.password_enabled is True
        assert result.keyboard_interactive_enabled is True

        # Weak algorithm detection
        assert result.has_weak_ciphers() is True
        assert result.has_weak_kex() is True
        assert result.has_weak_macs() is True
        assert result.has_insecure_auth() is True

    def test_parse_publickey_only_config(
        self, publickey_only_json: dict[str, Any]
    ) -> None:
        """Test parsing secure publickey-only config."""
        result = _parse_ssh_audit_json(publickey_only_json, "10.0.0.50", 22)

        assert result.publickey_enabled is True
        assert result.password_enabled is False
        assert result.keyboard_interactive_enabled is False
        assert result.has_insecure_auth() is False

    def test_parse_with_userauth_field(self) -> None:
        """Test parsing when auth is in 'userauth' field instead of 'auth'."""
        data = {
            "banner": "SSH-2.0-OpenSSH_9.0",
            "userauth": ["publickey", "password"],
            "kex": [],
            "enc": [],
            "mac": [],
            "key": [],
        }
        result = _parse_ssh_audit_json(data, "host", 22)
        assert result.publickey_enabled is True
        assert result.password_enabled is True

    def test_parse_with_alternative_field_names(self) -> None:
        """Test parsing with alternative field names (ciphers, macs, host_keys)."""
        data = {
            "banner": "SSH-2.0-OpenSSH_9.0",
            "auth": ["publickey"],
            "kex": [{"algorithm": "curve25519-sha256"}],
            "ciphers": [{"algorithm": "aes256-gcm@openssh.com"}],
            "macs": [{"algorithm": "hmac-sha2-256"}],
            "host_keys": [{"algorithm": "ssh-ed25519"}],
        }
        result = _parse_ssh_audit_json(data, "host", 22)
        assert len(result.ciphers) == 1
        assert len(result.mac_algorithms) == 1
        assert len(result.host_key_types) == 1


# =============================================================================
# Tests for SSHProbeResult dataclass
# =============================================================================


class TestSSHProbeResult:
    """Tests for SSHProbeResult dataclass methods."""

    def test_to_dict_serialization(self, valid_ssh_audit_json: dict[str, Any]) -> None:
        """Test to_dict produces JSON-serializable output."""
        result = _parse_ssh_audit_json(valid_ssh_audit_json, "192.168.1.1", 22)
        data = result.to_dict()

        # Should be JSON-serializable
        import json

        json_str = json.dumps(data)
        assert json_str is not None

        # Check structure
        assert data["host"] == "192.168.1.1"
        assert data["port"] == 22
        assert data["success"] is True
        assert isinstance(data["ciphers"], list)
        assert isinstance(data["kex_algorithms"], list)
        assert isinstance(data["mac_algorithms"], list)
        assert isinstance(data["host_key_types"], list)

    def test_has_weak_ciphers_true(self) -> None:
        """Test has_weak_ciphers returns True when weak cipher present."""
        result = SSHProbeResult(
            host="test",
            port=22,
            success=True,
            ciphers=(AlgorithmInfo(name="3des-cbc", is_weak=True),),
        )
        assert result.has_weak_ciphers() is True

    def test_has_weak_ciphers_false(self) -> None:
        """Test has_weak_ciphers returns False when no weak ciphers."""
        result = SSHProbeResult(
            host="test",
            port=22,
            success=True,
            ciphers=(AlgorithmInfo(name="aes256-gcm", is_weak=False),),
        )
        assert result.has_weak_ciphers() is False

    def test_has_insecure_auth_password(self) -> None:
        """Test has_insecure_auth returns True for password auth."""
        result = SSHProbeResult(
            host="test",
            port=22,
            success=True,
            password_enabled=True,
        )
        assert result.has_insecure_auth() is True

    def test_has_insecure_auth_keyboard_interactive(self) -> None:
        """Test has_insecure_auth returns True for keyboard-interactive."""
        result = SSHProbeResult(
            host="test",
            port=22,
            success=True,
            keyboard_interactive_enabled=True,
        )
        assert result.has_insecure_auth() is True

    def test_has_insecure_auth_publickey_only(self) -> None:
        """Test has_insecure_auth returns False for publickey-only."""
        result = SSHProbeResult(
            host="test",
            port=22,
            success=True,
            publickey_enabled=True,
            password_enabled=False,
            keyboard_interactive_enabled=False,
        )
        assert result.has_insecure_auth() is False


# =============================================================================
# Tests for AlgorithmInfo dataclass
# =============================================================================


class TestAlgorithmInfo:
    """Tests for AlgorithmInfo dataclass."""

    def test_to_dict(self) -> None:
        """Test AlgorithmInfo to_dict serialization."""
        info = AlgorithmInfo(
            name="aes256-gcm",
            keysize=256,
            is_weak=False,
            notes=["[INFO] secure"],
        )
        data = info.to_dict()
        assert data["name"] == "aes256-gcm"
        assert data["keysize"] == 256
        assert data["is_weak"] is False
        assert data["notes"] == ["[INFO] secure"]


# =============================================================================
# Tests for probe_ssh function with mocking
# =============================================================================


class TestProbeAuthMethodsNmap:
    """Tests for _probe_auth_methods_nmap function."""

    NMAP_XML_PASSWORD_PUBKEY = """<?xml version="1.0"?>
<nmaprun>
<host><ports><port protocol="tcp" portid="22">
<state state="open"/>
<script id="ssh-auth-methods" output="Supported authentication methods: publickey password">
<table key="Supported authentication methods">
<elem>publickey</elem>
<elem>password</elem>
</table>
</script>
</port></ports></host>
</nmaprun>"""

    NMAP_XML_ALL_METHODS = """<?xml version="1.0"?>
<nmaprun>
<host><ports><port protocol="tcp" portid="22">
<state state="open"/>
<script id="ssh-auth-methods">
<table key="Supported authentication methods">
<elem>publickey</elem>
<elem>password</elem>
<elem>keyboard-interactive</elem>
</table>
</script>
</port></ports></host>
</nmaprun>"""

    NMAP_XML_PUBKEY_ONLY = """<?xml version="1.0"?>
<nmaprun>
<host><ports><port protocol="tcp" portid="22">
<state state="open"/>
<script id="ssh-auth-methods">
<table key="Supported authentication methods">
<elem>publickey</elem>
</table>
</script>
</port></ports></host>
</nmaprun>"""

    NMAP_XML_NO_SCRIPT = """<?xml version="1.0"?>
<nmaprun>
<host><ports><port protocol="tcp" portid="22">
<state state="open"/>
</port></ports></host>
</nmaprun>"""

    def test_password_and_publickey(self) -> None:
        """Test detection of password and publickey auth."""
        mock_result = MagicMock()
        mock_result.stdout = self.NMAP_XML_PASSWORD_PUBKEY

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is True
        assert password is True
        assert kbd is False

    def test_all_methods(self) -> None:
        """Test detection of all auth methods."""
        mock_result = MagicMock()
        mock_result.stdout = self.NMAP_XML_ALL_METHODS

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is True
        assert password is True
        assert kbd is True

    def test_publickey_only(self) -> None:
        """Test detection of publickey-only auth."""
        mock_result = MagicMock()
        mock_result.stdout = self.NMAP_XML_PUBKEY_ONLY

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is True
        assert password is False
        assert kbd is False

    def test_no_script_output(self) -> None:
        """Test graceful handling when NSE script is absent."""
        mock_result = MagicMock()
        mock_result.stdout = self.NMAP_XML_NO_SCRIPT

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is False
        assert password is False
        assert kbd is False

    def test_timeout(self) -> None:
        """Test timeout returns all False."""
        import subprocess

        with patch(
            "src.ssh_probe.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="nmap", timeout=10),
        ):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is False
        assert password is False
        assert kbd is False

    def test_nmap_not_found(self) -> None:
        """Test nmap not installed returns all False."""
        with patch(
            "src.ssh_probe.subprocess.run",
            side_effect=FileNotFoundError("nmap"),
        ):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is False
        assert password is False
        assert kbd is False

    def test_empty_output(self) -> None:
        """Test empty nmap output returns all False."""
        mock_result = MagicMock()
        mock_result.stdout = ""

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result):
            pubkey, password, kbd = _probe_auth_methods_nmap("192.168.1.1", 22)

        assert pubkey is False
        assert password is False
        assert kbd is False


_NMAP_AUTH_MOCK = patch(
    "src.ssh_probe._probe_auth_methods_nmap", return_value=(False, False, False)
)


class TestProbeSSH:
    """Tests for probe_ssh function with subprocess mocking."""

    def test_probe_ssh_success(self, valid_ssh_audit_json: dict[str, Any]) -> None:
        """Test successful SSH probe."""
        import json

        mock_result = MagicMock()
        mock_result.stdout = json.dumps(valid_ssh_audit_json)
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result), _NMAP_AUTH_MOCK:
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is True
        assert result.host == "192.168.1.1"
        assert result.port == 22
        assert result.publickey_enabled is True

    def test_probe_ssh_timeout(self) -> None:
        """Test SSH probe timeout handling."""
        import subprocess

        with (
            patch(
                "src.ssh_probe.subprocess.run",
                side_effect=subprocess.TimeoutExpired(cmd="ssh-audit", timeout=10),
            ),
            _NMAP_AUTH_MOCK,
        ):
            result = probe_ssh("192.168.1.1", 22, timeout=10)

        assert result.success is False
        assert "timed out" in result.error_message.lower()  # type: ignore[union-attr]
        assert result.host == "192.168.1.1"
        assert result.port == 22

    def test_probe_ssh_connection_refused(self) -> None:
        """Test SSH probe connection refused handling."""
        mock_result = MagicMock()
        mock_result.stdout = ""
        mock_result.stderr = "Connection refused"
        mock_result.returncode = 1

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result), _NMAP_AUTH_MOCK:
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is False
        assert result.error_message is not None

    def test_probe_ssh_command_not_found(self) -> None:
        """Test handling when ssh-audit is not installed."""
        with (
            patch(
                "src.ssh_probe.subprocess.run",
                side_effect=FileNotFoundError("ssh-audit"),
            ),
            _NMAP_AUTH_MOCK,
        ):
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is False
        assert "not found" in result.error_message.lower()  # type: ignore[union-attr]

    def test_probe_ssh_malformed_json(self) -> None:
        """Test handling malformed JSON output."""
        mock_result = MagicMock()
        mock_result.stdout = "not valid json {"
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result), _NMAP_AUTH_MOCK:
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is False
        assert "invalid json" in result.error_message.lower()  # type: ignore[union-attr]

    def test_probe_ssh_empty_output(self) -> None:
        """Test handling empty output from ssh-audit."""
        mock_result = MagicMock()
        mock_result.stdout = ""
        mock_result.stderr = "Connection timed out"
        mock_result.returncode = 1

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result), _NMAP_AUTH_MOCK:
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is False
        assert result.error_message is not None

    def test_probe_ssh_os_error(self) -> None:
        """Test handling OS errors during probe."""
        with (
            patch(
                "src.ssh_probe.subprocess.run",
                side_effect=OSError("Permission denied"),
            ),
            _NMAP_AUTH_MOCK,
        ):
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is False
        assert "execution error" in result.error_message.lower()  # type: ignore[union-attr]

    def test_probe_ssh_custom_port(self, valid_ssh_audit_json: dict[str, Any]) -> None:
        """Test SSH probe with custom port."""
        import json

        mock_result = MagicMock()
        mock_result.stdout = json.dumps(valid_ssh_audit_json)
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result) as mock_run, _NMAP_AUTH_MOCK:
            result = probe_ssh("192.168.1.1", 2222)

        assert result.success is True
        assert result.port == 2222
        # Verify correct target was passed
        call_args = mock_run.call_args[0][0]
        assert "192.168.1.1:2222" in call_args

    def test_probe_ssh_custom_timeout(self, valid_ssh_audit_json: dict[str, Any]) -> None:
        """Test SSH probe with custom timeout."""
        import json

        mock_result = MagicMock()
        mock_result.stdout = json.dumps(valid_ssh_audit_json)
        mock_result.stderr = ""
        mock_result.returncode = 0

        with patch("src.ssh_probe.subprocess.run", return_value=mock_result) as mock_run, _NMAP_AUTH_MOCK:
            probe_ssh("192.168.1.1", 22, timeout=30)

        # Verify timeout was passed (subprocess timeout should be timeout + 5)
        call_kwargs = mock_run.call_args[1]
        assert call_kwargs["timeout"] == 35

    def test_probe_ssh_nmap_supplements_auth(self) -> None:
        """Test that nmap auth methods supplement ssh-audit results."""
        import json

        # ssh-audit returns no auth methods (realistic scenario)
        ssh_audit_data = {
            "banner": "SSH-2.0-OpenSSH_8.9p1",
            "kex": [{"algorithm": "curve25519-sha256"}],
            "enc": [{"algorithm": "aes256-gcm@openssh.com"}],
            "mac": [{"algorithm": "hmac-sha2-256"}],
            "key": [{"algorithm": "ssh-ed25519"}],
        }

        mock_result = MagicMock()
        mock_result.stdout = json.dumps(ssh_audit_data)
        mock_result.stderr = ""
        mock_result.returncode = 0

        # nmap detects password and publickey
        with (
            patch("src.ssh_probe.subprocess.run", return_value=mock_result),
            patch(
                "src.ssh_probe._probe_auth_methods_nmap",
                return_value=(True, True, False),
            ),
        ):
            result = probe_ssh("192.168.1.1", 22)

        assert result.success is True
        assert result.publickey_enabled is True
        assert result.password_enabled is True
        assert result.keyboard_interactive_enabled is False
