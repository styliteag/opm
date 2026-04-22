"""2FA (TOTP) request and response schemas."""

from pydantic import BaseModel, Field


class TotpEnrollStartRequest(BaseModel):
    """Start 2FA enrollment — requires password re-authentication."""

    password: str


class TotpEnrollStartResponse(BaseModel):
    """Response to starting 2FA enrollment — returns secret + otpauth URI for QR rendering."""

    secret: str
    otpauth_uri: str


class TotpEnrollVerifyRequest(BaseModel):
    """Verify the 6-digit code to finalize 2FA enrollment."""

    password: str
    code: str = Field(min_length=6, max_length=10)


class TotpEnrollVerifyResponse(BaseModel):
    """Enrollment success — returns backup codes once (never again)."""

    backup_codes: list[str]


class TotpDisableRequest(BaseModel):
    """Disable 2FA — requires password + current TOTP code."""

    password: str
    code: str = Field(min_length=6, max_length=10)


class BackupCodesRegenerateRequest(BaseModel):
    """Regenerate backup codes — requires password + current TOTP code."""

    password: str
    code: str = Field(min_length=6, max_length=10)


class BackupCodesRegenerateResponse(BaseModel):
    """New backup codes."""

    backup_codes: list[str]


class LoginResponse(BaseModel):
    """Login response — either a full token or a 2FA challenge."""

    access_token: str | None = None
    token_type: str | None = None
    requires_2fa: bool = False
    challenge_token: str | None = None


class Verify2FARequest(BaseModel):
    """Verify 2FA step of login."""

    challenge_token: str
    code: str = Field(min_length=6, max_length=20)
