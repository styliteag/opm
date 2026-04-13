"""Scanner authentication service for API key validation."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, verify_password
from app.models.scanner import Scanner
from app.schemas.scanner import ScannerAuthResponse, ScannerKind
from app.services.scanners import get_scanner_by_api_key_id, split_api_key

logger = logging.getLogger(__name__)

# Scanner JWT expires in 15 minutes
SCANNER_TOKEN_EXPIRATION_MINUTES = 15


async def get_all_scanners(db: AsyncSession) -> list[Scanner]:
    """Get all scanners to check API key against."""
    result = await db.execute(select(Scanner))
    return list(result.scalars().all())


async def authenticate_scanner(
    db: AsyncSession,
    api_key: str,
    scanner_version: str | None = None,
    scanner_kind: ScannerKind | None = None,
) -> tuple[Scanner, ScannerAuthResponse] | None:
    """
    Authenticate a scanner by API key.

    Returns the authenticated Scanner and a short-lived JWT token, or None if invalid.
    """
    api_key_id, api_key_secret = split_api_key(api_key)
    scanner: Scanner | None = None

    if api_key_id is not None:
        scanner = await get_scanner_by_api_key_id(db, api_key_id)
        if scanner is None:
            return None
        if not verify_password(api_key_secret, scanner.api_key_hash):
            return None
    else:
        # Legacy fallback for old scanners created before api_key_id existed.
        # Keep temporarily to avoid breaking deployed agents; regenerated keys
        # are indexed and avoid the full-table scan path.
        scanners = await get_all_scanners(db)
        for candidate in scanners:
            if verify_password(api_key_secret, candidate.api_key_hash):
                scanner = candidate
                logger.warning(
                    "Scanner %s authenticated with a legacy API key format; rotate this key",
                    candidate.id,
                )
                break
        if scanner is None:
            return None

    # Update last_seen_at timestamp and scanner_version
    scanner.last_seen_at = datetime.now(timezone.utc)
    if scanner_version is not None:
        scanner.scanner_version = scanner_version
    # Accept the scanner's self-reported kind as authoritative — the
    # running image knows whether it has masscan or gvmd. Log any
    # drift from the admin-configured value for visibility.
    if scanner_kind is not None and scanner.kind != scanner_kind:
        logger.info(
            "Scanner %s reported kind=%s (was %s); updating",
            scanner.id,
            scanner_kind,
            scanner.kind,
        )
        scanner.kind = scanner_kind

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
