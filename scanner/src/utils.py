"""Utility functions for the scanner agent."""

from __future__ import annotations

import logging
import os
import re
import shlex
import socket
import sys
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from src.models import ScannerConfig
    from src.threading_utils import LogBufferHandler

# Constants
DEFAULT_POLL_INTERVAL = 60
IPV6_CONNECTIVITY_TARGETS = (
    "2001:4860:4860::8888",
    "2606:4700:4700::1111",
)
IPV6_CONNECTIVITY_TIMEOUT_SECONDS = 3.0

# Regex patterns for progress parsing
MASSCAN_PROGRESS_PATTERN = re.compile(
    r"rate:\s*[\d,]+(?:\.\d+)?[^\d]*"  # rate prefix
    r"(\d+(?:\.\d+)?)\s*%"  # capture percentage
)
NMAP_PROGRESS_PATTERN = re.compile(
    r"(?:About\s+)?(\d+(?:\.\d+)?)\s*%\s*done",  # e.g., "About 45.23% done" or "45.23% done"
    re.IGNORECASE,
)


def format_command(command: list[str]) -> str:
    """Return a shell-safe representation of the command for logging."""
    return shlex.join(command)


def normalize_log_level(level_name: str) -> str:
    """Normalize log level names to standard values."""
    if level_name.lower() in {"warning", "warn"}:
        return "warning"
    if level_name.lower() in {"error", "critical"}:
        return "error"
    return "info"


def parse_int(value: Any) -> int | None:
    """Safely parse a value to int, returning None on failure."""
    if value is None:
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def split_port_spec(port_spec: str) -> tuple[str, str | None]:
    """Split port specification into includes and excludes.

    Args:
        port_spec: Port specification string (e.g., "80,443,!88")

    Returns:
        Tuple of (include_spec, exclude_spec)
    """
    includes: list[str] = []
    excludes: list[str] = []
    for raw_part in port_spec.split(","):
        part = raw_part.strip()
        if not part:
            continue
        if part.startswith("!"):
            exclude_value = part[1:].strip()
            if exclude_value:
                excludes.append(exclude_value)
        else:
            includes.append(part)
    include_spec = ",".join(includes) if includes else "1-65535"
    exclude_spec = ",".join(excludes) if excludes else None
    return include_spec, exclude_spec


def sanitize_cidr(cidr: str) -> str:
    """Validate and sanitize CIDR notation for safe use in subprocess commands.

    This function provides defensive validation to ensure CIDR strings received
    from the backend API are safe to use in subprocess commands.

    Args:
        cidr: CIDR notation string (e.g., "192.168.1.0/24" or "2001:db8::/32")

    Returns:
        Validated CIDR string

    Raises:
        ValueError: If CIDR format is invalid or contains unsafe characters
    """
    import ipaddress

    if not cidr or not isinstance(cidr, str):
        raise ValueError("CIDR must be a non-empty string")

    # Strip whitespace
    cidr = cidr.strip()

    # Check if empty after stripping
    if not cidr:
        raise ValueError("CIDR must be a non-empty string")

    # Check for any shell metacharacters or control characters that should never be in a CIDR
    # Allow only alphanumeric, dots, colons, slashes, and hyphens
    if not re.match(r"^[a-fA-F0-9.:/\-]+$", cidr):
        raise ValueError(f"CIDR contains invalid characters: {cidr}")

    # Validate using ipaddress module (same as backend validation)
    try:
        ipaddress.ip_network(cidr, strict=False)
    except ValueError as e:
        raise ValueError(f"Invalid CIDR format: {e}") from e

    return cidr


def sanitize_port_spec(port_spec: str) -> str:
    """Validate and sanitize port specification for safe use in subprocess commands.

    This function provides defensive validation to ensure port specifications received
    from the backend API are safe to use in subprocess commands.

    Args:
        port_spec: Port specification string (e.g., "80,443,8000-9000,!88")

    Returns:
        Validated port specification string

    Raises:
        ValueError: If port specification is invalid or contains unsafe characters
    """
    if not port_spec or not isinstance(port_spec, str):
        raise ValueError("Port specification must be a non-empty string")

    # Strip whitespace
    port_spec = port_spec.strip()

    # Check if empty after stripping
    if not port_spec:
        raise ValueError("Port specification must be a non-empty string")

    # Check for shell metacharacters or control characters
    # Allow only digits, commas, hyphens, exclamation marks, and protocol prefixes (T:, U:)
    if not re.match(r"^[0-9,\-!TU:]+$", port_spec):
        raise ValueError(f"Port specification contains invalid characters: {port_spec}")

    # Split by comma and validate each segment
    segments = [s.strip() for s in port_spec.split(",")]

    for segment in segments:
        if not segment:
            raise ValueError("Port specification contains empty segment")

        # Handle exclusion prefix
        port_str = segment.lstrip("!")

        # Handle protocol prefix (for masscan format like "T:80" or "U:53")
        if port_str.startswith(("T:", "U:")):
            port_str = port_str[2:]

        # Check for range
        if "-" in port_str:
            parts = port_str.split("-")
            if len(parts) != 2:
                raise ValueError(f"Invalid port range format: {segment}")
            try:
                start = int(parts[0])
                end = int(parts[1])
                if not (1 <= start <= 65535 and 1 <= end <= 65535):
                    raise ValueError(f"Port out of range (1-65535): {segment}")
                if start > end:
                    raise ValueError(f"Invalid port range (start > end): {segment}")
            except ValueError as e:
                if "invalid literal" in str(e):
                    raise ValueError(f"Invalid port number in range: {segment}") from e
                raise
        else:
            # Single port
            try:
                port = int(port_str)
                if not (1 <= port <= 65535):
                    raise ValueError(f"Port out of range (1-65535): {segment}")
            except ValueError as e:
                if "invalid literal" in str(e):
                    raise ValueError(f"Invalid port number: {segment}") from e
                raise

    return port_spec


