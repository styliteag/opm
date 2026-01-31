"""Pytest configuration and fixtures for backend tests."""

from collections.abc import AsyncGenerator
from datetime import datetime, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import create_access_token, hash_password
from app.models import Base
from app.models.network import Network
from app.models.scan import Scan, ScanStatus, TriggerType
from app.models.scanner import Scanner
from app.models.user import User, UserRole

# Test database URL - use SQLite for fast, isolated tests
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest.fixture
async def engine():
    """Create a test database engine."""
    engine = create_async_engine(
        TEST_DATABASE_URL,
        echo=False,
        connect_args={"check_same_thread": False},
    )

    # Enable foreign keys for SQLite
    @event.listens_for(engine.sync_engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


@pytest.fixture
async def db_session(engine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session."""
    async_session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with async_session_factory() as session:
        yield session
        await session.rollback()


@pytest.fixture
async def client(engine, db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a test HTTP client with dependency overrides."""
    from app.core.database import get_db
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


# ============================================================================
# User Fixtures
# ============================================================================


@pytest.fixture
async def admin_user(db_session: AsyncSession) -> User:
    """Create an admin user for testing."""
    user = User(
        email="admin@test.com",
        password_hash=hash_password("adminpass123"),
        role=UserRole.ADMIN,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
async def viewer_user(db_session: AsyncSession) -> User:
    """Create a viewer user for testing."""
    user = User(
        email="viewer@test.com",
        password_hash=hash_password("viewerpass123"),
        role=UserRole.VIEWER,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user


@pytest.fixture
def admin_token(admin_user: User) -> str:
    """Create a JWT token for the admin user."""
    return create_access_token(
        data={
            "sub": str(admin_user.id),
            "email": admin_user.email,
            "role": admin_user.role.value,
        }
    )


@pytest.fixture
def viewer_token(viewer_user: User) -> str:
    """Create a JWT token for the viewer user."""
    return create_access_token(
        data={
            "sub": str(viewer_user.id),
            "email": viewer_user.email,
            "role": viewer_user.role.value,
        }
    )


@pytest.fixture
def admin_headers(admin_token: str) -> dict[str, str]:
    """HTTP headers with admin authentication."""
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture
def viewer_headers(viewer_token: str) -> dict[str, str]:
    """HTTP headers with viewer authentication."""
    return {"Authorization": f"Bearer {viewer_token}"}


# ============================================================================
# Scanner Fixtures
# ============================================================================


@pytest.fixture
async def scanner(db_session: AsyncSession) -> Scanner:
    """Create a scanner for testing."""
    scanner = Scanner(
        name="Test Scanner",
        api_key_hash=hash_password("scanner-api-key"),
        description="Test scanner for unit tests",
    )
    db_session.add(scanner)
    await db_session.commit()
    await db_session.refresh(scanner)
    return scanner


@pytest.fixture
def scanner_token(scanner: Scanner) -> str:
    """Create a JWT token for a scanner."""
    return create_access_token(
        data={
            "sub": str(scanner.id),
            "scope": "scanner",
        }
    )


@pytest.fixture
def scanner_headers(scanner_token: str) -> dict[str, str]:
    """HTTP headers with scanner authentication."""
    return {"Authorization": f"Bearer {scanner_token}"}


# ============================================================================
# Network Fixtures
# ============================================================================


@pytest.fixture
async def network(db_session: AsyncSession, scanner: Scanner) -> Network:
    """Create a network for testing."""
    network = Network(
        name="Test Network",
        cidr="192.168.1.0/24",
        scanner_id=scanner.id,
        port_spec="22,80,443",
    )
    db_session.add(network)
    await db_session.commit()
    await db_session.refresh(network)
    return network


@pytest.fixture
async def network_with_scan(
    db_session: AsyncSession, network: Network
) -> tuple[Network, Scan]:
    """Create a network with a completed scan."""
    scan = Scan(
        network_id=network.id,
        scanner_id=network.scanner_id,
        status=ScanStatus.COMPLETED,
        trigger_type=TriggerType.MANUAL,
        started_at=datetime.now(timezone.utc),
        completed_at=datetime.now(timezone.utc),
    )
    db_session.add(scan)
    await db_session.commit()
    await db_session.refresh(scan)
    return network, scan


# ============================================================================
# Factory Functions
# ============================================================================


class UserFactory:
    """Factory for creating test users."""

    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session
        self._counter = 0

    async def create(
        self,
        email: str | None = None,
        password: str = "testpass123",
        role: UserRole = UserRole.VIEWER,
    ) -> User:
        """Create a user with the given attributes."""
        self._counter += 1
        if email is None:
            email = f"user{self._counter}@test.com"

        user = User(
            email=email,
            password_hash=hash_password(password),
            role=role,
        )
        self.db_session.add(user)
        await self.db_session.commit()
        await self.db_session.refresh(user)
        return user


class ScannerFactory:
    """Factory for creating test scanners."""

    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session
        self._counter = 0

    async def create(
        self,
        name: str | None = None,
        api_key: str = "test-api-key",
    ) -> Scanner:
        """Create a scanner with the given attributes."""
        self._counter += 1
        if name is None:
            name = f"Scanner {self._counter}"

        scanner = Scanner(
            name=name,
            api_key_hash=hash_password(api_key),
        )
        self.db_session.add(scanner)
        await self.db_session.commit()
        await self.db_session.refresh(scanner)
        return scanner


class NetworkFactory:
    """Factory for creating test networks."""

    def __init__(self, db_session: AsyncSession):
        self.db_session = db_session
        self._counter = 0

    async def create(
        self,
        scanner: Scanner,
        name: str | None = None,
        cidr: str = "10.0.0.0/24",
    ) -> Network:
        """Create a network with the given attributes."""
        self._counter += 1
        if name is None:
            name = f"Network {self._counter}"

        network = Network(
            name=name,
            cidr=cidr,
            scanner_id=scanner.id,
            port_spec="22,80,443",
        )
        self.db_session.add(network)
        await self.db_session.commit()
        await self.db_session.refresh(network)
        return network


@pytest.fixture
def user_factory(db_session: AsyncSession) -> UserFactory:
    """Factory fixture for creating test users."""
    return UserFactory(db_session)


@pytest.fixture
def scanner_factory(db_session: AsyncSession) -> ScannerFactory:
    """Factory fixture for creating test scanners."""
    return ScannerFactory(db_session)


@pytest.fixture
def network_factory(db_session: AsyncSession) -> NetworkFactory:
    """Factory fixture for creating test networks."""
    return NetworkFactory(db_session)
