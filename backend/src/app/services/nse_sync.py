"""NSE script sync service — fetches scripts from nmap GitHub repository."""

from __future__ import annotations

import hashlib
import json
import logging
from pathlib import Path
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GITHUB_API_URL = "https://api.github.com/repos/nmap/nmap/contents/scripts"
SYNC_STATE_FILENAME = ".sync-state.json"


def _load_sync_state(scripts_dir: str) -> dict[str, Any]:
    """Load sync state from the JSON file in the scripts directory."""
    state_path = Path(scripts_dir) / SYNC_STATE_FILENAME
    if not state_path.is_file():
        return {"last_sync": None, "script_hashes": {}}
    try:
        return dict(json.loads(state_path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, OSError) as exc:
        logger.warning("Failed to read sync state: %s", exc)
        return {"last_sync": None, "script_hashes": {}}


def _save_sync_state(scripts_dir: str, state: dict[str, Any]) -> None:
    """Persist sync state to the JSON file in the scripts directory."""
    state_path = Path(scripts_dir) / SYNC_STATE_FILENAME
    state_path.parent.mkdir(parents=True, exist_ok=True)
    state_path.write_text(
        json.dumps(state, indent=2, default=str),
        encoding="utf-8",
    )


def _compute_hash(content: bytes) -> str:
    """Compute SHA-256 hash of file content."""
    return hashlib.sha256(content).hexdigest()


async def sync_from_nmap_github(
    scripts_dir: str,
) -> dict[str, int | list[str]]:
    """Sync NSE scripts from the nmap GitHub repository.

    Fetches the directory listing from GitHub, compares content hashes,
    and downloads new or changed .nse files.

    Returns a summary dict: { added, updated, unchanged, errors }.
    """
    state = _load_sync_state(scripts_dir)
    script_hashes: dict[str, str] = dict(state.get("script_hashes", {}))

    added = 0
    updated = 0
    unchanged = 0
    errors: list[str] = []

    scripts_path = Path(scripts_dir)
    scripts_path.mkdir(parents=True, exist_ok=True)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Fetch directory listing from GitHub API
        try:
            resp = await client.get(
                GITHUB_API_URL,
                headers={"Accept": "application/vnd.github.v3+json"},
            )
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            error_msg = f"Failed to fetch script listing from GitHub: {exc}"
            logger.error(error_msg)
            return {"added": 0, "updated": 0, "unchanged": 0, "errors": [error_msg]}

        entries: list[dict[str, Any]] = resp.json()

        # Filter for .nse files only
        nse_entries = [
            e for e in entries
            if isinstance(e, dict)
            and e.get("name", "").endswith(".nse")
            and e.get("download_url")
        ]

        for entry in nse_entries:
            filename = str(entry["name"])
            download_url = str(entry["download_url"])

            try:
                file_resp = await client.get(download_url)
                file_resp.raise_for_status()
            except httpx.HTTPError as exc:
                error_msg = f"Failed to download {filename}: {exc}"
                logger.warning(error_msg)
                errors.append(error_msg)
                continue

            content = file_resp.content
            content_hash = _compute_hash(content)

            existing_hash = script_hashes.get(filename)

            if existing_hash == content_hash:
                unchanged += 1
                continue

            # Write the file
            try:
                file_path = scripts_path / filename
                file_path.write_bytes(content)
            except OSError as exc:
                error_msg = f"Failed to write {filename}: {exc}"
                logger.warning(error_msg)
                errors.append(error_msg)
                continue

            if existing_hash is None:
                added += 1
            else:
                updated += 1

            script_hashes[filename] = content_hash

    # Persist updated state
    from datetime import datetime, timezone

    new_state: dict[str, Any] = {
        "last_sync": datetime.now(timezone.utc).isoformat(),
        "script_hashes": script_hashes,
    }
    _save_sync_state(scripts_dir, new_state)

    return {
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "errors": errors,
    }


def get_sync_status(scripts_dir: str) -> dict[str, Any]:
    """Return the last sync status from the state file."""
    state = _load_sync_state(scripts_dir)
    return {
        "last_sync": state.get("last_sync"),
        "script_count": len(state.get("script_hashes", {})),
    }
