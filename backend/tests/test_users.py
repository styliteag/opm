"""Tests for user service and router."""

from conftest import UserFactory
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.models.user import User, UserRole
from app.services.users import (
    create_user,
    delete_user,
    get_all_users,
    get_user_by_email,
    get_user_by_id,
    update_user,
)


class TestUserService:
    """Tests for user service functions."""

    async def test_get_all_users_empty(self, db_session: AsyncSession):
        """Get all users should return empty list when no users exist."""
        result = await get_all_users(db_session)
        assert result == []

    async def test_get_all_users_with_users(
        self, db_session: AsyncSession, user_factory: UserFactory
    ):
        """Get all users should return all users."""
        await user_factory.create(email="user1@test.com")
        await user_factory.create(email="user2@test.com")
        await user_factory.create(email="user3@test.com")

        result = await get_all_users(db_session)

        assert len(result) == 3
        emails = [u.email for u in result]
        assert "user1@test.com" in emails
        assert "user2@test.com" in emails
        assert "user3@test.com" in emails

    async def test_get_user_by_id_exists(
        self, db_session: AsyncSession, admin_user: User
    ):
        """Get user by ID should return user when exists."""
        result = await get_user_by_id(db_session, admin_user.id)

        assert result is not None
        assert result.id == admin_user.id

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

    async def test_create_user_default_role(self, db_session: AsyncSession):
        """Create user should default to viewer role."""
        user = await create_user(db_session, "new@test.com", "password123")

        assert user.email == "new@test.com"
        assert user.role == UserRole.VIEWER
        assert user.id is not None

    async def test_create_user_with_admin_role(self, db_session: AsyncSession):
        """Create user should accept admin role."""
        user = await create_user(
            db_session, "admin@test.com", "password123", role=UserRole.ADMIN
        )

        assert user.role == UserRole.ADMIN

    async def test_create_user_password_hashed(self, db_session: AsyncSession):
        """Create user should hash the password."""
        password = "mypassword123"
        user = await create_user(db_session, "hash@test.com", password)

        assert user.password_hash != password
        assert verify_password(password, user.password_hash)

    async def test_update_user_email(
        self, db_session: AsyncSession, viewer_user: User
    ):
        """Update user should update email."""
        updated = await update_user(db_session, viewer_user, email="newemail@test.com")

        assert updated.email == "newemail@test.com"

    async def test_update_user_role(
        self, db_session: AsyncSession, viewer_user: User
    ):
        """Update user should update role."""
        updated = await update_user(db_session, viewer_user, role=UserRole.ADMIN)

        assert updated.role == UserRole.ADMIN

    async def test_update_user_password(
        self, db_session: AsyncSession, viewer_user: User
    ):
        """Update user should hash new password."""
        new_password = "newpassword123"
        updated = await update_user(db_session, viewer_user, password=new_password)

        assert verify_password(new_password, updated.password_hash)

    async def test_update_user_no_changes(
        self, db_session: AsyncSession, viewer_user: User
    ):
        """Update user with no changes should keep existing values."""
        original_email = viewer_user.email
        updated = await update_user(db_session, viewer_user)

        assert updated.email == original_email

    async def test_delete_user(
        self, db_session: AsyncSession, user_factory: UserFactory
    ):
        """Delete user should remove user from database."""
        user = await user_factory.create(email="todelete@test.com")
        user_id = user.id

        await delete_user(db_session, user)
        await db_session.commit()

        result = await get_user_by_id(db_session, user_id)
        assert result is None


class TestUserRouter:
    """Tests for user router endpoints."""

    async def test_list_users_as_admin(
        self,
        client: AsyncClient,
        admin_user: User,
        viewer_user: User,
        admin_headers: dict,
    ):
        """List users should return all users for admin."""
        response = await client.get("/api/users", headers=admin_headers)

        assert response.status_code == 200
        data = response.json()
        assert "users" in data
        assert len(data["users"]) >= 2

    async def test_list_users_as_viewer(
        self, client: AsyncClient, viewer_user: User, viewer_headers: dict
    ):
        """List users should return 403 for viewer."""
        response = await client.get("/api/users", headers=viewer_headers)

        assert response.status_code == 403

    async def test_list_users_unauthenticated(self, client: AsyncClient):
        """List users should return 401 when not authenticated."""
        response = await client.get("/api/users")

        assert response.status_code == 401

    async def test_create_user_as_admin(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Create user should work for admin."""
        response = await client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "email": "newuser@test.com",
                "password": "password123",
                "role": "viewer",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["email"] == "newuser@test.com"
        assert data["role"] == "viewer"

    async def test_create_user_duplicate_email(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Create user should return 400 for duplicate email."""
        response = await client.post(
            "/api/users",
            headers=admin_headers,
            json={
                "email": "admin@test.com",  # Same as admin_user
                "password": "password123",
                "role": "viewer",
            },
        )

        assert response.status_code == 400
        assert "already exists" in response.json()["detail"]

    async def test_create_user_as_viewer(
        self, client: AsyncClient, viewer_user: User, viewer_headers: dict
    ):
        """Create user should return 403 for viewer."""
        response = await client.post(
            "/api/users",
            headers=viewer_headers,
            json={
                "email": "another@test.com",
                "password": "password123",
                "role": "viewer",
            },
        )

        assert response.status_code == 403

    async def test_get_user_as_admin(
        self, client: AsyncClient, admin_user: User, viewer_user: User, admin_headers: dict
    ):
        """Get user should return user details for admin."""
        response = await client.get(
            f"/api/users/{viewer_user.id}", headers=admin_headers
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == viewer_user.email

    async def test_get_user_not_found(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Get user should return 404 for non-existent user."""
        response = await client.get("/api/users/99999", headers=admin_headers)

        assert response.status_code == 404

    async def test_update_user_as_admin(
        self, client: AsyncClient, admin_user: User, viewer_user: User, admin_headers: dict
    ):
        """Update user should work for admin."""
        response = await client.put(
            f"/api/users/{viewer_user.id}",
            headers=admin_headers,
            json={"email": "updated@test.com"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "updated@test.com"

    async def test_update_user_duplicate_email(
        self, client: AsyncClient, admin_user: User, viewer_user: User, admin_headers: dict
    ):
        """Update user should return 400 for duplicate email."""
        response = await client.put(
            f"/api/users/{viewer_user.id}",
            headers=admin_headers,
            json={"email": "admin@test.com"},  # Same as admin_user
        )

        assert response.status_code == 400

    async def test_delete_user_as_admin(
        self, client: AsyncClient, admin_user: User, viewer_user: User, admin_headers: dict
    ):
        """Delete user should work for admin."""
        response = await client.delete(
            f"/api/users/{viewer_user.id}", headers=admin_headers
        )

        assert response.status_code == 204

    async def test_delete_user_not_found(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        """Delete user should return 404 for non-existent user."""
        response = await client.delete("/api/users/99999", headers=admin_headers)

        assert response.status_code == 404
