"""Open Port Monitor Backend - FastAPI Application."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError, OperationalError

from .core.config import settings
from .core.database import async_session_factory
from .core.version import get_version
from .routers import (
    alerts,
    auth,
    global_ports,
    networks,
    policy,
    ports,
    scanner,
    scanners,
    scans,
    users,
    version,
)
from .services.auth import create_admin_user, get_user_by_email
from .services.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler for startup and shutdown events."""
    # Log version at startup
    version_str = get_version()
    logger.info(f"Open Port Monitor Backend v{version_str} starting...")

    # Initialize database schema from models
    from .core.database import init_db

    await init_db()

    # Startup: Create initial admin user if not exists
    # Handle race condition where multiple workers might try to create the user simultaneously
    async with async_session_factory() as db:
        # Use a retry loop with exponential backoff for robustness against deadlocks/race conditions
        for attempt in range(5):
            try:
                existing_admin = await get_user_by_email(db, settings.admin_email)
                if existing_admin is None:
                    await create_admin_user(db, settings.admin_email, settings.admin_password)
                    await db.commit()
                    logger.info(f"Created initial admin user: {settings.admin_email}")
                else:
                    logger.info(f"Admin user already exists: {settings.admin_email}")
                break
            except (IntegrityError, OperationalError) as e:
                await db.rollback()
                # 1062 = Duplicate entry, 1213 = Deadlock/Lock wait timeout
                error_str = str(e.orig) if hasattr(e, "orig") else str(e)
                if "1062" in error_str or "1213" in error_str:
                    if attempt < 4:
                        wait = (attempt + 1) * 0.5
                        logger.info(
                            f"Race condition during admin creation (attempt {attempt + 1}), "
                            f"retrying in {wait}s..."
                        )
                        await asyncio.sleep(wait)
                        continue
                    else:
                        logger.info("Admin user already exists (created by another worker).")
                        break
                else:
                    logger.error(f"Unexpected database error during admin creation: {e}")
                    raise
            except Exception as e:
                # Catch any other errors
                await db.rollback()
                logger.error(f"Failed to create admin user: {e}")
                raise

    start_scheduler()

    yield

    # Shutdown: cleanup if needed
    shutdown_scheduler()


app = FastAPI(
    title="Open Port Monitor",
    description="Distributed network port scanning and monitoring system",
    version="0.1.0",
    lifespan=lifespan,
)

# Configure CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(global_ports.router)
app.include_router(networks.router)
app.include_router(policy.router)
app.include_router(ports.router)
app.include_router(scanner.router)
app.include_router(scans.router)
app.include_router(scanners.router)
app.include_router(users.router)
app.include_router(version.router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
