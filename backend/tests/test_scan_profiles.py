"""Tests for scan profile service and router."""

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.nse_template import ScanProfile, ScanProfileType
from app.models.user import User
from app.services.nse_templates import (
    create_profile_with_phases,
    clone_profile,
    delete_profile,
    get_all_profiles,
    get_profile_by_id,
)

SAMPLE_PHASES = [
    {
        "name": "host_discovery",
        "enabled": True,
        "tool": "nmap",
        "config": {"aggressive": False, "max_retries": 2},
    },
    {
        "name": "port_scan",
        "enabled": True,
        "tool": "masscan",
        "config": {"port_range": "1-10000", "max_retries": 3},
    },
    {
        "name": "vulnerability",
        "enabled": True,
        "tool": "nmap_nse",
        "config": {
            "scripts": ["vulners", "banner"],
            "script_args": {},
            "max_retries": 3,
        },
    },
]


class TestScanProfileService:
    """Tests for scan profile service functions."""

    async def test_create_profile_with_phases(
        self, db_session: AsyncSession,
    ):
        """Create profile should store phases JSON."""
        profile = await create_profile_with_phases(
            db_session,
            name="Test Profile",
            description="A test profile",
            phases=SAMPLE_PHASES,
        )
        await db_session.commit()
        await db_session.refresh(profile)

        assert profile.id is not None
        assert profile.name == "Test Profile"
        assert profile.phases is not None
        assert len(profile.phases) == 3
        assert profile.phases[0]["name"] == "host_discovery"
        assert profile.phases[1]["name"] == "port_scan"
        assert profile.phases[2]["name"] == "vulnerability"
        assert profile.type == ScanProfileType.CUSTOM

    async def test_get_all_profiles(self, db_session: AsyncSession):
        """Get all profiles should return profiles."""
        await create_profile_with_phases(
            db_session, name="Profile A", phases=SAMPLE_PHASES,
        )
        await create_profile_with_phases(
            db_session, name="Profile B", phases=SAMPLE_PHASES,
        )
        await db_session.commit()

        profiles = await get_all_profiles(db_session)
        assert len(profiles) == 2

    async def test_get_profile_by_id(self, db_session: AsyncSession):
        """Get profile by ID should return correct profile."""
        profile = await create_profile_with_phases(
            db_session, name="Find Me", phases=SAMPLE_PHASES,
        )
        await db_session.commit()
        await db_session.refresh(profile)

        found = await get_profile_by_id(db_session, profile.id)
        assert found is not None
        assert found.name == "Find Me"

    async def test_get_profile_by_id_not_found(
        self, db_session: AsyncSession,
    ):
        """Get profile by non-existent ID should return None."""
        result = await get_profile_by_id(db_session, 99999)
        assert result is None

    async def test_clone_profile(self, db_session: AsyncSession):
        """Clone should create independent copy."""
        source = await create_profile_with_phases(
            db_session,
            name="Original",
            phases=SAMPLE_PHASES,
            category="test",
        )
        await db_session.commit()
        await db_session.refresh(source)

        cloned = await clone_profile(db_session, source, "Cloned")
        await db_session.commit()
        await db_session.refresh(cloned)

        assert cloned.id != source.id
        assert cloned.name == "Cloned"
        assert cloned.phases == source.phases
        assert cloned.type == ScanProfileType.CUSTOM

    async def test_delete_profile(self, db_session: AsyncSession):
        """Delete should remove profile."""
        profile = await create_profile_with_phases(
            db_session, name="Delete Me", phases=SAMPLE_PHASES,
        )
        await db_session.commit()
        await db_session.refresh(profile)
        pid = profile.id

        await delete_profile(db_session, profile)
        await db_session.commit()

        assert await get_profile_by_id(db_session, pid) is None


class TestScanProfileRouter:
    """Tests for /api/scan-profiles/ endpoints."""

    async def test_list_profiles(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
        db_session: AsyncSession,
    ):
        """List should return profiles."""
        profile = ScanProfile(
            name="Router Test",
            description="",
            phases=SAMPLE_PHASES,
            type=ScanProfileType.CUSTOM,
            platform="any",
        )
        db_session.add(profile)
        await db_session.commit()

        response = await client.get(
            "/api/scan-profiles", headers=admin_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    async def test_create_profile(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
    ):
        """Create should accept phases and return profile."""
        response = await client.post(
            "/api/scan-profiles",
            headers=admin_headers,
            json={
                "name": "API Created",
                "description": "Created via API",
                "phases": SAMPLE_PHASES,
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "API Created"
        assert len(data["phases"]) == 3

    async def test_create_profile_invalid_tool(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
    ):
        """Create with invalid tool should fail validation."""
        bad_phases = [
            {
                "name": "port_scan",
                "enabled": True,
                "tool": "invalid_tool",
                "config": {},
            },
        ]
        response = await client.post(
            "/api/scan-profiles",
            headers=admin_headers,
            json={"name": "Bad", "phases": bad_phases},
        )
        assert response.status_code == 422

    async def test_delete_builtin_profile_fails(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
        db_session: AsyncSession,
    ):
        """Delete should reject builtin profiles."""
        profile = ScanProfile(
            name="Builtin Test",
            description="",
            phases=SAMPLE_PHASES,
            type=ScanProfileType.BUILTIN,
            platform="any",
        )
        db_session.add(profile)
        await db_session.commit()
        await db_session.refresh(profile)

        response = await client.delete(
            f"/api/scan-profiles/{profile.id}",
            headers=admin_headers,
        )
        assert response.status_code == 400

    async def test_clone_profile(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
        db_session: AsyncSession,
    ):
        """Clone should create a new custom profile."""
        profile = ScanProfile(
            name="Source",
            description="Original",
            phases=SAMPLE_PHASES,
            type=ScanProfileType.BUILTIN,
            platform="any",
        )
        db_session.add(profile)
        await db_session.commit()
        await db_session.refresh(profile)

        response = await client.post(
            f"/api/scan-profiles/{profile.id}/clone?name=My+Copy",
            headers=admin_headers,
            json={},
        )
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "My Copy"
        assert data["type"] == "custom"
