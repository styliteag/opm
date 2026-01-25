"""Scanner authentication service for API key validation."""

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerAuthResponse

# Scanner JWT expires in 15 minutes
SCANNER_TOKEN_EXPIRATION_MINUTES = 15


async def get_all_scanners(db: AsyncSession) -> list[Scanner]:
    """Get all scanners to check API key against."""
    result = await db.execute(select(Scanner))
    return list(result.scalars().all())


async def authenticate_scanner(
    db: AsyncSession, api_key: str, scanner_version: str | None = None
) -> tuple[Scanner, ScannerAuthResponse] | None:
    """
    Authenticate a scanner by API key.

    Returns the authenticated Scanner and a short-lived JWT token, or None if invalid.
    """
    # Get all scanners and check API key against each one
    # (API key is hashed, so we need to verify against each scanner)
    scanners = await get_all_scanners(db)

    for scanner in scanners:
        if verify_password(api_key, scanner.api_key_hash):
            # Update last_seen_at timestamp and scanner_version
            scanner.last_seen_at = datetime.now(timezone.utc)
            if scanner_version is not None:
                scanner.scanner_version = scanner_version

            # Create scanner-scoped JWT token
            token_data = {
                "sub": str(scanner.id),
                "scope": "scanner",
                "scanner_name": scanner.name,
            }
            access_token = create_access_token(
                data=token_data,
                expires_delta=timedelta(minutes=SCANNER_TOKEN_EXPIRATION_MINUTES),
            )

            response = ScannerAuthResponse(
                access_token=access_token,
                token_type="bearer",
                expires_in=SCANNER_TOKEN_EXPIRATION_MINUTES * 60,  # in seconds
                scanner_id=scanner.id,
                scanner_name=scanner.name,
            )

            return (scanner, response)

    return None
