"""Tests for 2FA enrollment, login, and management."""

import pyotp
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.services import two_factor


@pytest.fixture
async def user_with_2fa(db_session: AsyncSession) -> tuple[User, str]:
    """User with 2FA already activated. Returns (user, secret)."""
    secret = pyotp.random_base32()
    user = User(
        email="2fauser@test.com",
        password_hash=hash_password("mypassword"),
        role=UserRole.OPERATOR,
        totp_secret=secret,
        totp_enabled=True,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user, secret


class TestLoginFlow:
    async def test_login_without_2fa_returns_token(
        self, client: AsyncClient, admin_user: User
    ):
        res = await client.post(
            "/api/auth/login",
            json={"email": admin_user.email, "password": "adminpass123"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["access_token"] is not None
        assert data["requires_2fa"] is False

    async def test_login_with_2fa_returns_challenge(
        self, client: AsyncClient, user_with_2fa
    ):
        user, _ = user_with_2fa
        res = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["requires_2fa"] is True
        assert data["challenge_token"] is not None
        assert data.get("access_token") is None

    async def test_verify_2fa_success(self, client: AsyncClient, user_with_2fa):
        user, secret = user_with_2fa
        login_res = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        challenge = login_res.json()["challenge_token"]
        code = pyotp.TOTP(secret).now()
        res = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": challenge, "code": code},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["access_token"] is not None

    async def test_verify_2fa_wrong_code(self, client: AsyncClient, user_with_2fa):
        user, _ = user_with_2fa
        login_res = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        challenge = login_res.json()["challenge_token"]
        res = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": challenge, "code": "000000"},
        )
        assert res.status_code == 401

    async def test_verify_2fa_invalid_challenge(self, client: AsyncClient):
        res = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": "not-a-jwt", "code": "123456"},
        )
        assert res.status_code == 401

    async def test_verify_2fa_rate_limit(self, client: AsyncClient, user_with_2fa):
        user, _ = user_with_2fa
        login_res = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        challenge = login_res.json()["challenge_token"]
        for _ in range(5):
            await client.post(
                "/api/auth/login/verify-2fa",
                json={"challenge_token": challenge, "code": "000000"},
            )
        res = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": challenge, "code": "000000"},
        )
        assert res.status_code == 429


class TestEnrollFlow:
    async def test_enroll_start_returns_secret_and_uri(
        self, client: AsyncClient, admin_user: User, admin_headers: dict
    ):
        res = await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "adminpass123"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["secret"]
        assert data["otpauth_uri"].startswith("otpauth://totp/")

    async def test_enroll_start_requires_correct_password(
        self, client: AsyncClient, admin_headers: dict
    ):
        res = await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "wrong"},
        )
        assert res.status_code == 401

    async def test_enroll_verify_activates_2fa_and_returns_backup_codes(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
        db_session: AsyncSession,
    ):
        start_res = await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "adminpass123"},
        )
        secret = start_res.json()["secret"]
        code = pyotp.TOTP(secret).now()

        verify_res = await client.post(
            "/api/auth/2fa/enroll/verify",
            headers=admin_headers,
            json={"password": "adminpass123", "code": code},
        )
        assert verify_res.status_code == 200
        codes = verify_res.json()["backup_codes"]
        assert len(codes) == 10

        await db_session.refresh(admin_user)
        assert admin_user.totp_enabled is True
        assert admin_user.totp_secret == secret
        assert admin_user.totp_secret_pending is None

    async def test_enroll_verify_keeps_current_session_alive(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
    ):
        """Enrolling 2FA must NOT invalidate the current session — otherwise
        the user is kicked to /login before they can save the backup codes."""
        start_res = await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "adminpass123"},
        )
        secret = start_res.json()["secret"]
        code = pyotp.TOTP(secret).now()
        await client.post(
            "/api/auth/2fa/enroll/verify",
            headers=admin_headers,
            json={"password": "adminpass123", "code": code},
        )

        # Same token must still authenticate /me
        me_res = await client.get("/api/auth/me", headers=admin_headers)
        assert me_res.status_code == 200
        assert me_res.json()["totp_enabled"] is True

    async def test_enroll_verify_wrong_code_fails(
        self, client: AsyncClient, admin_headers: dict
    ):
        await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "adminpass123"},
        )
        res = await client.post(
            "/api/auth/2fa/enroll/verify",
            headers=admin_headers,
            json={"password": "adminpass123", "code": "000000"},
        )
        assert res.status_code == 400

    async def test_enroll_cannot_reactivate_if_already_enabled(
        self, client: AsyncClient, user_with_2fa, db_session: AsyncSession
    ):
        user, _ = user_with_2fa
        from app.core.security import create_access_token

        token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role.value,
                "tv": user.token_version,
            }
        )
        res = await client.post(
            "/api/auth/2fa/enroll/start",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": "mypassword"},
        )
        assert res.status_code == 400


