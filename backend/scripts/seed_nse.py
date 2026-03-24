#!/usr/bin/env python3
"""Seed built-in NSE profiles before workers start.

This script runs once during startup, after migrations but before uvicorn workers.
Since it runs as a single process, there's no race condition.
"""

import asyncio
import logging
import os
import sys

# Add src to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)


async def seed_nse() -> None:
    """Deduplicate and seed built-in NSE profiles."""
    from app.core.database import async_session_factory
    from app.services.nse_seed import seed_builtin_profiles

    async with async_session_factory() as db:
        seeded = await seed_builtin_profiles(db)
        await db.commit()
        if seeded > 0:
            logger.info("Seeded %d built-in NSE profiles", seeded)
        else:
            logger.info("Built-in NSE profiles already up to date")


def main() -> None:
    """Main entry point."""
    asyncio.run(seed_nse())


if __name__ == "__main__":
    main()
