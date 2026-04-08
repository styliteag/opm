#!/usr/bin/env python3
"""Fix renamed migration revision 3c597f90f9a7 → 003 for existing databases.

This is a one-time fixup for databases that were created with the auto-generated
Alembic revision ID before it was renamed to sequential format.
Safe to run on databases that are already on 003 (no-op).
"""

import os
import sys
from urllib.parse import urlparse

try:
    import pymysql
except ImportError:
    sys.exit(0)

OLD_REV = "3c597f90f9a7"
NEW_REV = "003"


def main() -> None:
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        return

    p = urlparse(database_url)
    try:
        conn = pymysql.connect(
            host=p.hostname or "localhost",
            port=p.port or 3306,
            user=p.username or "root",
            password=p.password or "",
            database=(p.path or "").lstrip("/"),
        )
    except pymysql.Error:
        return

    try:
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM alembic_version WHERE version_num=%s", (OLD_REV,))
        if cur.fetchone():
            cur.execute(
                "UPDATE alembic_version SET version_num=%s WHERE version_num=%s",
                (NEW_REV, OLD_REV),
            )
            conn.commit()
            print(f"Fixed: renamed migration {OLD_REV} -> {NEW_REV}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