class TestBackupCodes:
    async def test_backup_code_allows_login(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
    ):
        start = await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "adminpass123"},
        )
        secret = start.json()["secret"]
        verify = await client.post(
            "/api/auth/2fa/enroll/verify",
            headers=admin_headers,
            json={"password": "adminpass123", "code": pyotp.TOTP(secret).now()},
        )
        codes = verify.json()["backup_codes"]

        login_res = await client.post(
            "/api/auth/login",
            json={"email": admin_user.email, "password": "adminpass123"},
        )
        challenge = login_res.json()["challenge_token"]
        res = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": challenge, "code": codes[0]},
        )
        assert res.status_code == 200

    async def test_backup_code_single_use(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
    ):
        start = await client.post(
            "/api/auth/2fa/enroll/start",
            headers=admin_headers,
            json={"password": "adminpass123"},
        )
        secret = start.json()["secret"]
        verify = await client.post(
            "/api/auth/2fa/enroll/verify",
            headers=admin_headers,
            json={"password": "adminpass123", "code": pyotp.TOTP(secret).now()},
        )
        codes = verify.json()["backup_codes"]

        # First use succeeds
        login1 = await client.post(
            "/api/auth/login",
            json={"email": admin_user.email, "password": "adminpass123"},
        )
        r1 = await client.post(
            "/api/auth/login/verify-2fa",
            json={
                "challenge_token": login1.json()["challenge_token"],
                "code": codes[0],
            },
        )
        assert r1.status_code == 200

        # Same backup code cannot be used again
        two_factor._verify_rate_store.clear()
        login2 = await client.post(
            "/api/auth/login",
            json={"email": admin_user.email, "password": "adminpass123"},
        )
        r2 = await client.post(
            "/api/auth/login/verify-2fa",
            json={
                "challenge_token": login2.json()["challenge_token"],
                "code": codes[0],
            },
        )
        assert r2.status_code == 401


class TestDisableAndAdminReset:
    async def test_disable_2fa_requires_password_and_code(
        self,
        client: AsyncClient,
        user_with_2fa,
    ):
        from app.core.security import create_access_token

        user, secret = user_with_2fa
        token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role.value,
                "tv": user.token_version,
            }
        )
        headers = {"Authorization": f"Bearer {token}"}

        # Wrong password
        res = await client.post(
            "/api/auth/2fa/disable",
            headers=headers,
            json={"password": "wrong", "code": pyotp.TOTP(secret).now()},
        )
        assert res.status_code == 401

        # Correct
        res = await client.post(
            "/api/auth/2fa/disable",
            headers=headers,
            json={"password": "mypassword", "code": pyotp.TOTP(secret).now()},
        )
        assert res.status_code == 204

    async def test_admin_reset_2fa(
        self,
        client: AsyncClient,
        admin_headers: dict,
        user_with_2fa,
        db_session: AsyncSession,
    ):
        user, _ = user_with_2fa
        res = await client.delete(
            f"/api/users/{user.id}/2fa", headers=admin_headers
        )
        assert res.status_code == 204

        await db_session.refresh(user)
        assert user.totp_enabled is False
        assert user.totp_secret is None


class TestSecurityHardening:
    async def test_challenge_token_cannot_authenticate_as_user(
        self, client: AsyncClient, user_with_2fa
    ):
        """A 2FA challenge JWT must NOT pass `get_current_user` — otherwise
        password-only login bypasses the 2FA step entirely."""
        user, _ = user_with_2fa
        login = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        challenge = login.json()["challenge_token"]
        res = await client.get(
            "/api/auth/me", headers={"Authorization": f"Bearer {challenge}"}
        )
        assert res.status_code == 401

    async def test_challenge_token_single_use(
        self, client: AsyncClient, user_with_2fa
    ):
        """After a successful /verify-2fa the same challenge_token must fail."""
        user, secret = user_with_2fa
        login = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        challenge = login.json()["challenge_token"]

        first = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        assert first.status_code == 200

        second = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": challenge, "code": pyotp.TOTP(secret).now()},
        )
        assert second.status_code == 401

    async def test_totp_code_replay_blocked(
        self, client: AsyncClient, user_with_2fa
    ):
        """Same TOTP code cannot be re-used within its ±90s window."""
        user, secret = user_with_2fa
        code = pyotp.TOTP(secret).now()

        login1 = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        r1 = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": login1.json()["challenge_token"], "code": code},
        )
        assert r1.status_code == 200

        login2 = await client.post(
            "/api/auth/login",
            json={"email": user.email, "password": "mypassword"},
        )
        r2 = await client.post(
            "/api/auth/login/verify-2fa",
            json={"challenge_token": login2.json()["challenge_token"], "code": code},
        )
        assert r2.status_code == 401

    async def test_admin_cannot_reset_own_2fa(
        self,
        client: AsyncClient,
        admin_user: User,
        admin_headers: dict,
    ):
        res = await client.delete(
            f"/api/users/{admin_user.id}/2fa", headers=admin_headers
        )
        assert res.status_code == 400


class TestMeResponseShape:
    async def test_me_exposes_totp_status(
        self,
        client: AsyncClient,
        admin_headers: dict,
    ):
        res = await client.get("/api/auth/me", headers=admin_headers)
        assert res.status_code == 200
        data = res.json()
        assert "totp_enabled" in data
        assert "backup_codes_remaining" in data
        assert data["totp_enabled"] is False
        assert data["backup_codes_remaining"] == 0
