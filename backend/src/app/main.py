"""Open Port Monitor Backend - FastAPI Application."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.exc import IntegrityError

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
    version = get_version()
    logger.info(f"Open Port Monitor Backend v{version} starting...")

    # Initialize database schema from models
    from .core.database import init_db

    await init_db()

    # Startup: Create initial admin user if not exists
    # Handle race condition where multiple workers might try to create the user simultaneously
    async with async_session_factory() as db:
        existing_admin = await get_user_by_email(db, settings.admin_email)
        if existing_admin is None:
            try:
                await create_admin_user(db, settings.admin_email, settings.admin_password)
                await db.commit()
                logger.info(f"Created initial admin user: {settings.admin_email}")
            except IntegrityError as e:
                # If user was created by another worker between check and create, that's okay
                await db.rollback()
                if "Duplicate entry" in str(e.orig) or "1062" in str(e.orig):
                    logger.info(
                        "Admin user already exists (created by another worker): "
                        f"{settings.admin_email}"
                    )
                else:
                    logger.error(f"Failed to create admin user: {e}")
                    raise
            except Exception as e:
                # Catch any other errors
                await db.rollback()
                logger.error(f"Failed to create admin user: {e}")
                raise
        else:
            logger.info(f"Admin user already exists: {settings.admin_email}")

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
