#!/usr/bin/env python3
"""Build manifest.json from NSE scripts directory.

Generates a manifest.json that maps each .nse file to its metadata
(name, path, protocol).

Usage:
    python3 tools/build-manifest.py
    python3 tools/build-manifest.py --scripts-dir scripts --output manifest.json
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path


def extract_protocol_from_nse(script_path: Path) -> str:
    """Try to extract the target protocol from NSE script metadata.

    Looks for portrule/hostrule and common port patterns.
    """
    try:
        content = script_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return "*"

    # Check for common protocol patterns in portrule
    protocol_patterns = [
        (r"shortport\.(?:http|https)", "http"),
        (r"shortport\.ssl", "ssl"),
        (r"shortport\.ssh", "ssh"),
        (r"shortport\.ftp", "ftp"),
        (r"shortport\.smtp", "smtp"),
        (r"shortport\.dns", "dns"),
        (r"shortport\.smb", "smb"),
        (r"shortport\.snmp", "snmp"),
        (r"shortport\.mysql", "mysql"),
        (r"shortport\.postgres", "postgres"),
        (r"shortport\.rdp", "rdp"),
        (r"shortport\.vnc", "vnc"),
        (r"shortport\.telnet", "telnet"),
        (r"shortport\.ldap", "ldap"),
    ]

    for pattern, proto in protocol_patterns:
        if re.search(pattern, content):
            return proto

    # Check script name prefix as fallback
    name = script_path.stem
    prefix = name.split("-")[0] if "-" in name else ""
    known_prefixes = {
        "ssh", "http", "https", "ftp", "smtp", "dns", "smb", "snmp",
        "mysql", "ssl", "tls", "rdp", "vnc", "telnet", "ldap",
        "imap", "pop3", "ntp", "dhcp", "tftp", "afp", "ajp", "amqp",
    }
    if prefix in known_prefixes:
        return prefix

    return "*"


def build_manifest(scripts_dir: Path) -> dict:
    """Build an NSE manifest from .nse files."""
    scripts: dict[str, dict] = {}

    nse_files = sorted(scripts_dir.glob("*.nse"))
    for nse_file in nse_files:
        key = nse_file.name  # e.g. "vulners.nse"
        name = nse_file.stem  # e.g. "vulners"
        protocol = extract_protocol_from_nse(nse_file)

        scripts[key] = {
            "name": name,
            "path": f"scripts/{nse_file.name}",
            "protocol": protocol,
        }

    return {
        "name": "opm-nse",
        "version": "0.1.0",
        "description": "NSE scripts for Open Port Monitor",
        "scripts": scripts,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build NSE manifest.json")
    parser.add_argument(
        "--scripts-dir", default="scripts", help="Directory containing .nse files"
    )
    parser.add_argument(
        "--output", default="manifest.json", help="Output manifest path"
    )
    parser.add_argument(
        "--check", action="store_true",
        help="Check mode: exit 1 if manifest would change"
    )
    args = parser.parse_args()

    scripts_dir = Path(args.scripts_dir)
    if not scripts_dir.is_dir():
        print(f"Error: scripts directory '{scripts_dir}' not found", file=sys.stderr)
        sys.exit(1)

    manifest = build_manifest(scripts_dir)
    manifest_json = json.dumps(manifest, indent=2, sort_keys=False) + "\n"

    if args.check:
        output_path = Path(args.output)
        if output_path.exists():
            existing = output_path.read_text(encoding="utf-8")
            if existing == manifest_json:
                print(f"Manifest is up to date ({len(manifest['scripts'])} scripts)")
                sys.exit(0)
            else:
                print(f"Manifest is out of date", file=sys.stderr)
                sys.exit(1)
        else:
            print(f"Manifest does not exist", file=sys.stderr)
            sys.exit(1)

    output_path = Path(args.output)
    output_path.write_text(manifest_json, encoding="utf-8")
    print(f"Wrote manifest with {len(manifest['scripts'])} scripts to {output_path}")


if __name__ == "__main__":
    main()
