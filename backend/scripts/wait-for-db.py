#!/usr/bin/env python3
"""Wait for database to be ready before starting the application."""

import os
import sys
import time
from urllib.parse import urlparse

try:
    import pymysql
except ImportError:
    print("ERROR: pymysql not available. Install it with: pip install pymysql", file=sys.stderr)
    sys.exit(1)


def parse_database_url(url: str) -> dict:
    """Parse database URL and extract connection parameters."""
    parsed = urlparse(url)

    # Remove the driver prefix (e.g., mysql+aiomysql:// -> mysql://)
    return {
        "host": parsed.hostname or "localhost",
        "port": parsed.port or 3306,
        "user": parsed.username or "root",
        "password": parsed.password or "",
        "database": parsed.path.lstrip("/") if parsed.path else None,
    }


def wait_for_db(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str | None = None,
    max_retries: int = 30,
    retry_delay: float = 2.0,
) -> bool:
    """Wait for database to be ready.

    Args:
        host: Database host
        port: Database port
        user: Database user
        password: Database password
        database: Database name (optional, just tests connection if not provided)
        max_retries: Maximum number of retry attempts
        retry_delay: Initial delay between retries in seconds

    Returns:
        True if database is ready, False otherwise
    """
    db_info = f"{host}:{port}"
    if database:
        db_info += f"/{database}"
    print(f"Waiting for database at {db_info}...")

    for attempt in range(1, max_retries + 1):
        try:
            # Try to connect to the database
            # If database is None, we'll connect without specifying a database
            # (this just tests server availability)
            connect_kwargs = {
                "host": host,
                "port": port,
                "user": user,
                "password": password,
                "connect_timeout": 5,
            }
            if database:
                connect_kwargs["database"] = database

            connection = pymysql.connect(**connect_kwargs)
            connection.close()
            print(f"Database is ready! (attempt {attempt}/{max_retries})")
            return True
        except pymysql.Error as e:
            if attempt < max_retries:
                delay = min(
                    retry_delay * (1.5 ** (attempt - 1)), 30.0
                )  # Exponential backoff, max 30s
                print(f"Database not ready yet (attempt {attempt}/{max_retries}): {e}")
                print(f"Retrying in {delay:.1f} seconds...")
                time.sleep(delay)
            else:
                print(
                    f"ERROR: Database failed to become ready after {max_retries} attempts",
                    file=sys.stderr,
                )
                print(f"Last error: {e}", file=sys.stderr)
                return False

    return False


def main():
    """Main entry point."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("ERROR: DATABASE_URL environment variable is not set", file=sys.stderr)
        sys.exit(1)

    # Parse database URL
    try:
        db_params = parse_database_url(database_url)
    except Exception as e:
        print(f"ERROR: Failed to parse DATABASE_URL: {e}", file=sys.stderr)
        sys.exit(1)

    # Wait for database
    if not wait_for_db(**db_params):
        sys.exit(1)

    print("Database is ready. Proceeding with application startup.")


if __name__ == "__main__":
    main()
