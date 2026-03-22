"""NSE repository management and git sync service.

Supports two repository formats:

1. **OPM format** — individual JSON template files (our own format):
   ```json
   {"name": "...", "scripts": ["vulners"], "severity": "high", "platform": "ssh"}
   ```

2. **Manifest format** — single manifest.json with script registry:
   ```json
   {"name": "nse-repo", "scripts": {"vulners.nse": {"name": "vulners", "path": "...", "protocol": "*"}}}
   ```
"""

from __future__ import annotations

import json
import logging
import subprocess
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_repository import NseRepository, NseRepositoryStatus
from app.models.nse_template import NseTemplate, NseTemplateSeverity, NseTemplateType
from app.schemas.nse import NseRepositoryCreate

logger = logging.getLogger(__name__)

# Valid severity values for template parsing
VALID_SEVERITIES = {"critical", "high", "medium", "info"}

# Local cache directory for cloned repos
REPO_CACHE_DIR = Path("/tmp/opm-nse-repos")

# Well-known high-severity NSE scripts for auto-classification
_CRITICAL_SCRIPTS = {
    "smb-vuln-ms17-010", "smb-vuln-ms08-067", "http-shellshock",
    "http-vuln-cve2017-5638", "ssl-heartbleed", "ftp-vsftpd-backdoor",
    "http-sql-injection", "ssh-brute", "smb-vuln-cve-2017-7494",
}
_HIGH_SCRIPTS = {
    "vulners", "ssl-poodle", "ssl-enum-ciphers", "smb-enum-shares",
    "ftp-anon", "http-stored-xss", "http-dombased-xss", "dns-zone-transfer",
    "smb-vuln-regsvc-dos", "http-vuln-cve2014-3704",
}
_PROTOCOL_TO_PLATFORM: dict[str, str] = {
    "ssh": "ssh", "http": "http", "https": "http", "ssl": "ssl",
    "smb": "smb", "ftp": "ftp", "dns": "dns", "smtp": "smtp",
    "snmp": "snmp", "mysql": "mysql", "postgres": "postgres",
    "rdp": "rdp", "vnc": "vnc", "telnet": "telnet",
}


