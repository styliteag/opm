"""NSE script CRUD service with Lua validation and distribution support."""

from __future__ import annotations

import hashlib
import logging
import subprocess
import tempfile
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_script import NseScript
from app.models.nse_template import ScanProfile
from app.schemas.nse import NseScriptCreate, NseScriptListItem, NseScriptUpdate

logger = logging.getLogger(__name__)

# Path to nmap's built-in NSE scripts
NSE_SCRIPTS_DIR = Path("/usr/share/nmap/scripts")


def _compute_hash(content: str) -> str:
    """Compute SHA-256 hex digest of script content."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


# ── Lua Validation ────────────────────────────────────────────────────────


def validate_lua_syntax(content: str) -> tuple[bool, str | None]:
    """Validate Lua syntax using luac -p (parse-only).

    Returns (is_valid, error_message).
    Falls back to allowing the script if luac is not available.
    """
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".lua", delete=True, encoding="utf-8"
        ) as tmp:
            tmp.write(content)
            tmp.flush()
            result = subprocess.run(
                ["luac", "-p", tmp.name],
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                return True, None
            error = result.stderr.strip()
            # Strip the temp file path from the error message
            if tmp.name in error:
                error = error.replace(tmp.name, "<script>")
            return False, error
    except FileNotFoundError:
        logger.warning("luac not found — skipping Lua syntax validation")
        return True, None
    except subprocess.TimeoutExpired:
        return False, "Lua syntax check timed out"


# ── CRUD ──────────────────────────────────────────────────────────────────


async def get_all_scripts(
    db: AsyncSession,
    search: str | None = None,
    type_filter: str | None = None,
) -> list[NseScriptListItem]:
    """Get all scripts: custom from DB merged with builtins from filesystem."""
    items: list[NseScriptListItem] = []

    # Custom scripts from DB
    stmt = select(NseScript).order_by(NseScript.name.asc())
    if type_filter == "custom":
        pass  # already filtered to DB
    elif type_filter == "builtin":
        stmt = stmt.where(False)  # skip DB for builtin-only filter
    result = await db.execute(stmt)
    custom_scripts = list(result.scalars().all())
    custom_names = set()

    for s in custom_scripts:
        if search and search.lower() not in s.name.lower():
            continue
        custom_names.add(s.name)
        items.append(
            NseScriptListItem(
                id=s.id,
                name=s.name,
                description=s.description,
                categories=s.categories if s.categories else [],
                severity=s.severity,
                type=s.type,
                cloned_from=s.cloned_from,
                author=s.author,
            )
        )

    # Builtin scripts from filesystem (unless filtering to custom only)
    if type_filter != "custom" and NSE_SCRIPTS_DIR.is_dir():
        for f in sorted(NSE_SCRIPTS_DIR.glob("*.nse")):
            name = f.stem
            if name in custom_names:
                continue
            if search and search.lower() not in name.lower():
                continue
            items.append(NseScriptListItem(name=name, type="builtin"))

    return items


async def get_script_by_name(db: AsyncSession, name: str) -> NseScript | None:
    """Get a custom script by name from the database."""
    clean = name.strip()
    if clean.endswith(".nse"):
        clean = clean[:-4]
    result = await db.execute(select(NseScript).where(NseScript.name == clean))
    return result.scalar_one_or_none()


async def create_script(db: AsyncSession, data: NseScriptCreate) -> NseScript:
    """Create a new custom NSE script.

    Validates Lua syntax before saving.
    Raises ValueError on validation failure or duplicate name.
    """
    # Check for duplicate
    existing = await get_script_by_name(db, data.name)
    if existing is not None:
        raise ValueError(f"A script named '{data.name}' already exists")

    # Validate Lua syntax
    valid, error = validate_lua_syntax(data.content)
    if not valid:
        raise ValueError(f"Lua syntax error: {error}")

    script = NseScript(
        name=data.name,
        description=data.description,
        content=data.content,
        content_hash=_compute_hash(data.content),
        categories=data.categories,
        severity=data.severity,
        type="custom",
        author=data.author,
    )
    db.add(script)
    return script


async def update_script(
    db: AsyncSession, script: NseScript, data: NseScriptUpdate
) -> NseScript:
    """Update a custom NSE script.

    Validates Lua syntax if content changed.
    Raises ValueError on validation failure.
    """
    if script.type != "custom":
        raise ValueError("Built-in scripts cannot be edited")

    if data.content is not None:
        valid, error = validate_lua_syntax(data.content)
        if not valid:
            raise ValueError(f"Lua syntax error: {error}")
        script.content = data.content
        script.content_hash = _compute_hash(data.content)

    if data.description is not None:
        script.description = data.description
    if data.categories is not None:
        script.categories = list(data.categories)
    if data.severity is not None:
        script.severity = data.severity

    return script


async def delete_script(db: AsyncSession, script: NseScript) -> int:
    """Delete a custom script and auto-remove from referencing profiles.

    Returns the number of profiles updated.
    """
    if script.type != "custom":
        raise ValueError("Built-in scripts cannot be deleted")

    # Auto-remove from profiles that reference this script
    profiles_updated = await _remove_script_from_profiles(db, script.name)

    await db.delete(script)
    return profiles_updated


async def _remove_script_from_profiles(db: AsyncSession, script_name: str) -> int:
    """Remove a script name from all ScanProfile.nse_scripts arrays."""
    result = await db.execute(select(ScanProfile))
    templates = list(result.scalars().all())

    updated_count = 0
    for template in templates:
        if template.nse_scripts and script_name in template.nse_scripts:
            template.nse_scripts = [
                s for s in template.nse_scripts if s != script_name
            ]
            updated_count += 1

    return updated_count


# ── Clone & Restore ───────────────────────────────────────────────────────


async def clone_builtin(db: AsyncSession, builtin_name: str) -> NseScript:
    """Clone a built-in nmap script into a custom editable copy.

    Raises ValueError if the builtin doesn't exist or custom name is taken.
    """
    clean = builtin_name.strip()
    if clean.endswith(".nse"):
        clean = clean[:-4]

    # Read original content from filesystem
    script_path = NSE_SCRIPTS_DIR / f"{clean}.nse"
    if not script_path.is_file():
        raise ValueError(f"Built-in script '{clean}' not found")

    content = script_path.read_text(encoding="utf-8", errors="replace")
    custom_name = f"custom_{clean}"

    # Check for duplicate
    existing = await get_script_by_name(db, custom_name)
    if existing is not None:
        raise ValueError(f"A custom clone '{custom_name}' already exists")

    script = NseScript(
        name=custom_name,
        description=f"Custom clone of {clean}",
        content=content,
        content_hash=_compute_hash(content),
        categories=[],
        severity=None,
        type="custom",
        cloned_from=clean,
        author="",
    )
    db.add(script)
    return script


async def restore_to_original(db: AsyncSession, script: NseScript) -> NseScript:
    """Restore a cloned script to the original built-in content.

    Raises ValueError if the script wasn't cloned or original is missing.
    """
    if not script.cloned_from:
        raise ValueError("Script was not cloned from a built-in — cannot restore")

    script_path = NSE_SCRIPTS_DIR / f"{script.cloned_from}.nse"
    if not script_path.is_file():
        raise ValueError(
            f"Original script '{script.cloned_from}' not found on filesystem"
        )

    content = script_path.read_text(encoding="utf-8", errors="replace")
    script.content = content
    script.content_hash = _compute_hash(content)
    return script


# ── Distribution ──────────────────────────────────────────────────────────


async def get_custom_script_hashes(
    db: AsyncSession, script_names: list[str]
) -> dict[str, str]:
    """Get content hashes for custom scripts in the given name list.

    Returns {name: content_hash} for names that exist in the nse_scripts table.
    """
    if not script_names:
        return {}

    custom_names = [n for n in script_names if n.startswith("custom_")]
    if not custom_names:
        return {}

    result = await db.execute(
        select(NseScript.name, NseScript.content_hash).where(
            NseScript.name.in_(custom_names)
        )
    )
    return {row.name: row.content_hash for row in result.all()}
