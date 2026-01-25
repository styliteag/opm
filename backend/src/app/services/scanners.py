"""Scanner management service for CRUD operations."""

import secrets

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.scanner import Scanner


def generate_api_key() -> str:
    """Generate a secure 32+ character API key."""
    # Generate 32 bytes = 64 hex characters for strong security
    return secrets.token_hex(32)


async def get_all_scanners(db: AsyncSession) -> list[Scanner]:
    """Get all scanners."""
    stmt = select(Scanner).order_by(Scanner.created_at.desc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_scanner_by_id(db: AsyncSession, scanner_id: int) -> Scanner | None:
    """Get a scanner by its ID."""
    stmt = select(Scanner).where(Scanner.id == scanner_id)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def get_scanner_by_name(db: AsyncSession, name: str) -> Scanner | None:
    """Get a scanner by its name."""
    stmt = select(Scanner).where(Scanner.name == name)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def create_scanner(
    db: AsyncSession,
    name: str,
    description: str | None = None,
) -> tuple[Scanner, str]:
    """Create a new scanner and return it with the plain API key.

    Returns:
        Tuple of (Scanner, api_key) where api_key is the plain text key (shown once)
    """
    api_key = generate_api_key()
    api_key_hash = hash_password(api_key)

    scanner = Scanner(
        name=name,
        api_key_hash=api_key_hash,
        description=description,
    )
    db.add(scanner)
    await db.flush()
    await db.refresh(scanner)
    return scanner, api_key


async def update_scanner(
    db: AsyncSession,
    scanner: Scanner,
    name: str | None = None,
    description: str | None = None,
) -> Scanner:
    """Update an existing scanner."""
    if name is not None:
        scanner.name = name
    if description is not None:
        scanner.description = description

    await db.flush()
    await db.refresh(scanner)
    return scanner


async def regenerate_api_key(db: AsyncSession, scanner: Scanner) -> tuple[Scanner, str]:
    """Regenerate the API key for a scanner.

    Returns:
        Tuple of (Scanner, api_key) where api_key is the new plain text key (shown once)
    """
    api_key = generate_api_key()
    api_key_hash = hash_password(api_key)
    scanner.api_key_hash = api_key_hash

    await db.flush()
    await db.refresh(scanner)
    return scanner, api_key


async def delete_scanner(db: AsyncSession, scanner: Scanner) -> None:
    """Delete a scanner (cascades to networks)."""
    await db.delete(scanner)
    await db.flush()


async def verify_scanner_api_key(scanner: Scanner, api_key: str) -> bool:
    """Verify an API key against a scanner's stored hash."""
    return verify_password(api_key, scanner.api_key_hash)
