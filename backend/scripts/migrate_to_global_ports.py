#!/usr/bin/env python3
"""
Migration script to populate global_open_ports from existing open_ports data.

This script:
1. Reads all open ports from the open_ports table
2. Groups them by (ip, port, protocol)
3. Creates entries in global_open_ports with:
   - first_seen_at: earliest timestamp across all occurrences
   - last_seen_at: latest timestamp across all occurrences
   - seen_by_networks: list of all network_ids where this port was seen

Usage:
    cd backend && python -m scripts.migrate_to_global_ports
"""

import asyncio
import os
import sys
from collections import defaultdict

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from app.models.global_open_port import GlobalOpenPort
from app.models.open_port import OpenPort
from app.models.scan import Scan


async def migrate_open_ports(db: AsyncSession) -> dict[str, int]:
    """
    Migrate existing open_ports to global_open_ports.

    Returns statistics about the migration.
    """
    stats = {
        "total_open_ports": 0,
        "unique_combinations": 0,
        "created": 0,
        "updated": 0,
        "skipped": 0,
    }

    # Fetch all open ports with their network_id via the scan
    result = await db.execute(
        select(OpenPort, Scan.network_id)
        .join(Scan, OpenPort.scan_id == Scan.id)
        .order_by(OpenPort.first_seen_at.asc())
    )

    all_ports = result.all()
    stats["total_open_ports"] = len(all_ports)

    if not all_ports:
        print("No open ports found to migrate.")
        return stats

    # Group by (ip, port, protocol)
    grouped: dict[tuple[str, int, str], dict] = defaultdict(
        lambda: {
            "first_seen_at": None,
            "last_seen_at": None,
            "network_ids": set(),
            "banner": None,
            "service_guess": None,
            "mac_address": None,
            "mac_vendor": None,
        }
    )

    for open_port, network_id in all_ports:
        key = (open_port.ip, open_port.port, open_port.protocol)
        entry = grouped[key]

        # Track earliest first_seen_at
        if entry["first_seen_at"] is None or open_port.first_seen_at < entry["first_seen_at"]:
            entry["first_seen_at"] = open_port.first_seen_at

        # Track latest last_seen_at
        if entry["last_seen_at"] is None or open_port.last_seen_at > entry["last_seen_at"]:
            entry["last_seen_at"] = open_port.last_seen_at

        # Collect network IDs
        entry["network_ids"].add(network_id)

        # Keep most recent banner/service info (overwrite with newer data)
        if open_port.banner:
            entry["banner"] = open_port.banner
        if open_port.service_guess:
            entry["service_guess"] = open_port.service_guess
        if open_port.mac_address:
            entry["mac_address"] = open_port.mac_address
        if open_port.mac_vendor:
            entry["mac_vendor"] = open_port.mac_vendor

    stats["unique_combinations"] = len(grouped)
    print(f"Found {stats['unique_combinations']} unique (ip, port, protocol) combinations")

    # Process each unique combination
    for key, entry in grouped.items():
        ip, port, protocol = key

        # Check if already exists
        existing = await db.execute(
            select(GlobalOpenPort).where(
                GlobalOpenPort.ip == ip,
                GlobalOpenPort.port == port,
                GlobalOpenPort.protocol == protocol,
            )
        )
        existing_port = existing.scalar_one_or_none()

        if existing_port:
            # Update existing entry
            if entry["first_seen_at"] < existing_port.first_seen_at:
                existing_port.first_seen_at = entry["first_seen_at"]
            if entry["last_seen_at"] > existing_port.last_seen_at:
                existing_port.last_seen_at = entry["last_seen_at"]

            # Merge network IDs
            existing_networks = set(existing_port.seen_by_networks or [])
            existing_networks.update(entry["network_ids"])
            existing_port.seen_by_networks = sorted(existing_networks)

            # Update other fields if we have newer data
            if entry["banner"]:
                existing_port.banner = entry["banner"]
            if entry["service_guess"]:
                existing_port.service_guess = entry["service_guess"]
            if entry["mac_address"]:
                existing_port.mac_address = entry["mac_address"]
            if entry["mac_vendor"]:
                existing_port.mac_vendor = entry["mac_vendor"]

            stats["updated"] += 1
        else:
            # Create new entry
            global_port = GlobalOpenPort(
                ip=ip,
                port=port,
                protocol=protocol,
                banner=entry["banner"],
                service_guess=entry["service_guess"],
                mac_address=entry["mac_address"],
                mac_vendor=entry["mac_vendor"],
                first_seen_at=entry["first_seen_at"],
                last_seen_at=entry["last_seen_at"],
                seen_by_networks=sorted(entry["network_ids"]),
            )
            db.add(global_port)
            stats["created"] += 1

    await db.flush()
    return stats


async def main() -> None:
    """Main entry point for the migration script."""
    database_url = os.getenv(
        "DATABASE_URL",
        "mysql+aiomysql://opm:opm_password@localhost:3306/open_port_monitor",
    )

    print("Connecting to database...")
    engine = create_async_engine(database_url, echo=False)

    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        async with session.begin():
            print("Starting migration of open ports to global_open_ports...")
            stats = await migrate_open_ports(session)

            print("\nMigration complete!")
            print(f"  Total open_ports scanned: {stats['total_open_ports']}")
            print(f"  Unique (ip, port, protocol) combinations: {stats['unique_combinations']}")
            print(f"  New global_open_ports created: {stats['created']}")
            print(f"  Existing global_open_ports updated: {stats['updated']}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
