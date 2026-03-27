"""SSH version parsing utilities shared across routers and services."""

import re


def parse_ssh_version(version_str: str | None) -> tuple[int, int, int] | None:
    """Parse SSH version string into a (major, minor, patch) tuple.

    Handles various SSH version formats:
    - "OpenSSH_8.2p1" -> (8, 2, 0)
    - "OpenSSH_7.9"   -> (7, 9, 0)
    - "8.2p1"         -> (8, 2, 0)
    - "8.2"           -> (8, 2, 0)
    - "8"             -> (8, 0, 0)

    Returns None if version cannot be parsed.

    Uses tuple comparison to avoid float precision bugs
    (e.g., "8.10" would incorrectly become 8.1 as a float).
    """
    if not version_str:
        return None

    cleaned = version_str
    for prefix in ["OpenSSH_", "SSH-", "openssh_", "ssh-"]:
        if cleaned.startswith(prefix):
            cleaned = cleaned[len(prefix) :]
            break

    # Also handle inline "OpenSSH_X.Y" embedded in a longer string
    match = re.search(r"OpenSSH[_\s]?(\d+)\.(\d+)", version_str, re.IGNORECASE)
    if match:
        return (int(match.group(1)), int(match.group(2)), 0)

    match = re.match(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:p\d+)?", cleaned)
    if not match:
        return None

    major = int(match.group(1))
    minor = int(match.group(2)) if match.group(2) else 0
    patch = int(match.group(3)) if match.group(3) else 0

    return (major, minor, patch)


def is_version_outdated(version_str: str | None, threshold_str: str) -> bool:
    """Return True if version_str is below the threshold version.

    Returns False if either version cannot be parsed.
    """
    parsed = parse_ssh_version(version_str)
    threshold = parse_ssh_version(threshold_str)
    if parsed is None or threshold is None:
        return False
    return parsed < threshold
