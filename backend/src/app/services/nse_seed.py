"""Seed built-in NSE profiles on startup.

These profiles work out of the box because nmap ships with all NSE scripts.
The scanner just calls `nmap --script <name>` and nmap finds the script locally.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import ScanProfile, ScanProfileSeverity, ScanProfileType
from app.services.nse_all_scripts import ALL_NSE_SCRIPTS

logger = logging.getLogger(__name__)

# Built-in profiles — ship with the product, read-only
BUILTIN_PROFILES: list[dict] = [
    # ── Scan Profiles (tiered bundles) ──────────────────────────────────
    {
        "name": "Quick Scan",
        "description": "Fast scan with essential vulnerability detection. Best for rapid assessment and initial reconnaissance.",
        "nse_scripts": [
            "vulners",
            "banner",
            "http-title",
            "ssl-cert",
            "ftp-anon",
            "smb-protocols",
        ],
        "category": "scan_profiles",
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "High Risk Scan",
        "description": "Focused scan with critical vulnerability detection scripts. Targets high-impact vulnerabilities and common attack vectors.",
        "nse_scripts": [
            # * (any protocol) — 6
            "banner",
            "ssl-ccs-injection",
            "ssl-cert",
            "ssl-heartbleed",
            "ssl-poodle",
            "vulners",
            # ftp — 1
            "ftp-anon",
            # http — 9
            "http-auth",
            "http-enum",
            "http-shellshock",
            "http-title",
            "http-vuln-cve2012-1823",
            "http-vuln-cve2014-3704",
            "http-vuln-cve2015-1635",
            "http-vuln-cve2017-5638",
            "http-vuln-cve2017-5689",
            # smb — 6
            "smb-enum-shares",
            "smb-os-discovery",
            "smb-protocols",
            "smb-security-mode",
            "smb-vuln-ms08-067",
            "smb-vuln-ms17-010",
            # ssh — 1
            "ssh-auth-methods",
        ],
        "category": "scan_profiles",
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "All Scripts Scan",
        "description": "Comprehensive scan using all available scripts. This is the most thorough but slowest scan option.",
        "nse_scripts": ALL_NSE_SCRIPTS,
        "category": "scan_profiles",
        "platform": "any",
        "priority": 0,
    },
    # ── SMB ─────────────────────────────────────────────────────────────
    {
        "name": "EternalBlue SMB (MS17-010)",
        "description": "Detects Microsoft SMB servers vulnerable to MS17-010 (EternalBlue), a critical RCE used by WannaCry ransomware.",
        "nse_scripts": ["smb-vuln-ms17-010"],
        "severity": "critical",
        "category": "smb",
        "platform": "smb",
        "priority": 1,
    },
    {
        "name": "Conficker SMB (MS08-067)",
        "description": "Detects Microsoft SMB servers vulnerable to MS08-067 (Conficker), a critical RCE in the Server service.",
        "nse_scripts": ["smb-vuln-ms08-067"],
        "severity": "critical",
        "category": "smb",
        "platform": "smb",
        "priority": 1,
    },
    {
        "name": "SMB Share Enumeration",
        "description": "Enumerates SMB shares and checks for anonymous access.",
        "nse_scripts": ["smb-enum-shares", "smb-enum-users"],
        "severity": "high",
        "category": "smb",
        "platform": "smb",
        "priority": 2,
    },
    {
        "name": "SMB OS Discovery",
        "description": "Discovers OS, computer name, domain, and workgroup over SMB for asset inventory.",
        "nse_scripts": ["smb-os-discovery"],
        "severity": "info",
        "category": "smb",
        "platform": "smb",
        "priority": 5,
    },
    # ── Web ─────────────────────────────────────────────────────────────
    {
        "name": "Shellshock (CVE-2014-6271)",
        "description": "Detects web servers vulnerable to Shellshock, a critical Bash RCE exploitable via CGI scripts.",
        "nse_scripts": ["http-shellshock"],
        "severity": "critical",
        "category": "web",
        "platform": "http",
        "priority": 1,
    },
    {
        "name": "Apache Struts RCE (CVE-2017-5638)",
        "description": "Detects Apache Struts servers vulnerable to CVE-2017-5638, a critical RCE in the Jakarta Multipart parser.",
        "nse_scripts": ["http-vuln-cve2017-5638"],
        "severity": "critical",
        "category": "web",
        "platform": "http",
        "priority": 1,
    },
    {
        "name": "HTTP SQL Injection",
        "description": "Crawls a web application and tests parameters for SQL injection vulnerabilities.",
        "nse_scripts": ["http-sql-injection"],
        "severity": "critical",
        "category": "web",
        "platform": "http",
        "priority": 2,
    },
    {
        "name": "HTTP XSS Detection",
        "description": "Tests for reflected and DOM-based cross-site scripting vulnerabilities.",
        "nse_scripts": ["http-stored-xss", "http-dombased-xss", "http-phpself-xss"],
        "severity": "high",
        "category": "web",
        "platform": "http",
        "priority": 2,
    },
    {
        "name": "HTTP Enumeration",
        "description": "Enumerates common web directories, admin panels, backup files, and exposed configuration.",
        "nse_scripts": ["http-enum"],
        "severity": "medium",
        "category": "web",
        "platform": "http",
        "priority": 3,
    },
    {
        "name": "HTTP Security Headers",
        "description": "Checks for missing HTTP security headers: CSP, X-Frame-Options, HSTS, X-Content-Type-Options.",
        "nse_scripts": ["http-security-headers", "http-headers"],
        "severity": "medium",
        "category": "web",
        "platform": "http",
        "priority": 3,
    },
    # ── SSL/TLS ─────────────────────────────────────────────────────────
    {
        "name": "Heartbleed (CVE-2014-0160)",
        "description": "Detects OpenSSL servers vulnerable to Heartbleed, which allows reading memory contents including private keys.",
        "nse_scripts": ["ssl-heartbleed"],
        "severity": "critical",
        "category": "ssl",
        "platform": "ssl",
        "priority": 1,
    },
    # ── Credentials ─────────────────────────────────────────────────────
    {
        "name": "Default Credentials Check",
        "description": "Tests common services for default or factory credentials including FTP anonymous access and SNMP community strings.",
        "nse_scripts": ["ftp-anon", "http-default-accounts", "snmp-brute"],
        "severity": "critical",
        "category": "credentials",
        "platform": "any",
        "priority": 2,
    },
    {
        "name": "FTP Anonymous Login",
        "description": "Detects FTP servers allowing anonymous login.",
        "nse_scripts": ["ftp-anon"],
        "severity": "high",
        "category": "credentials",
        "platform": "ftp",
        "priority": 2,
    },
    # ── Network ─────────────────────────────────────────────────────────
    {
        "name": "DNS Zone Transfer",
        "description": "Attempts DNS zone transfer (AXFR) to reveal all DNS records for a domain.",
        "nse_scripts": ["dns-zone-transfer"],
        "severity": "high",
        "category": "network",
        "platform": "dns",
        "priority": 2,
    },
    {
        "name": "SSH Algorithms Audit",
        "description": "Enumerates SSH ciphers, KEX, MACs, and host key types for identifying weak cryptographic configurations.",
        "nse_scripts": ["ssh2-enum-algos", "ssh-hostkey", "ssh-auth-methods"],
        "severity": "medium",
        "category": "network",
        "platform": "ssh",
        "priority": 3,
    },
    # ── Reconnaissance ──────────────────────────────────────────────────
    {
        "name": "Vulners CVE Lookup",
        "description": "Queries the Vulners CVE database to find known vulnerabilities for detected service versions.",
        "nse_scripts": ["vulners"],
        "severity": "high",
        "category": "reconnaissance",
        "script_args": {"vulners.showall": "true"},
        "platform": "any",
        "priority": 2,
    },
    {
        "name": "Service Banner Grabbing",
        "description": "Captures service banners from open ports to identify software versions.",
        "nse_scripts": ["banner"],
        "severity": "info",
        "category": "reconnaissance",
        "platform": "any",
        "priority": 5,
    },
]


async def _deduplicate_builtin_profiles(db: AsyncSession) -> int:
    """Convert duplicate builtin profiles to custom, keeping the lowest-id copy as builtin.

    Returns the number of duplicates converted.
    """
    result = await db.execute(
        select(ScanProfile).where(ScanProfile.type == ScanProfileType.BUILTIN)
    )
    all_builtins = result.scalars().all()

    # Group by name, keep lowest id as builtin
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
        logger.info("Converted %d duplicate builtin profiles to custom", len(duplicates))
    return len(duplicates)


async def _sync_builtin_profiles(db: AsyncSession) -> int:
    """Update existing builtin profiles to match current seed data.

    Syncs fields that may have been added or changed (e.g. category).
    Returns the number of profiles updated.
    """
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
        # Sync nse_scripts
        if template.nse_scripts != seed["nse_scripts"]:
            template.nse_scripts = seed["nse_scripts"]
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
    """Seed and sync built-in NSE profiles.

    1. Removes duplicates from prior race conditions.
    2. Syncs existing builtins with current seed data.
    3. Inserts any new profiles not yet in the database.

    Returns the number of profiles inserted.
    """
    await _deduplicate_builtin_profiles(db)
    await _sync_builtin_profiles(db)

    # Fetch existing builtin profile names
    result = await db.execute(
        select(ScanProfile.name).where(ScanProfile.type == ScanProfileType.BUILTIN)
    )
    existing_names = {row[0] for row in result.all()}

    count = 0
    for p in BUILTIN_PROFILES:
        if p["name"] in existing_names:
            continue

        profile = ScanProfile(
            name=p["name"],
            description=p["description"],
            nse_scripts=p["nse_scripts"],
            severity=ScanProfileSeverity(p["severity"]) if p.get("severity") else None,
            platform=p["platform"],
            type=ScanProfileType.BUILTIN,
            enabled=True,
            script_args=p.get("script_args"),
            category=p.get("category"),
            priority=p.get("priority", 10),
        )
        db.add(profile)
        existing_names.add(p["name"])
        count += 1

    if count:
        logger.info("Seeded %d built-in NSE profiles", count)
    return count
