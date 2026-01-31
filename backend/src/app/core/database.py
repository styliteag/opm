"""Database connection and session management."""

import asyncio
import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from .config import settings

logger = logging.getLogger(__name__)

# Create async engine
engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_pre_ping=True,
)

# Create async session factory
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def run_migrations() -> bool:
    """Run Alembic migrations if they exist.

    Uses a database advisory lock to ensure only one worker runs migrations
    at a time, preventing race conditions in multi-worker deployments.

    Returns:
        True if migrations were run, False if no migrations exist.
    """
    # Check if migrations directory exists and has version files
    migrations_dir = Path(__file__).parent.parent.parent / "migrations" / "versions"
    if not migrations_dir.exists():
        return False

    # Check if there are any migration files (excluding .gitkeep)
    migration_files = [
        f
        for f in migrations_dir.iterdir()
        if f.is_file() and f.suffix == ".py" and f.name != "__init__.py"
    ]
    if not migration_files:
        return False

    # Get path to alembic.ini (should be in backend root)
    # When running in container, alembic.ini is at /app/alembic.ini
    # When running locally, it's at backend/alembic.ini relative to project root
    alembic_ini_path = Path("/app/alembic.ini")
    if not alembic_ini_path.exists():
        # Try relative path (for local development)
        backend_root = Path(__file__).parent.parent.parent.parent
        alembic_ini_path = backend_root / "alembic.ini"
    if not alembic_ini_path.exists():
        logger.warning("alembic.ini not found, skipping migrations")
        return False

    def _run_migrations_sync() -> None:
        """Run migrations synchronously with advisory lock.

        Uses MySQL GET_LOCK() to ensure only one worker runs migrations.
        """
        import pymysql

        # Create sync connection for Alembic
        sync_url = settings.database_url.replace("+aiomysql", "+pymysql")

        # Parse connection params from URL
        # Format: mysql+pymysql://user:pass@host:port/dbname
        from urllib.parse import urlparse
        parsed = urlparse(sync_url.replace("mysql+pymysql://", "mysql://"))
        conn_params = {
            "host": parsed.hostname or "localhost",
            "port": parsed.port or 3306,
            "user": parsed.username,
            "password": parsed.password,
            "database": parsed.path.lstrip("/") if parsed.path else None,
        }

        # Get advisory lock before running migrations
        conn = pymysql.connect(**conn_params)
        try:
            with conn.cursor() as cursor:
                # Try to acquire lock with 30 second timeout
                # Lock name: "opm_migrations", unique per database
                cursor.execute("SELECT GET_LOCK('opm_migrations', 30)")
                result = cursor.fetchone()
                if result[0] != 1:
                    logger.info("Another worker is running migrations, skipping")
                    return

                try:
                    # Run migrations while holding the lock
                    alembic_cfg = Config(str(alembic_ini_path))
                    alembic_cfg.set_main_option("sqlalchemy.url", sync_url)
                    command.upgrade(alembic_cfg, "head")
                finally:
                    # Release the lock
                    cursor.execute("SELECT RELEASE_LOCK('opm_migrations')")
        finally:
            conn.close()

    try:
        logger.info("Running database migrations...")
        # Run sync Alembic command in thread executor
        await asyncio.to_thread(_run_migrations_sync)
        logger.info("Database migrations completed")
        return True
    except Exception as e:
        logger.error(f"Failed to run migrations: {e}", exc_info=True)
        return False


async def init_db() -> None:
    """Initialize database schema.

    First tries to run Alembic migrations if they exist.
    Falls back to creating schema from models if no migrations exist.
    """
    # Try to run migrations first
    migrations_ran = await run_migrations()

    if not migrations_ran:
        # Fall back to creating schema from models
        # Import here to avoid circular imports
        from app.models import Base

        logger.info("No migrations found, initializing schema from models...")
        try:
            async with engine.begin() as conn:
                # Use checkfirst=True to avoid errors if tables already exist
                # This is safe even with multiple workers starting simultaneously
                await conn.run_sync(
                    lambda sync_conn: Base.metadata.create_all(sync_conn, checkfirst=True)
                )
            logger.info("Database schema initialized from models")
        except Exception as e:
            # If tables already exist (e.g., from migrations or previous run), that's okay
            if "already exists" in str(e).lower():
                logger.info("Database tables already exist, skipping schema creation")
            else:
                logger.error(f"Failed to initialize database schema: {e}")
                raise


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency that provides a database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
