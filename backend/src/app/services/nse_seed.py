"""Seed built-in scan profiles on startup.

These profiles define multi-phase scan pipelines using nmap's built-in
NSE scripts. The scanner just calls `nmap --script <name>` and nmap
finds the script locally.
"""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import ScanProfile, ScanProfileSeverity, ScanProfileType
from app.services.nse_all_scripts import ALL_NSE_SCRIPTS

logger = logging.getLogger(__name__)


def _default_phases(
    scripts: list[str],
    script_args: dict[str, str] | None = None,
    port_range: str | None = None,
    port_scan_tool: str = "nmap",
) -> list[dict[str, Any]]:
    """Build a standard 3-phase configuration."""
    return [
        {
            "name": "host_discovery",
            "enabled": True,
            "tool": "nmap",
            "config": {"aggressive": False, "max_retries": 2},
        },
        {
            "name": "port_scan",
            "enabled": True,
            "tool": port_scan_tool,
            "config": {
                "port_range": port_range,
                "exclude_ports": None,
                "aggressive": False,
                "max_retries": 3,
            },
        },
        {
            "name": "vulnerability",
            "enabled": True,
            "tool": "nmap_nse",
            "config": {
                "scripts": scripts,
                "script_args": script_args or {},
                "aggressive": False,
                "parallel": True,
                "max_retries": 3,
            },
        },
    ]


