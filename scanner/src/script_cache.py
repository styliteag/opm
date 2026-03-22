"""Local cache for custom NSE scripts pulled from the backend."""

from __future__ import annotations

import json
import logging
import os
import tempfile
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.client import ScannerClient

CUSTOM_SCRIPTS_DIR = Path("/opt/opm/custom-scripts")
HASHES_FILE = CUSTOM_SCRIPTS_DIR / ".hashes.json"

logger = logging.getLogger(__name__)


def _load_local_hashes() -> dict[str, str]:
    """Load the locally cached {name: hash} mapping."""
    if not HASHES_FILE.is_file():
        return {}
    try:
        return json.loads(HASHES_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_local_hashes(hashes: dict[str, str]) -> None:
    """Persist the local hash mapping atomically."""
    CUSTOM_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    data = json.dumps(hashes, indent=2)
    # Atomic write: temp file + rename
    fd, tmp_path = tempfile.mkstemp(dir=str(CUSTOM_SCRIPTS_DIR), suffix=".tmp")
    try:
        os.write(fd, data.encode("utf-8"))
        os.close(fd)
        os.rename(tmp_path, str(HASHES_FILE))
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def ensure_scripts_cached(
    client: ScannerClient,
    custom_script_hashes: dict[str, str],
) -> None:
    """Ensure all custom scripts are cached locally with correct content.

    Downloads scripts whose local hash doesn't match the expected hash.

    Args:
        client: Scanner API client for downloading scripts
        custom_script_hashes: {script_name: expected_content_hash} from job payload
    """
    if not custom_script_hashes:
        return

    CUSTOM_SCRIPTS_DIR.mkdir(parents=True, exist_ok=True)
    local_hashes = _load_local_hashes()
    updated = False

    for name, expected_hash in custom_script_hashes.items():
        local_hash = local_hashes.get(name)
        script_path = CUSTOM_SCRIPTS_DIR / f"{name}.nse"

        if local_hash == expected_hash and script_path.is_file():
            logger.debug("Script %s cache hit (hash matches)", name)
            continue

        logger.info("Downloading custom script %s (hash mismatch or missing)", name)
        try:
            content, content_hash = client.download_script(name)
        except Exception:
            logger.exception("Failed to download custom script %s", name)
            continue

        # Write atomically
        fd, tmp_path = tempfile.mkstemp(
            dir=str(CUSTOM_SCRIPTS_DIR), suffix=".nse.tmp"
        )
        try:
            os.write(fd, content.encode("utf-8"))
            os.close(fd)
            os.rename(tmp_path, str(script_path))
            local_hashes[name] = content_hash
            updated = True
            logger.info("Cached custom script %s (%s)", name, content_hash[:12])
        except Exception:
            try:
                os.close(fd)
            except OSError:
                pass
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            logger.exception("Failed to write custom script %s to cache", name)

    if updated:
        _save_local_hashes(local_hashes)


def get_script_path(name: str) -> Path:
    """Get the full filesystem path to a cached custom script."""
    return CUSTOM_SCRIPTS_DIR / f"{name}.nse"


def is_custom(name: str) -> bool:
    """Check if a script name refers to a custom script."""
    return name.startswith("custom_")
