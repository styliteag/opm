#!/usr/bin/env sh
set -e

# Read version from VERSION file if available, otherwise use APP_VERSION env var
if [ -f /app/VERSION ]; then
    VERSION=$(cat /app/VERSION | tr -d '\n\r ')
else
    VERSION=${APP_VERSION:-unknown}
fi

# Log version at startup
echo "Starting Open Port Monitor Backend version: ${VERSION}"

# Wait for database to be ready
echo "Waiting for database to be ready..."
uv run python /app/scripts/wait-for-db.py || exit 1

# Database schema is initialized automatically on startup via main.py lifespan
exec uv run uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --reload