# Built-in profiles — ship with the product, read-only
BUILTIN_PROFILES: list[dict[str, Any]] = [
    # -- Scan Profiles (tiered bundles) --
    {
        "name": "Quick Scan",
        "description": (
            "Fast scan with essential vulnerability detection. "
            "Best for rapid assessment and initial reconnaissance."
        ),
        "phases": _default_phases(
            ["vulners", "banner", "http-title", "ssl-cert", "ftp-anon", "smb-protocols"],
            port_range="1-10000",
            port_scan_tool="masscan",
        ),
        "category": "scan_profiles",
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "High Risk Scan",
        "description": (
            "Focused scan with critical vulnerability detection scripts. "
            "Targets high-impact vulnerabilities and common attack vectors."
        ),
        "phases": _default_phases(
            [
                "banner", "ssl-ccs-injection", "ssl-cert", "ssl-heartbleed",
                "ssl-poodle", "vulners", "ftp-anon",
                "http-auth", "http-enum", "http-shellshock", "http-title",
                "http-vuln-cve2012-1823", "http-vuln-cve2014-3704",
                "http-vuln-cve2015-1635", "http-vuln-cve2017-5638",
                "http-vuln-cve2017-5689",
                "smb-enum-shares", "smb-os-discovery", "smb-protocols",
                "smb-security-mode", "smb-vuln-ms08-067", "smb-vuln-ms17-010",
                "ssh-auth-methods",
            ],
            port_range="1-10000",
        ),
        "category": "scan_profiles",
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "All Scripts Scan",
        "description": (
            "Comprehensive scan using all available scripts. "
            "This is the most thorough but slowest scan option."
        ),
        "phases": _default_phases(ALL_NSE_SCRIPTS),
        "category": "scan_profiles",
        "platform": "any",
        "priority": 0,
    },
    # -- SMB --
    {
        "name": "EternalBlue SMB (MS17-010)",
        "description": (
            "Detects Microsoft SMB servers vulnerable to MS17-010 "
            "(EternalBlue), a critical RCE used by WannaCry."
        ),
        "severity": "critical",
        "phases": _default_phases(["smb-vuln-ms17-010"], port_range="445"),
        "category": "smb",
        "platform": "smb",
        "priority": 1,
    },
    {
        "name": "Conficker SMB (MS08-067)",
        "description": (
            "Detects Microsoft SMB servers vulnerable to MS08-067 "
            "(Conficker), a critical RCE in the Server service."
        ),
        "severity": "critical",
        "phases": _default_phases(["smb-vuln-ms08-067"], port_range="445"),
        "category": "smb",
        "platform": "smb",
        "priority": 1,
    },
    {
        "name": "SMB Share Enumeration",
        "description": "Enumerates SMB shares and checks for anonymous access.",
        "severity": "high",
        "phases": _default_phases(
            ["smb-enum-shares", "smb-enum-users"], port_range="445",
        ),
        "category": "smb",
        "platform": "smb",
        "priority": 2,
    },
    {
        "name": "SMB OS Discovery",
        "description": (
            "Discovers OS, computer name, domain, and workgroup "
            "over SMB for asset inventory."
        ),
        "severity": "info",
        "phases": _default_phases(["smb-os-discovery"], port_range="445"),
        "category": "smb",
        "platform": "smb",
        "priority": 5,
    },
    # -- Web --
    {
        "name": "Shellshock (CVE-2014-6271)",
        "description": (
            "Detects web servers vulnerable to Shellshock, a critical "
            "Bash RCE exploitable via CGI scripts."
        ),
        "severity": "critical",
        "phases": _default_phases(["http-shellshock"], port_range="80,443,8080,8443"),
        "category": "web",
        "platform": "http",
        "priority": 1,
    },
    {
        "name": "Apache Struts RCE (CVE-2017-5638)",
        "description": (
            "Detects Apache Struts servers vulnerable to CVE-2017-5638, "
            "a critical RCE in the Jakarta Multipart parser."
        ),
        "severity": "critical",
        "phases": _default_phases(
            ["http-vuln-cve2017-5638"], port_range="80,443,8080,8443",
        ),
        "category": "web",
        "platform": "http",
        "priority": 1,
    },
    {
        "name": "HTTP SQL Injection",
        "description": (
            "Crawls a web application and tests parameters "
            "for SQL injection vulnerabilities."
        ),
        "severity": "critical",
        "phases": _default_phases(
            ["http-sql-injection"], port_range="80,443,8080,8443",
        ),
        "category": "web",
        "platform": "http",
        "priority": 2,
    },
    {
        "name": "HTTP XSS Detection",
        "description": (
            "Tests for reflected and DOM-based cross-site "
            "scripting vulnerabilities."
        ),
        "severity": "high",
        "phases": _default_phases(
            ["http-stored-xss", "http-dombased-xss", "http-phpself-xss"],
            port_range="80,443,8080,8443",
        ),
        "category": "web",
        "platform": "http",
        "priority": 2,
    },
    {
        "name": "HTTP Enumeration",
        "description": (
            "Enumerates common web directories, admin panels, "
            "backup files, and exposed configuration."
        ),
        "severity": "medium",
        "phases": _default_phases(["http-enum"], port_range="80,443,8080,8443"),
        "category": "web",
        "platform": "http",
        "priority": 3,
    },
    {
        "name": "HTTP Security Headers",
        "description": (
            "Checks for missing HTTP security headers: CSP, "
            "X-Frame-Options, HSTS, X-Content-Type-Options."
        ),
        "severity": "medium",
        "phases": _default_phases(
            ["http-security-headers", "http-headers"],
            port_range="80,443,8080,8443",
        ),
        "category": "web",
        "platform": "http",
        "priority": 3,
    },
    # -- SSL/TLS --
    {
        "name": "Heartbleed (CVE-2014-0160)",
        "description": (
            "Detects OpenSSL servers vulnerable to Heartbleed, "
            "which allows reading memory contents including private keys."
        ),
        "severity": "critical",
        "phases": _default_phases(["ssl-heartbleed"], port_range="443,8443"),
        "category": "ssl",
        "platform": "ssl",
        "priority": 1,
    },
    # -- Credentials --
    {
        "name": "Default Credentials Check",
        "description": (
            "Tests common services for default or factory credentials "
            "including FTP anonymous access and SNMP community strings."
        ),
        "severity": "critical",
        "phases": _default_phases(
            ["ftp-anon", "http-default-accounts", "snmp-brute"],
        ),
        "category": "credentials",
        "platform": "any",
        "priority": 2,
    },
    {
        "name": "FTP Anonymous Login",
        "description": "Detects FTP servers allowing anonymous login.",
        "severity": "high",
        "phases": _default_phases(["ftp-anon"], port_range="21"),
        "category": "credentials",
        "platform": "ftp",
        "priority": 2,
    },
    # -- Network --
    {
        "name": "DNS Zone Transfer",
        "description": (
            "Attempts DNS zone transfer (AXFR) to reveal "
            "all DNS records for a domain."
        ),
        "severity": "high",
        "phases": _default_phases(["dns-zone-transfer"], port_range="53"),
        "category": "network",
        "platform": "dns",
        "priority": 2,
    },
    {
        "name": "SSH Algorithms Audit",
        "description": (
            "Enumerates SSH ciphers, KEX, MACs, and host key types "
            "for identifying weak cryptographic configurations."
        ),
        "severity": "medium",
        "phases": _default_phases(
            ["ssh2-enum-algos", "ssh-hostkey", "ssh-auth-methods"],
            port_range="22",
        ),
        "category": "network",
        "platform": "ssh",
        "priority": 3,
    },
    # -- Reconnaissance --
    {
        "name": "Vulners CVE Lookup",
        "description": (
            "Queries the Vulners CVE database to find known "
            "vulnerabilities for detected service versions."
        ),
        "severity": "high",
        "phases": _default_phases(
            ["vulners"], script_args={"vulners.showall": "true"},
        ),
        "category": "reconnaissance",
        "platform": "any",
        "priority": 2,
    },
    {
        "name": "Service Banner Grabbing",
        "description": (
            "Captures service banners from open ports "
            "to identify software versions."
        ),
        "severity": "info",
        "phases": _default_phases(["banner"]),
        "category": "reconnaissance",
        "platform": "any",
        "priority": 5,
    },
]


