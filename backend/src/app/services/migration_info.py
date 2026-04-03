"""Service for querying database migration state."""

import logging
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent.parent / "migrations" / "versions"


def get_head_revision() -> str | None:
    """Get the latest available migration revision by scanning version files."""
    if not MIGRATIONS_DIR.exists():
        return None

    revisions: list[str] = []
    for f in MIGRATIONS_DIR.glob("*.py"):
        if f.name.startswith("__"):
            continue
        # Files are named like 001_initial_schema.py, 002_add_alert_events.py
        prefix = f.stem.split("_")[0]
        if prefix.isdigit():
            revisions.append(prefix.lstrip("0") or "0")

    if not revisions:
        return None

    # Return the highest numbered revision (zero-padded to 3 digits for consistency)
    latest = max(revisions, key=int)
    return latest.zfill(3)


async def get_current_revision(db: AsyncSession) -> str | None:
    """Get the current applied migration revision from alembic_version table."""
    try:
        result = await db.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
        row = result.first()
        return row[0] if row else None
    except Exception:
        logger.debug("alembic_version table not found or not readable")
        return None
