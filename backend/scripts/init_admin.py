#!/usr/bin/env python3
"""Initialize admin user before workers start.

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


async def init_admin() -> None:
    """Create admin user if it doesn't exist."""
    from app.core.config import settings
    from app.core.database import async_session_factory
    from app.services.auth import create_admin_user, get_user_by_email

    async with async_session_factory() as db:
        existing_admin = await get_user_by_email(db, settings.admin_email)
        if existing_admin is None:
            await create_admin_user(db, settings.admin_email, settings.admin_password)
            await db.commit()
            logger.info(f"Created initial admin user: {settings.admin_email}")
        else:
            logger.info(f"Admin user already exists: {settings.admin_email}")


def main() -> None:
    """Main entry point."""
    asyncio.run(init_admin())


if __name__ == "__main__":
    main()