def _extract_scripts_from_phases(
    phases: list[dict[str, Any]],
) -> tuple[list[str], dict[str, str] | None]:
    """Extract nse_scripts and script_args from phases for legacy compat."""
    for phase in phases:
        if phase.get("name") == "vulnerability":
            config = phase.get("config", {})
            scripts = config.get("scripts", [])
            args = config.get("script_args") or None
            return scripts, args
    return [], None


async def _deduplicate_builtin_profiles(db: AsyncSession) -> int:
    """Convert duplicate builtin profiles to custom, keeping lowest-id."""
    result = await db.execute(
        select(ScanProfile).where(ScanProfile.type == ScanProfileType.BUILTIN)
    )
    all_builtins = result.scalars().all()

    seen: dict[str, int] = {}
    duplicates: list[ScanProfile] = []
    for t in all_builtins:
        if t.name in seen:
            duplicates.append(t)
        else:
            seen[t.name] = t.id

    for dup in duplicates:
        dup.type = ScanProfileType.CUSTOM
        dup.name = f"{dup.name} (copy)"

    if duplicates:
        logger.info(
            "Converted %d duplicate builtin profiles to custom",
            len(duplicates),
        )
    return len(duplicates)


async def _sync_builtin_profiles(db: AsyncSession) -> int:
    """Update existing builtin profiles to match current seed data."""
    result = await db.execute(
        select(ScanProfile).where(ScanProfile.type == ScanProfileType.BUILTIN)
    )
    existing = {t.name: t for t in result.scalars().all()}

    seed_by_name = {p["name"]: p for p in BUILTIN_PROFILES}
    updated = 0

    for name, template in existing.items():
        seed = seed_by_name.get(name)
        if seed is None:
            continue

        changed = False
        # Sync category
        new_category = seed.get("category")
        if template.category != new_category:
            template.category = new_category
            changed = True
        # Sync description
        if template.description != seed["description"]:
            template.description = seed["description"]
            changed = True
        # Sync phases
        new_phases = seed.get("phases")
        if template.phases != new_phases:
            template.phases = new_phases
            changed = True
        # Sync legacy nse_scripts from phases
        if new_phases:
            scripts, args = _extract_scripts_from_phases(new_phases)
            if template.nse_scripts != scripts:
                template.nse_scripts = scripts
                changed = True
            if template.script_args != args:
                template.script_args = args
                changed = True
        # Sync priority
        new_priority = seed.get("priority", 10)
        if template.priority != new_priority:
            template.priority = new_priority
            changed = True

        if changed:
            updated += 1

    if updated:
        logger.info("Updated %d existing builtin profiles", updated)
    return updated


async def seed_builtin_profiles(db: AsyncSession) -> int:
    """Seed and sync built-in scan profiles.

    1. Removes duplicates from prior race conditions.
    2. Syncs existing builtins with current seed data.
    3. Inserts any new profiles not yet in the database.

    Returns the number of profiles inserted.
    """
    await _deduplicate_builtin_profiles(db)
    await _sync_builtin_profiles(db)

    # Fetch existing builtin profile names
    result = await db.execute(
        select(ScanProfile.name).where(
            ScanProfile.type == ScanProfileType.BUILTIN
        )
    )
    existing_names = {row[0] for row in result.all()}

    count = 0
    for p in BUILTIN_PROFILES:
        if p["name"] in existing_names:
            continue

        phases = p.get("phases", [])
        scripts, script_args = _extract_scripts_from_phases(phases)

        profile = ScanProfile(
            name=p["name"],
            description=p["description"],
            phases=phases,
            nse_scripts=scripts,
            script_args=script_args,
            severity=(
                ScanProfileSeverity(p["severity"]) if p.get("severity") else None
            ),
            platform=p.get("platform", "any"),
            type=ScanProfileType.BUILTIN,
            enabled=True,
            category=p.get("category"),
            priority=p.get("priority", 10),
        )
        db.add(profile)
        existing_names.add(p["name"])
        count += 1

    if count:
        logger.info("Seeded %d built-in scan profiles", count)
    return count
