#!/bin/sh
set -e

# Read version from VERSION file if available, otherwise use APP_VERSION env var
if [ -f /app/VERSION ]; then
    VERSION=$(cat /app/VERSION | tr -d '\n\r ')
    echo "Read version from /app/VERSION: ${VERSION}"
else
    VERSION=${APP_VERSION:-unknown}
    echo "VERSION file not found at /app/VERSION, using APP_VERSION env var: ${VERSION}"
fi

# Log version at startup
echo "Starting Open Port Monitor Backend version: ${VERSION}"

# Wait for database to be ready
echo "Waiting for database to be ready..."
python3 /app/scripts/wait-for-db.py || exit 1

# Database schema is initialized automatically on startup via main.py lifespan
echo "Starting application..."
exec uvicorn src.app.main:app --host 0.0.0.0 --port 8000 --workers 4
