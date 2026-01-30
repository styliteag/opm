"""SSH probe module for security analysis using ssh-audit.

This module provides functionality to probe SSH services and extract security
configuration data including authentication methods, ciphers, key exchange
algorithms, and version information.
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass, field
from typing import Any

# Default timeout for SSH probes in seconds
DEFAULT_SSH_PROBE_TIMEOUT = 10

# Classification of weak algorithms based on ssh-audit recommendations
# These are algorithms that should be avoided for security reasons
WEAK_CIPHERS = frozenset({
    # DES family
    "des-cbc",
    "des",
    "3des-cbc",
    "3des",
    # RC4 family
    "arcfour",
    "arcfour128",
    "arcfour256",
    # Blowfish
    "blowfish-cbc",
    "blowfish",
    # CBC mode ciphers (vulnerable to BEAST-style attacks)
    "aes128-cbc",
    "aes192-cbc",
    "aes256-cbc",
    "cast128-cbc",
    "rijndael-cbc@lysator.liu.se",
})

WEAK_KEX = frozenset({
    # Weak Diffie-Hellman groups
    "diffie-hellman-group1-sha1",
    "diffie-hellman-group14-sha1",
    "diffie-hellman-group-exchange-sha1",
    # ECDH with potentially problematic curves
    "ecdh-sha2-nistp256",
    "ecdh-sha2-nistp384",
    "ecdh-sha2-nistp521",
})

WEAK_MACS = frozenset({
    # MD5-based MACs
    "hmac-md5",
    "hmac-md5-96",
    "hmac-md5-etm@openssh.com",
    "hmac-md5-96-etm@openssh.com",
    # SHA1-based MACs (weaker than SHA2)
    "hmac-sha1",
    "hmac-sha1-96",
    "hmac-sha1-etm@openssh.com",
    "hmac-sha1-96-etm@openssh.com",
    # RIPEMD (less common, potentially weaker)
    "hmac-ripemd160",
    "hmac-ripemd160@openssh.com",
    "hmac-ripemd160-etm@openssh.com",
})

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AlgorithmInfo:
    """Information about a cryptographic algorithm with security classification."""

    name: str
    keysize: int | None = None
    is_weak: bool = False
    notes: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        return {
            "name": self.name,
            "keysize": self.keysize,
            "is_weak": self.is_weak,
            "notes": self.notes,
        }


@dataclass(frozen=True)
class SSHProbeResult:
    """Result of an SSH security probe.

    Contains all security-relevant information extracted from an SSH service
    including authentication methods, cryptographic algorithms, and version
    information.
    """

    host: str
    port: int
    success: bool
    error_message: str | None = None

    # Authentication methods
    publickey_enabled: bool = False
    password_enabled: bool = False
    keyboard_interactive_enabled: bool = False

    # SSH metadata
    ssh_version: str | None = None
    protocol_version: str | None = None
    server_banner: str | None = None

    # Cryptographic algorithms with security classification
    ciphers: tuple[AlgorithmInfo, ...] = field(default_factory=tuple)
    kex_algorithms: tuple[AlgorithmInfo, ...] = field(default_factory=tuple)
    mac_algorithms: tuple[AlgorithmInfo, ...] = field(default_factory=tuple)
    host_key_types: tuple[str, ...] = field(default_factory=tuple)

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-serializable dictionary for API submission."""
        return {
            "host": self.host,
            "port": self.port,
            "success": self.success,
            "error_message": self.error_message,
            "publickey_enabled": self.publickey_enabled,
            "password_enabled": self.password_enabled,
            "keyboard_interactive_enabled": self.keyboard_interactive_enabled,
            "ssh_version": self.ssh_version,
            "protocol_version": self.protocol_version,
            "server_banner": self.server_banner,
            "ciphers": [c.to_dict() for c in self.ciphers],
            "kex_algorithms": [k.to_dict() for k in self.kex_algorithms],
            "mac_algorithms": [m.to_dict() for m in self.mac_algorithms],
            "host_key_types": list(self.host_key_types),
        }

    def has_weak_ciphers(self) -> bool:
        """Check if any weak ciphers are supported."""
        return any(c.is_weak for c in self.ciphers)

    def has_weak_kex(self) -> bool:
        """Check if any weak key exchange algorithms are supported."""
        return any(k.is_weak for k in self.kex_algorithms)

    def has_weak_macs(self) -> bool:
        """Check if any weak MAC algorithms are supported."""
        return any(m.is_weak for m in self.mac_algorithms)

    def has_insecure_auth(self) -> bool:
        """Check if password or keyboard-interactive auth is enabled."""
        return self.password_enabled or self.keyboard_interactive_enabled


def _classify_cipher(name: str) -> bool:
    """Determine if a cipher is considered weak."""
    name_lower = name.lower()
    return name_lower in WEAK_CIPHERS or any(
        weak in name_lower for weak in ("des", "rc4", "arcfour", "blowfish")
    )


def _classify_kex(name: str) -> bool:
    """Determine if a key exchange algorithm is considered weak."""
    name_lower = name.lower()
    return name_lower in WEAK_KEX or "sha1" in name_lower


