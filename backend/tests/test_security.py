"""Tests for core security functions."""

from datetime import timedelta

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    """Tests for password hashing and verification."""

    def test_hash_password_returns_hash(self):
        """Hash password should return a hash string."""
        password = "mysecretpassword"
        hashed = hash_password(password)

        assert hashed != password
        assert len(hashed) > 0
        assert "$" in hashed  # PBKDF2 hash format

    def test_hash_password_different_hashes_for_same_password(self):
        """Same password should produce different hashes (salted)."""
        password = "mysecretpassword"
        hash1 = hash_password(password)
        hash2 = hash_password(password)

        assert hash1 != hash2

    def test_verify_password_correct(self):
        """Verify password should return True for correct password."""
        password = "mysecretpassword"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        """Verify password should return False for incorrect password."""
        password = "mysecretpassword"
        wrong_password = "wrongpassword"
        hashed = hash_password(password)

        assert verify_password(wrong_password, hashed) is False

    def test_verify_password_empty_password(self):
        """Verify password should handle empty passwords."""
        password = ""
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True
        assert verify_password("notempty", hashed) is False

    def test_hash_password_unicode(self):
        """Hash password should handle unicode characters."""
        password = "pässwörd123"
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True

    def test_hash_password_long_password(self):
        """Hash password should handle long passwords."""
        password = "a" * 1000
        hashed = hash_password(password)

        assert verify_password(password, hashed) is True


class TestJWTTokens:
    """Tests for JWT token creation and decoding."""

    def test_create_access_token_basic(self):
        """Create access token should return a valid JWT string."""
        data = {"sub": "123", "email": "test@example.com"}
        token = create_access_token(data)

        assert isinstance(token, str)
        assert len(token) > 0
        assert token.count(".") == 2  # JWT format: header.payload.signature

    def test_decode_access_token_valid(self):
        """Decode access token should return payload for valid token."""
        data = {"sub": "123", "email": "test@example.com", "role": "admin"}
        token = create_access_token(data)

        payload = decode_access_token(token)

        assert payload is not None
        assert payload["sub"] == "123"
        assert payload["email"] == "test@example.com"
        assert payload["role"] == "admin"
        assert "exp" in payload

    def test_decode_access_token_invalid(self):
        """Decode access token should return None for invalid token."""
        invalid_token = "invalid.token.here"

        payload = decode_access_token(invalid_token)

        assert payload is None

    def test_decode_access_token_tampered(self):
        """Decode access token should return None for tampered token."""
        data = {"sub": "123"}
        token = create_access_token(data)

        # Tamper with the token
        parts = token.split(".")
        tampered_token = parts[0] + "." + parts[1] + "x" + "." + parts[2]

        payload = decode_access_token(tampered_token)

        assert payload is None

    def test_create_access_token_with_custom_expiry(self):
        """Create access token should respect custom expiration."""
        data = {"sub": "123"}
        expires = timedelta(hours=24)
        token = create_access_token(data, expires_delta=expires)

        payload = decode_access_token(token)

        assert payload is not None
        assert "exp" in payload

    def test_decode_access_token_expired(self):
        """Decode access token should return None for expired token."""
        data = {"sub": "123"}
        # Create a token that expired 1 hour ago
        expires = timedelta(hours=-1)
        token = create_access_token(data, expires_delta=expires)

        payload = decode_access_token(token)

        assert payload is None

    def test_create_access_token_preserves_data(self):
        """Create access token should preserve all data in payload."""
        data = {
            "sub": "456",
            "email": "user@test.com",
            "role": "viewer",
            "custom_field": "custom_value",
        }
        token = create_access_token(data)

        payload = decode_access_token(token)

        assert payload is not None
        for key, value in data.items():
            assert payload[key] == value

    def test_decode_access_token_empty_string(self):
        """Decode access token should return None for empty string."""
        payload = decode_access_token("")

        assert payload is None

    def test_decode_access_token_none_like(self):
        """Decode access token should handle malformed inputs."""
        assert decode_access_token("not.a.jwt") is None
        assert decode_access_token("...") is None
