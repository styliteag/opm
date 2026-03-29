"""Tests for PATCH /api/global-ports/{id}/comment endpoint."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.global_open_port import GlobalOpenPort


@pytest.fixture
async def test_port(db_session: AsyncSession) -> GlobalOpenPort:
    """Create a global open port for comment tests."""
    port = GlobalOpenPort(
        ip="10.0.0.1",
        port=80,
        protocol="tcp",
        seen_by_networks=[1],
    )
    db_session.add(port)
    await db_session.commit()
    await db_session.refresh(port)
    return port


class TestPortCommentPatch:
    """Tests for PATCH /api/global-ports/{id}/comment."""

    @pytest.mark.asyncio
    async def test_set_comment(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        test_port: GlobalOpenPort,
    ) -> None:
        """PATCH with user_comment sets the comment and returns updated port."""
        response = await client.patch(
            f"/api/global-ports/{test_port.id}/comment",
            headers=admin_headers,
            json={"user_comment": "my note"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_comment"] == "my note"
        assert data["id"] == test_port.id
        assert data["ip"] == "10.0.0.1"
        assert data["port"] == 80

    @pytest.mark.asyncio
    async def test_clear_comment_with_null(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        db_session: AsyncSession,
        test_port: GlobalOpenPort,
    ) -> None:
        """PATCH with user_comment=null clears the comment."""
        # First set a comment
        test_port.user_comment = "existing comment"
        await db_session.commit()

        response = await client.patch(
            f"/api/global-ports/{test_port.id}/comment",
            headers=admin_headers,
            json={"user_comment": None},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_comment"] is None

    @pytest.mark.asyncio
    async def test_set_empty_string_comment(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        test_port: GlobalOpenPort,
    ) -> None:
        """PATCH with user_comment="" sets comment to empty string."""
        response = await client.patch(
            f"/api/global-ports/{test_port.id}/comment",
            headers=admin_headers,
            json={"user_comment": ""},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["user_comment"] == ""

    @pytest.mark.asyncio
    async def test_returns_404_for_nonexistent_port(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
    ) -> None:
        """PATCH returns 404 for nonexistent port ID."""
        response = await client.patch(
            "/api/global-ports/99999/comment",
            headers=admin_headers,
            json={"user_comment": "test"},
        )
        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_requires_authentication(
        self,
        client: AsyncClient,
        test_port: GlobalOpenPort,
    ) -> None:
        """PATCH requires authentication (401 without token)."""
        response = await client.patch(
            f"/api/global-ports/{test_port.id}/comment",
            json={"user_comment": "test"},
        )
        assert response.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_does_not_alter_other_fields(
        self,
        client: AsyncClient,
        admin_headers: dict[str, str],
        test_port: GlobalOpenPort,
    ) -> None:
        """Updating comment does not alter any other GlobalOpenPort fields."""
        original_ip = test_port.ip
        original_port = test_port.port
        original_protocol = test_port.protocol

        response = await client.patch(
            f"/api/global-ports/{test_port.id}/comment",
            headers=admin_headers,
            json={"user_comment": "updated note"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["ip"] == original_ip
        assert data["port"] == original_port
        assert data["protocol"] == original_protocol
        assert data["user_comment"] == "updated note"
