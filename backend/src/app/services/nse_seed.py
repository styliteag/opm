"""Seed built-in NSE profiles on startup.

These profiles work out of the box because nmap ships with all NSE scripts.
The scanner just calls `nmap --script <name>` and nmap finds the script locally.
"""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import NseTemplate, NseTemplateSeverity, NseTemplateType

logger = logging.getLogger(__name__)

# Built-in profiles — ship with the product, read-only
BUILTIN_PROFILES: list[dict] = [
    # ── Scan Groups (multi-script profiles) ────────────────────────────
    {
        "name": "Quick Scan",
        "description": "Fast vulnerability check using the most impactful scripts. Good for routine scanning with minimal overhead.",
        "nse_scripts": ["vulners", "banner", "ssl-cert", "http-title"],
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "Full Vulnerability Scan",
        "description": "Comprehensive vulnerability assessment covering all major attack vectors: SMB, SSL, HTTP, FTP, SSH. Slower but thorough.",
        "nse_scripts": [
            "vulners", "smb-vuln-ms17-010", "smb-vuln-ms08-067",
            "ssl-heartbleed", "ssl-poodle", "ssl-enum-ciphers", "ssl-cert",
            "http-shellshock", "http-vuln-cve2017-5638", "http-sql-injection",
            "http-enum", "http-methods", "http-security-headers",
            "ftp-anon", "ftp-vsftpd-backdoor",
            "ssh2-enum-algos", "ssh-hostkey", "ssh-auth-methods",
            "dns-zone-transfer",
            "banner",
        ],
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "Web Application Scan",
        "description": "Focused on web application vulnerabilities: SQL injection, XSS, Shellshock, Struts RCE, directory enumeration, security headers.",
        "nse_scripts": [
            "http-shellshock", "http-vuln-cve2017-5638",
            "http-sql-injection", "http-stored-xss", "http-dombased-xss", "http-phpself-xss",
            "http-enum", "http-methods", "http-security-headers", "http-headers",
            "http-default-accounts", "http-title",
            "ssl-cert", "ssl-enum-ciphers",
        ],
        "platform": "http",
        "priority": 0,
    },
    {
        "name": "Infrastructure Scan",
        "description": "Targets network infrastructure: SMB, FTP, DNS, SSH, SNMP. Detects misconfigurations and known exploits on core services.",
        "nse_scripts": [
            "smb-vuln-ms17-010", "smb-vuln-ms08-067", "smb-os-discovery",
            "smb-enum-shares", "smb-enum-users",
            "ftp-anon", "ftp-vsftpd-backdoor",
            "dns-zone-transfer",
            "ssh2-enum-algos", "ssh-hostkey", "ssh-auth-methods",
            "snmp-brute", "snmp-info",
            "banner", "vulners",
        ],
        "platform": "any",
        "priority": 0,
    },
    {
        "name": "SSL/TLS Audit",
        "description": "Deep analysis of SSL/TLS configuration: cipher suites, protocol versions, certificate validity, and known vulnerabilities.",
        "nse_scripts": [
            "ssl-enum-ciphers", "ssl-cert", "ssl-date",
            "ssl-heartbleed", "ssl-poodle", "ssl-dh-params",
            "ssl-ccs-injection", "sslv2-drown", "sslv2",
            "tls-ticketbleed", "tls-alpn",
        ],
        "platform": "ssl",
        "priority": 0,
    },
    # ── Individual Critical Checks ─────────────────────────────────────
    {
        "name": "EternalBlue SMB (MS17-010)",
        "description": "Detects Microsoft SMB servers vulnerable to MS17-010 (EternalBlue), a critical RCE used by WannaCry ransomware.",
        "nse_scripts": ["smb-vuln-ms17-010"],
        "severity": "critical",
        "platform": "smb",
        "priority": 1,
    },
    {
        "name": "Shellshock (CVE-2014-6271)",
        "description": "Detects web servers vulnerable to Shellshock, a critical Bash RCE exploitable via CGI scripts.",
        "nse_scripts": ["http-shellshock"],
        "severity": "critical",
        "platform": "http",
        "priority": 1,
    },
    {
        "name": "Heartbleed (CVE-2014-0160)",
        "description": "Detects OpenSSL servers vulnerable to Heartbleed, which allows reading memory contents including private keys.",
        "nse_scripts": ["ssl-heartbleed"],
        "severity": "critical",
        "platform": "ssl",
        "priority": 1,
    },
    {
        "name": "Apache Struts RCE (CVE-2017-5638)",
        "description": "Detects Apache Struts servers vulnerable to CVE-2017-5638, a critical RCE in the Jakarta Multipart parser.",
        "nse_scripts": ["http-vuln-cve2017-5638"],
        "severity": "critical",
        "platform": "http",
        "priority": 1,
    },
    {
        "name": "Conficker SMB (MS08-067)",
        "description": "Detects Microsoft SMB servers vulnerable to MS08-067 (Conficker), a critical RCE in the Server service.",
        "nse_scripts": ["smb-vuln-ms08-067"],
        "severity": "critical",
        "platform": "smb",
        "priority": 1,
    },
    {
        "name": "Default Credentials Check",
        "description": "Tests common services for default or factory credentials including FTP anonymous access and SNMP community strings.",
        "nse_scripts": ["ftp-anon", "http-default-accounts", "snmp-brute"],
        "severity": "critical",
        "platform": "any",
        "priority": 2,
    },
    {
        "name": "HTTP SQL Injection",
        "description": "Crawls a web application and tests parameters for SQL injection vulnerabilities.",
        "nse_scripts": ["http-sql-injection"],
        "severity": "critical",
        "platform": "http",
        "priority": 2,
    },
    # ── High ───────────────────────────────────────────────────────────
    {
        "name": "Vulners CVE Lookup",
        "description": "Queries the Vulners CVE database to find known vulnerabilities for detected service versions.",
        "nse_scripts": ["vulners"],
        "severity": "high",
        "platform": "any",
        "script_args": {"vulners.showall": "true"},
        "priority": 2,
    },
    {
        "name": "SMB Share Enumeration",
        "description": "Enumerates SMB shares and checks for anonymous access.",
        "nse_scripts": ["smb-enum-shares", "smb-enum-users"],
        "severity": "high",
        "platform": "smb",
        "priority": 2,
    },
    {
        "name": "FTP Anonymous Login",
        "description": "Detects FTP servers allowing anonymous login.",
        "nse_scripts": ["ftp-anon"],
        "severity": "high",
        "platform": "ftp",
        "priority": 2,
    },
    {
        "name": "DNS Zone Transfer",
        "description": "Attempts DNS zone transfer (AXFR) to reveal all DNS records for a domain.",
        "nse_scripts": ["dns-zone-transfer"],
        "severity": "high",
        "platform": "dns",
        "priority": 2,
    },
    {
        "name": "HTTP XSS Detection",
        "description": "Tests for reflected and DOM-based cross-site scripting vulnerabilities.",
        "nse_scripts": ["http-stored-xss", "http-dombased-xss", "http-phpself-xss"],
        "severity": "high",
        "platform": "http",
        "priority": 2,
    },
    # ── Medium ─────────────────────────────────────────────────────────
    {
        "name": "SSH Algorithms Audit",
        "description": "Enumerates SSH ciphers, KEX, MACs, and host key types for identifying weak cryptographic configurations.",
        "nse_scripts": ["ssh2-enum-algos", "ssh-hostkey", "ssh-auth-methods"],
        "severity": "medium",
        "platform": "ssh",
        "priority": 3,
    },
    {
        "name": "HTTP Enumeration",
        "description": "Enumerates common web directories, admin panels, backup files, and exposed configuration.",
        "nse_scripts": ["http-enum"],
        "severity": "medium",
        "platform": "http",
        "priority": 3,
    },
    {
        "name": "HTTP Security Headers",
        "description": "Checks for missing HTTP security headers: CSP, X-Frame-Options, HSTS, X-Content-Type-Options.",
        "nse_scripts": ["http-security-headers", "http-headers"],
        "severity": "medium",
        "platform": "http",
        "priority": 3,
    },
    # ── Info ───────────────────────────────────────────────────────────
    {
        "name": "SMB OS Discovery",
        "description": "Discovers OS, computer name, domain, and workgroup over SMB for asset inventory.",
        "nse_scripts": ["smb-os-discovery"],
        "severity": "info",
        "platform": "smb",
        "priority": 5,
    },
    {
        "name": "Service Banner Grabbing",
        "description": "Captures service banners from open ports to identify software versions.",
        "nse_scripts": ["banner"],
        "severity": "info",
        "platform": "any",
        "priority": 5,
    },
]


async def seed_builtin_profiles(db: AsyncSession) -> int:
    """Seed built-in NSE profiles if none exist yet.

    Only inserts profiles when no builtin profiles exist (first startup).
    Returns the number of profiles seeded.
    """
    result = await db.execute(
        select(NseTemplate).where(NseTemplate.type == NseTemplateType.BUILTIN).limit(1)
    )
    if result.scalar_one_or_none() is not None:
        return 0  # Already has builtin profiles, skip

    count = 0
    for p in BUILTIN_PROFILES:
        profile = NseTemplate(
            name=p["name"],
            description=p["description"],
            nse_scripts=p["nse_scripts"],
            severity=NseTemplateSeverity(p["severity"]) if p.get("severity") else None,
            platform=p["platform"],
            type=NseTemplateType.BUILTIN,
            enabled=True,
            script_args=p.get("script_args"),
            priority=p.get("priority", 10),
        )
        db.add(profile)
        count += 1

    logger.info("Seeded %d built-in NSE profiles", count)
    return count