def _classify_mac(name: str) -> bool:
    """Determine if a MAC algorithm is considered weak."""
    name_lower = name.lower()
    return name_lower in WEAK_MACS or "md5" in name_lower


def _extract_algorithm_notes(algo_data: dict[str, Any]) -> list[str]:
    """Extract notes (warnings, failures, info) from algorithm data."""
    notes: list[str] = []
    notes_obj = algo_data.get("notes", {})

    if isinstance(notes_obj, dict):
        for level in ("fail", "warn", "info"):
            level_notes = notes_obj.get(level, [])
            if isinstance(level_notes, list):
                for note in level_notes:
                    if isinstance(note, str) and note.strip():
                        notes.append(f"[{level.upper()}] {note}")

    return notes


def _parse_ciphers(enc_data: list[dict[str, Any]] | None) -> tuple[AlgorithmInfo, ...]:
    """Parse encryption algorithms from ssh-audit output."""
    if not enc_data:
        return ()

    ciphers: list[AlgorithmInfo] = []
    for item in enc_data:
        if not isinstance(item, dict):
            continue
        name = item.get("algorithm", "")
        if not name:
            continue

        keysize = item.get("keysize")
        if keysize is not None:
            try:
                keysize = int(keysize)
            except (ValueError, TypeError):
                keysize = None

        is_weak = _classify_cipher(name)
        notes = _extract_algorithm_notes(item)

        # Also mark as weak if ssh-audit flagged it
        if any("[FAIL]" in note for note in notes):
            is_weak = True

        ciphers.append(AlgorithmInfo(
            name=name,
            keysize=keysize,
            is_weak=is_weak,
            notes=notes,
        ))

    return tuple(ciphers)


def _parse_kex(kex_data: list[dict[str, Any]] | None) -> tuple[AlgorithmInfo, ...]:
    """Parse key exchange algorithms from ssh-audit output."""
    if not kex_data:
        return ()

    kex_list: list[AlgorithmInfo] = []
    for item in kex_data:
        if not isinstance(item, dict):
            continue
        name = item.get("algorithm", "")
        if not name:
            continue

        keysize = item.get("keysize")
        if keysize is not None:
            try:
                keysize = int(keysize)
            except (ValueError, TypeError):
                keysize = None

        is_weak = _classify_kex(name)
        notes = _extract_algorithm_notes(item)

        if any("[FAIL]" in note for note in notes):
            is_weak = True

        kex_list.append(AlgorithmInfo(
            name=name,
            keysize=keysize,
            is_weak=is_weak,
            notes=notes,
        ))

    return tuple(kex_list)


def _parse_macs(mac_data: list[dict[str, Any]] | None) -> tuple[AlgorithmInfo, ...]:
    """Parse MAC algorithms from ssh-audit output."""
    if not mac_data:
        return ()

    mac_list: list[AlgorithmInfo] = []
    for item in mac_data:
        if not isinstance(item, dict):
            continue
        name = item.get("algorithm", "")
        if not name:
            continue

        keysize = item.get("keysize")
        if keysize is not None:
            try:
                keysize = int(keysize)
            except (ValueError, TypeError):
                keysize = None

        is_weak = _classify_mac(name)
        notes = _extract_algorithm_notes(item)

        if any("[FAIL]" in note for note in notes):
            is_weak = True

        mac_list.append(AlgorithmInfo(
            name=name,
            keysize=keysize,
            is_weak=is_weak,
            notes=notes,
        ))

    return tuple(mac_list)


def _parse_host_keys(key_data: list[dict[str, Any]] | None) -> tuple[str, ...]:
    """Parse host key types from ssh-audit output."""
    if not key_data:
        return ()

    key_types: list[str] = []
    for item in key_data:
        if not isinstance(item, dict):
            continue
        name = item.get("algorithm", "")
        if name:
            key_types.append(name)

    return tuple(key_types)


def _parse_auth_methods(auth_data: list[str] | None) -> tuple[bool, bool, bool]:
    """Parse authentication methods from ssh-audit output.

    Returns:
        Tuple of (publickey_enabled, password_enabled, keyboard_interactive_enabled)
    """
    if not auth_data:
        return (False, False, False)

    publickey = False
    password = False
    keyboard_interactive = False

    for method in auth_data:
        if not isinstance(method, str):
            continue
        method_lower = method.lower()
        if "publickey" in method_lower:
            publickey = True
        if "password" in method_lower:
            password = True
        if "keyboard-interactive" in method_lower or "keyboard_interactive" in method_lower:
            keyboard_interactive = True

    return (publickey, password, keyboard_interactive)


def _parse_banner(banner: str | None) -> tuple[str | None, str | None]:
    """Parse SSH banner to extract version and protocol.

    SSH banners typically follow the format: SSH-<protocol>-<software> <comments>
    Example: SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.1

    Returns:
        Tuple of (ssh_version, protocol_version)
    """
    if not banner:
        return (None, None)

    ssh_version = None
    protocol_version = None

    # Extract protocol version from banner (e.g., "2.0" from "SSH-2.0-...")
    if banner.startswith("SSH-"):
        parts = banner[4:].split("-", 1)
        if parts:
            protocol_version = parts[0]

        # Extract software version (e.g., "OpenSSH_8.9p1")
        if len(parts) > 1:
            software_part = parts[1].split(" ", 1)[0]  # Remove comments
            ssh_version = software_part

    return (ssh_version, protocol_version)