def check_ipv6_connectivity(logger: logging.Logger) -> bool:
    """Check if IPv6 connectivity is available.

    Args:
        logger: Logger instance

    Returns:
        True if IPv6 is available, False otherwise
    """
    logger.info("Checking IPv6 connectivity before scan")
    for target in IPV6_CONNECTIVITY_TARGETS:
        try:
            with socket.create_connection(
                (target, 53),
                timeout=IPV6_CONNECTIVITY_TIMEOUT_SECONDS,
            ):
                logger.info("IPv6 connectivity check succeeded (%s)", target)
                return True
        except OSError as exc:
            logger.warning("IPv6 connectivity check failed for %s: %s", target, exc)
    logger.error("IPv6 connectivity not available")
    return False


def parse_masscan_progress(line: str) -> float | None:
    """Parse masscan stderr to extract progress percentage.

    Masscan outputs progress like:
    rate:  0.00-kpps, 0.00% done,   0:00:00 remaining, found=0

    Args:
        line: Output line from masscan

    Returns:
        Progress percentage or None
    """
    match = MASSCAN_PROGRESS_PATTERN.search(line)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, TypeError):
            pass
    return None


def parse_nmap_progress(line: str) -> float | None:
    """Parse nmap stderr to extract progress percentage.

    Nmap with --stats-every outputs progress like:
    Stats: 0:00:05 elapsed; 0 hosts completed (1 up), 1 undergoing SYN Stealth Scan
    SYN Stealth Scan Timing: About 45.23% done; ETC: 12:34 (0:00:05 remaining)

    Args:
        line: Output line from nmap

    Returns:
        Progress percentage or None
    """
    match = NMAP_PROGRESS_PATTERN.search(line)
    if match:
        try:
            return float(match.group(1))
        except (ValueError, TypeError):
            pass
    return None


def load_config() -> ScannerConfig:
    """Load scanner configuration from environment variables.

    Returns:
        ScannerConfig instance

    Raises:
        SystemExit: If required environment variables are missing
    """
    from src.models import ScannerConfig

    backend_url = os.environ.get("BACKEND_URL")
    api_key = os.environ.get("API_KEY")
    if not backend_url or not api_key:
        raise SystemExit("BACKEND_URL and API_KEY must be set")

    poll_interval_raw = os.environ.get("POLL_INTERVAL", str(DEFAULT_POLL_INTERVAL))
    log_level = os.environ.get("LOG_LEVEL", "INFO")

    try:
        poll_interval = int(poll_interval_raw)
    except ValueError:
        poll_interval = DEFAULT_POLL_INTERVAL

    if poll_interval < 5:
        poll_interval = 5

    return ScannerConfig(
        backend_url=backend_url.rstrip("/"),
        api_key=api_key,
        poll_interval=poll_interval,
        log_level=log_level,
    )


def configure_logging(level: str, buffer_handler: LogBufferHandler) -> logging.Logger:
    """Configure logging with stream and buffer handlers.

    Args:
        level: Log level string
        buffer_handler: Buffer handler for collecting logs

    Returns:
        Logger instance
    """
    logger = logging.getLogger("scanner")
    root = logging.getLogger()
    root.handlers.clear()
    if isinstance(level, str):
        normalized_level = getattr(logging, level.upper(), logging.INFO)
    else:
        normalized_level = logging.INFO
    root.setLevel(normalized_level)

    formatter = logging.Formatter("%(asctime)s - %(name)s - %(levelname)s - %(message)s")

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)

    root.addHandler(stream_handler)
    root.addHandler(buffer_handler)

    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)

    return logger


def get_version() -> str:
    """Get scanner version from VERSION file or APP_VERSION environment variable.

    Checks /app/VERSION file first, then falls back to APP_VERSION env var, then 'unknown'.

    Returns:
        Version string
    """
    from pathlib import Path

    # Try reading from VERSION file first (for dev mode with mounted file)
    version_file = Path("/app/VERSION")
    if version_file.exists():
        try:
            version = version_file.read_text().strip()
            if version:
                return version
        except Exception:
            pass

    # Fall back to environment variable (for production builds)
    return os.environ.get("APP_VERSION", "unknown")