async def get_all_repositories(db: AsyncSession) -> list[NseRepository]:
    """Get all NSE repositories."""
    stmt = select(NseRepository).order_by(NseRepository.priority.asc(), NseRepository.name.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_repository_by_id(db: AsyncSession, repo_id: int) -> NseRepository | None:
    """Get a repository by ID."""
    result = await db.execute(select(NseRepository).where(NseRepository.id == repo_id))
    return result.scalar_one_or_none()


async def create_repository(db: AsyncSession, data: NseRepositoryCreate) -> NseRepository:
    """Create a new NSE template repository."""
    repo = NseRepository(
        name=data.name,
        url=data.url,
        branch=data.branch,
        priority=data.priority,
    )
    db.add(repo)
    return repo


async def delete_repository(db: AsyncSession, repo: NseRepository) -> None:
    """Delete a repository and all its templates (cascade)."""
    await db.delete(repo)


async def sync_repository(db: AsyncSession, repo: NseRepository) -> NseRepository:
    """Sync templates from a git repository.

    Clones/pulls the repo and parses template JSON files.
    """
    repo.status = NseRepositoryStatus.SYNCING
    repo.sync_error = None
    await db.flush()

    try:
        templates = _clone_and_parse(repo.url, repo.branch, repo.id)
        await _upsert_templates(db, repo, templates)

        repo.status = NseRepositoryStatus.SYNCED
        repo.template_count = len(templates)
        repo.last_synced_at = datetime.now(timezone.utc)
        repo.sync_error = None
    except Exception as exc:
        logger.exception("Failed to sync repository %s", repo.name)
        repo.status = NseRepositoryStatus.ERROR
        repo.sync_error = str(exc)[:500]

    return repo


def _clone_and_parse(
    url: str, branch: str, repo_id: int
) -> list[dict]:
    """Clone a git repo and parse templates.

    Auto-detects repo format:
    - NSE manifest format: manifest.json with scripts dict
    - OPM format: individual JSON template files

    Returns list of normalized template dicts.
    """
    repo_dir = _clone_or_pull(url, branch, repo_id)

    # Check for NSE manifest format first
    manifest_path = repo_dir / "manifest.json"
    if manifest_path.exists():
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
            if _is_nse_manifest(manifest):
                logger.info("Detected NSE manifest format with %d scripts",
                            len(manifest.get("scripts", {})))
                return _parse_nse_manifest(manifest)
        except (json.JSONDecodeError, UnicodeDecodeError):
            pass

    # Fall back to OPM format: individual JSON template files
    return _parse_opm_templates(repo_dir)


def _clone_or_pull(url: str, branch: str, repo_id: int) -> Path:
    """Clone or update a git repository. Returns the repo directory."""
    REPO_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    repo_dir = REPO_CACHE_DIR / f"repo_{repo_id}"

    if repo_dir.exists():
        subprocess.run(
            ["git", "fetch", "origin", branch],
            cwd=repo_dir,
            capture_output=True,
            timeout=60,
            check=True,
        )
        subprocess.run(
            ["git", "reset", "--hard", f"origin/{branch}"],
            cwd=repo_dir,
            capture_output=True,
            timeout=30,
            check=True,
        )
    else:
        subprocess.run(
            ["git", "clone", "--branch", branch, "--depth", "1", url, str(repo_dir)],
            capture_output=True,
            timeout=120,
            check=True,
        )

    return repo_dir


# ── NSE manifest format ───────────────────────────────────────────────────


def _is_nse_manifest(data: dict) -> bool:
    """Check if data matches the NSE manifest.json format.

    Expected shape: {"name": "...", "scripts": {"name.nse": {"name": ..., "path": ..., "protocol": ...}}}
    """
    if not isinstance(data, dict):
        return False
    scripts = data.get("scripts")
    if not isinstance(scripts, dict) or len(scripts) == 0:
        return False
    # Check first entry looks like a manifest script entry
    first = next(iter(scripts.values()))
    return isinstance(first, dict) and "name" in first and "path" in first


def _parse_nse_manifest(manifest: dict) -> list[dict]:
    """Convert NSE manifest.json entries into OPM template dicts.

    Each script becomes one template.
    """
    templates: list[dict] = []
    scripts = manifest.get("scripts", {})

    for key, entry in scripts.items():
        if not isinstance(entry, dict):
            continue

        script_name = entry.get("name", "")
        if not script_name:
            continue

        protocol = entry.get("protocol", "*")
        platform = _manifest_protocol_to_platform(script_name, protocol)
        severity = _infer_script_severity(script_name)
        description = _generate_script_description(script_name, protocol)

        templates.append({
            "name": _humanize_script_name(script_name),
            "description": description,
            "scripts": [script_name],
            "severity": severity,
            "platform": platform,
            "_repo_key": key,
        })

    return templates


def _manifest_protocol_to_platform(script_name: str, protocol: str) -> str:
    """Map manifest protocol field and script name prefix to a platform."""
    if protocol != "*" and protocol in _PROTOCOL_TO_PLATFORM:
        return _PROTOCOL_TO_PLATFORM[protocol]

    # Infer from script name prefix (e.g. "ssh-auth-methods" → "ssh")
    prefix = script_name.split("-")[0] if "-" in script_name else ""
    if prefix in _PROTOCOL_TO_PLATFORM:
        return _PROTOCOL_TO_PLATFORM[prefix]

    # Check for common prefixes that map to platforms
    if script_name.startswith("ssl-") or script_name.startswith("tls-"):
        return "ssl"

    return "any"


def _infer_script_severity(script_name: str) -> str:
    """Infer severity from well-known script names."""
    if script_name in _CRITICAL_SCRIPTS:
        return "critical"
    if script_name in _HIGH_SCRIPTS:
        return "high"
    if "vuln" in script_name or "brute" in script_name or "backdoor" in script_name:
        return "high"
    if "enum" in script_name or "info" in script_name or "discovery" in script_name:
        return "info"
    return "medium"


def _humanize_script_name(script_name: str) -> str:
    """Convert script-name to Human Readable Name."""
    # Replace hyphens with spaces and title-case
    name = script_name.replace("-", " ").replace("_", " ")
    # Preserve known acronyms
    acronyms = {"smb", "ssh", "http", "ftp", "dns", "ssl", "tls", "snmp",
                "rdp", "vnc", "afp", "ajp", "amqp", "cve", "xss", "rce",
                "nfs", "ldap", "imap", "pop3", "ntp", "dhcp", "tftp"}
    words = name.split()
    result = []
    for w in words:
        if w.lower() in acronyms:
            result.append(w.upper())
        else:
            result.append(w.capitalize())
    return " ".join(result)


def _generate_script_description(script_name: str, protocol: str) -> str:
    """Generate a basic description for a manifest script."""
    human_name = _humanize_script_name(script_name)
    proto_str = f" ({protocol})" if protocol != "*" else ""
    return f"NSE script: {human_name}{proto_str}"


# ── OPM format (individual JSON templates) ────────────────────────────────


def _parse_opm_templates(repo_dir: Path) -> list[dict]:
    """Parse OPM-format individual JSON template files."""
    templates: list[dict] = []
    for json_file in sorted(repo_dir.rglob("*.json")):
        if any(part.startswith(".") for part in json_file.relative_to(repo_dir).parts):
            continue
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
            if _is_valid_opm_template(data):
                data["_repo_key"] = str(json_file.relative_to(repo_dir))
                templates.append(data)
        except (json.JSONDecodeError, UnicodeDecodeError):
            logger.debug("Skipping non-JSON file: %s", json_file)
    return templates


def _is_valid_opm_template(data: dict) -> bool:
    """Check if a parsed JSON dict looks like an OPM NSE template."""
    return (
        isinstance(data, dict)
        and "name" in data
        and "scripts" in data
        and isinstance(data["scripts"], list)
        and len(data["scripts"]) > 0
    )


async def _upsert_templates(
    db: AsyncSession, repo: NseRepository, parsed_templates: list[dict]
) -> None:
    """Upsert templates from parsed repo data."""
    # Get existing templates for this repo
    existing_result = await db.execute(
        select(NseTemplate).where(NseTemplate.repository_id == repo.id)
    )
    existing_by_key: dict[str, NseTemplate] = {
        t.repository_key: t
        for t in existing_result.scalars().all()
        if t.repository_key
    }

    seen_keys: set[str] = set()

    for tpl_data in parsed_templates:
        repo_key = tpl_data.get("_repo_key", "")
        seen_keys.add(repo_key)

        severity_str = tpl_data.get("severity", "medium").lower()
        if severity_str not in VALID_SEVERITIES:
            severity_str = "medium"

        if repo_key in existing_by_key:
            # Update existing template
            existing = existing_by_key[repo_key]
            existing.name = tpl_data["name"]
            existing.description = tpl_data.get("description", "")
            existing.nse_scripts = tpl_data["scripts"]
            existing.severity = NseTemplateSeverity(severity_str)
            existing.platform = tpl_data.get("platform", "any")
            existing.script_args = tpl_data.get("script_args")
        else:
            # Create new template
            new_template = NseTemplate(
                name=tpl_data["name"],
                description=tpl_data.get("description", ""),
                nse_scripts=tpl_data["scripts"],
                severity=NseTemplateSeverity(severity_str),
                platform=tpl_data.get("platform", "any"),
                type=NseTemplateType.REPOSITORY,
                script_args=tpl_data.get("script_args"),
                repository_id=repo.id,
                repository_key=repo_key,
            )
            db.add(new_template)

    # Remove templates that no longer exist in repo
    for key, existing_tpl in existing_by_key.items():
        if key not in seen_keys:
            await db.delete(existing_tpl)
