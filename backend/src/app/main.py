"""Open Port Monitor Backend - FastAPI Application."""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .core.version import get_version
from .routers import (
    alerts,
    auth,
    global_ports,
    hosts,
    networks,
    policy,
    ports,
    scanner,
    scanners,
    scans,
    ssh,
    trends,
    users,
    version,
)
from .services.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler for startup and shutdown events."""
    # Log version at startup
    version_str = get_version()
    logger.info(f"Open Port Monitor Backend v{version_str} starting...")

    # Initialize database schema from models (migrations and admin user
    # are handled by startup scripts before workers start)
    from .core.database import init_db

    await init_db()

    start_scheduler()

    yield

    # Shutdown: cleanup if needed
    shutdown_scheduler()


app = FastAPI(
    title="Open Port Monitor",
    description="Distributed network port scanning and monitoring system",
    version=get_version(),
    lifespan=lifespan,
)

# Configure CORS for frontend
# WARNING: allow_origins=["*"] with allow_credentials=True is a security risk
# and should only be used in development environments. For production, use
# specific origins via settings.cors_origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(global_ports.router)
app.include_router(hosts.router)
app.include_router(networks.router)
app.include_router(policy.router)
app.include_router(ports.router)
app.include_router(scanner.router)
app.include_router(scans.router)
app.include_router(scanners.router)
app.include_router(ssh.router)
app.include_router(trends.router)
app.include_router(users.router)
app.include_router(version.router)


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
