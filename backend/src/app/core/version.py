"""Version module for reading application version from VERSION file or environment."""

import os
from pathlib import Path


def get_version() -> str:
    """Get the application version from VERSION file or APP_VERSION environment variable.

    Checks /app/VERSION file first, then falls back to APP_VERSION env var, then 'unknown'.

    Returns:
        str: The version string, or 'unknown' if not found.
    """
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