def _parse_ssh_audit_json(data: dict[str, Any], host: str, port: int) -> SSHProbeResult:
    """Parse ssh-audit JSON output into an SSHProbeResult.

    Args:
        data: Parsed JSON data from ssh-audit
        host: Target host IP/hostname
        port: Target port

    Returns:
        SSHProbeResult with extracted security information
    """
    # Extract banner and version info
    banner = data.get("banner")
    if isinstance(banner, dict):
        # ssh-audit may nest banner info
        server_banner = banner.get("raw", banner.get("banner", ""))
        protocol = banner.get("protocol")
        software = banner.get("software")
        if protocol:
            protocol_version = str(protocol[0]) if isinstance(protocol, list) else str(protocol)
        else:
            protocol_version = None
        if software:
            ssh_version = str(software)
        else:
            ssh_version = None

        # If we didn't get structured data, try parsing the raw banner
        if not ssh_version or not protocol_version:
            parsed_version, parsed_protocol = _parse_banner(server_banner)
            ssh_version = ssh_version or parsed_version
            protocol_version = protocol_version or parsed_protocol
    elif isinstance(banner, str):
        server_banner = banner
        ssh_version, protocol_version = _parse_banner(banner)
    else:
        server_banner = None
        ssh_version = None
        protocol_version = None

    # Parse authentication methods
    # ssh-audit stores auth methods in "auth" field or "userauth" field
    auth_methods = data.get("auth", data.get("userauth", []))
    publickey, password, keyboard_interactive = _parse_auth_methods(auth_methods)

    # Parse cryptographic algorithms
    ciphers = _parse_ciphers(data.get("enc", data.get("ciphers", [])))
    kex_algorithms = _parse_kex(data.get("kex", []))
    mac_algorithms = _parse_macs(data.get("mac", data.get("macs", [])))
    host_key_types = _parse_host_keys(data.get("key", data.get("host_keys", [])))

    return SSHProbeResult(
        host=host,
        port=port,
        success=True,
        error_message=None,
        publickey_enabled=publickey,
        password_enabled=password,
        keyboard_interactive_enabled=keyboard_interactive,
        ssh_version=ssh_version,
        protocol_version=protocol_version,
        server_banner=server_banner,
        ciphers=ciphers,
        kex_algorithms=kex_algorithms,
        mac_algorithms=mac_algorithms,
        host_key_types=host_key_types,
    )


def probe_ssh(
    host: str,
    port: int = 22,
    timeout: int = DEFAULT_SSH_PROBE_TIMEOUT,
) -> SSHProbeResult:
    """Probe an SSH service and extract security configuration.

    Uses ssh-audit to connect to the SSH service and extract information about
    authentication methods, supported ciphers, key exchange algorithms, and
    version information.

    Args:
        host: Target host IP address or hostname
        port: Target port (default: 22)
        timeout: Connection timeout in seconds (default: 10)

    Returns:
        SSHProbeResult containing the security analysis results
    """
    target = f"{host}:{port}"
    logger.info("Probing SSH service at %s", target)

    # Build ssh-audit command
    # -j: JSON output
    # -T: Timeout
    command = [
        "ssh-audit",
        "-j",
        "-T", str(timeout),
        target,
    ]

    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout + 5,  # Allow extra time for process overhead
        )

        # ssh-audit may return non-zero for warnings, but still produce valid JSON
        output = result.stdout.strip()

        if not output:
            error_msg = result.stderr.strip() if result.stderr else "No output from ssh-audit"
            logger.warning("SSH probe failed for %s: %s", target, error_msg)
            return SSHProbeResult(
                host=host,
                port=port,
                success=False,
                error_message=error_msg,
            )

        try:
            data = json.loads(output)
        except json.JSONDecodeError as e:
            # Try to extract useful information from partial output
            logger.warning("Failed to parse ssh-audit JSON for %s: %s", target, e)
            return SSHProbeResult(
                host=host,
                port=port,
                success=False,
                error_message=f"Invalid JSON output: {e}",
            )

        return _parse_ssh_audit_json(data, host, port)

    except subprocess.TimeoutExpired:
        logger.warning("SSH probe timed out for %s after %d seconds", target, timeout)
        return SSHProbeResult(
            host=host,
            port=port,
            success=False,
            error_message=f"Connection timed out after {timeout} seconds",
        )

    except FileNotFoundError:
        logger.error("ssh-audit command not found; ensure it is installed")
        return SSHProbeResult(
            host=host,
            port=port,
            success=False,
            error_message="ssh-audit command not found",
        )

    except OSError as e:
        logger.error("Failed to execute ssh-audit for %s: %s", target, e)
        return SSHProbeResult(
            host=host,
            port=port,
            success=False,
            error_message=f"Execution error: {e}",
        )
