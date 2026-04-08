"""Service for querying database migration state."""

import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations" / "versions"


def get_head_revision() -> str | None:
    """Get the latest available migration revision by reading revision IDs from files.

    Parses the `revision` variable from each migration file to find the actual
    Alembic head. Supports both sequential (001, 002) and hash-style IDs.
    """
    if not MIGRATIONS_DIR.exists():
        return None

    # Build dependency chain: revision -> down_revision
    revisions: dict[str, str | None] = {}
    for f in MIGRATIONS_DIR.glob("*.py"):
        if f.name.startswith("__") or f.name == ".gitkeep":
            continue
        content = f.read_text()
        rev = _extract_var(content, "revision")
        down_rev = _extract_var(content, "down_revision")
        if rev is not None:
            revisions[rev] = down_rev

    if not revisions:
        return None

    # Head = revision that no other revision points to as down_revision
    all_down = set(revisions.values())
    heads = [r for r in revisions if r not in all_down]
    return heads[0] if heads else None


def _extract_var(content: str, var_name: str) -> str | None:
    """Extract a string variable assignment from migration file content."""
    import re

    pattern = rf'^{var_name}(?::\s*\w[^\n]*)?\s*=\s*["\']([^"\']+)["\']'
    match = re.search(pattern, content, re.MULTILINE)
    return match.group(1) if match else None


async def get_current_revision(db: AsyncSession) -> str | None:
    """Get the current applied migration revision from alembic_version table."""
    try:
        result = await db.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        row = result.first()
        return row[0] if row else None
    except Exception:
        logger.debug("alembic_version table not found or not readable")
        return None
