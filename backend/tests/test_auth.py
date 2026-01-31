"""Tests for authentication service and router."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.services.auth import (
    authenticate_user,
    create_admin_user,
    create_user_token,
    get_user_by_email,
    get_user_by_id,
)


class TestAuthService:
    """Tests for authentication service functions."""

    async def test_authenticate_user_success(self, db_session: AsyncSession):
        """Authenticate user should return user for valid credentials."""
        user = User(
            email="auth@test.com",
            password_hash=hash_password("correctpassword"),
            role=UserRole.VIEWER,
        )
        db_session.add(user)
        await db_session.commit()

        result = await authenticate_user(db_session, "auth@test.com", "correctpassword")

        assert result is not None
        assert result.email == "auth@test.com"

    async def test_authenticate_user_wrong_password(self, db_session: AsyncSession):
        """Authenticate user should return None for wrong password."""
        user = User(
            email="auth2@test.com",
            password_hash=hash_password("correctpassword"),
            role=UserRole.VIEWER,
        )
        db_session.add(user)
        await db_session.commit()

        result = await authenticate_user(db_session, "auth2@test.com", "wrongpassword")

        assert result is None

    async def test_authenticate_user_nonexistent(self, db_session: AsyncSession):
        """Authenticate user should return None for non-existent user."""
        result = await authenticate_user(
            db_session, "nonexistent@test.com", "anypassword"
        )

        assert result is None

    async def test_create_user_token(self, admin_user: User):
        """Create user token should return valid token response."""
        token_response = create_user_token(admin_user)

        assert token_response.access_token is not None
        assert len(token_response.access_token) > 0
        assert token_response.token_type == "bearer"

    async def test_get_user_by_id_exists(
        self, db_session: AsyncSession, admin_user: User
    ):
        """Get user by ID should return user when exists."""
        result = await get_user_by_id(db_session, admin_user.id)

        assert result is not None
        assert result.id == admin_user.id
        assert result.email == admin_user.email

    async def test_get_user_by_id_not_exists(self, db_session: AsyncSession):
        """Get user by ID should return None when not exists."""
        result = await get_user_by_id(db_session, 99999)

        assert result is None

    async def test_get_user_by_email_exists(
        self, db_session: AsyncSession, admin_user: User
    ):
        """Get user by email should return user when exists."""
        result = await get_user_by_email(db_session, admin_user.email)

        assert result is not None
        assert result.email == admin_user.email

    async def test_get_user_by_email_not_exists(self, db_session: AsyncSession):
        """Get user by email should return None when not exists."""
        result = await get_user_by_email(db_session, "nonexistent@test.com")

        assert result is None

    async def test_create_admin_user(self, db_session: AsyncSession):
        """Create admin user should create user with admin role."""
        user = await create_admin_user(
            db_session, "newadmin@test.com", "adminpassword"
        )

        assert user is not None
        assert user.email == "newadmin@test.com"
        assert user.role == UserRole.ADMIN
        assert user.id is not None


class TestAuthRouter:
    """Tests for authentication router endpoints."""

    async def test_login_success(self, client: AsyncClient, admin_user: User):
        """Login should return token for valid credentials."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "admin@test.com", "password": "adminpass123"},
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    async def test_login_wrong_password(self, client: AsyncClient, admin_user: User):
        """Login should return 401 for wrong password."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "admin@test.com", "password": "wrongpassword"},
        )

        assert response.status_code == 401
        assert "Incorrect email or password" in response.json()["detail"]

    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Login should return 401 for non-existent user."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "nonexistent@test.com", "password": "anypassword"},
        )

        assert response.status_code == 401

    async def test_login_invalid_email_format(self, client: AsyncClient):
        """Login should return 422 for invalid email format."""
        response = await client.post(
            "/api/auth/login",
            json={"email": "notanemail", "password": "password"},
        )

        assert response.status_code == 422

    async def test_get_me_authenticated(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Get /me should return user info when authenticated."""
        response = await client.get("/api/auth/me", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@test.com"
        assert data["role"] == "admin"

    async def test_get_me_unauthenticated(self, client: AsyncClient):
        """Get /me should return 401 when not authenticated."""
        response = await client.get("/api/auth/me")

        assert response.status_code == 401

    async def test_get_me_invalid_token(self, client: AsyncClient):
        """Get /me should return 401 for invalid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalidtoken"},
        )

        assert response.status_code == 401

    async def test_update_me_theme(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """PUT /me should update theme preference."""
        response = await client.put(
            "/api/auth/me",
            headers=admin_headers,
            json={"theme_preference": "dark"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["theme_preference"] == "dark"

    async def test_logout(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Logout should return 204."""
        response = await client.post("/api/auth/logout", headers=admin_headers)

        assert response.status_code == 204
