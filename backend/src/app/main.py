"""STYLiTE Orbit Monitor Backend - FastAPI Application."""

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
    global_settings,
    gvm_library,
    host_timeline,
    hosts,
    metadata,
    networks,
    nse,
    organization,
    policy,
    ports,
    roles,
    scanner,
    scanners,
    scans,
    severity_rules,
    ssh,
    trends,
    users,
    version,
)
from .routers import (
    hostname_lookup as hostname_lookup_router,
)
from .services.scheduler import shutdown_scheduler, start_scheduler

logger = logging.getLogger(__name__)


_INSECURE_JWT_SECRETS = {"changeme-in-production", "dev-secret-change-in-production"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Application lifespan handler for startup and shutdown events."""
    # Refuse to start with default JWT secret in non-debug mode
    if not settings.debug and settings.jwt_secret in _INSECURE_JWT_SECRETS:
        raise RuntimeError(
            "SECURITY: JWT_SECRET is set to an insecure default. "
            "Set a strong JWT_SECRET environment variable before running in production."
        )

    # Log version at startup
    version_str = get_version()
    logger.info(f"STYLiTE Orbit Monitor Backend v{version_str} starting...")

    # Initialize database schema from models (migrations and admin user
    # are handled by startup scripts before workers start)
    from .core.database import init_db

    await init_db()

    # NSE profile seeding is handled by scripts/seed_nse.py before workers start

    start_scheduler()

    yield

    # Shutdown: cleanup if needed
    shutdown_scheduler()


app = FastAPI(
    title="STYLiTE Orbit Monitor",
    description="Distributed network port scanning and monitoring system",
    version=get_version(),
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

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
app.include_router(global_settings.router)
app.include_router(gvm_library.router)
app.include_router(severity_rules.router)
app.include_router(host_timeline.router)
app.include_router(hostname_lookup_router.router)
app.include_router(hosts.router)
app.include_router(metadata.router)
app.include_router(networks.router)
app.include_router(nse.router)
app.include_router(organization.router)
app.include_router(policy.router)
app.include_router(ports.router)
app.include_router(roles.router)
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
