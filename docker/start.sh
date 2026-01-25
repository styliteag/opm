#!/bin/bash
set -e

# Function to handle shutdown
shutdown() {
    echo "Shutting down..."
    kill $BACKEND_PID 2>/dev/null || true
    nginx -s quit
    exit 0
}

trap shutdown SIGTERM SIGINT

# Read version from VERSION file if available, otherwise use APP_VERSION env var
if [ -f /app/VERSION ]; then
    VERSION=$(cat /app/VERSION | tr -d '\n\r ')
    echo "Read version from /app/VERSION: ${VERSION}"
else
    VERSION=${APP_VERSION:-unknown}
    echo "VERSION file not found at /app/VERSION, using APP_VERSION env var: ${VERSION}"
fi

# Log version at startup
echo "Starting Open Port Monitor version: ${VERSION}"

# Inject frontend version into index.html at runtime
if [ -f /usr/share/nginx/html/index.html ]; then
    # Inject inline script with version into index.html before </head> or first <script>
    VERSION_SCRIPT="<script>window.__APP_VERSION__=\"${VERSION}\";</script>"
    if ! grep -q '__APP_VERSION__' /usr/share/nginx/html/index.html; then
        # Try to inject before </head> tag
        if grep -q '</head>' /usr/share/nginx/html/index.html; then
            sed -i "s|</head>|${VERSION_SCRIPT}\n</head>|" /usr/share/nginx/html/index.html || true
        # Otherwise inject before first <script> tag
        elif grep -q '<script' /usr/share/nginx/html/index.html; then
            sed -i "s|<script|${VERSION_SCRIPT}\n<script|" /usr/share/nginx/html/index.html || true
        fi
    fi
fi

# Wait for database to be ready before starting backend
echo "Waiting for database to be ready..."
python3 /app/scripts/wait-for-db.py || exit 1

# Start backend in background
echo "Starting backend..."
/app/start.sh &
BACKEND_PID=$!

# Wait for backend to be ready
echo "Waiting for backend to be ready..."
for i in $(seq 1 30); do
    if wget -q -O - http://127.0.0.1:8000/health >/dev/null 2>&1; then
        echo "Backend is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "Backend failed to start"
        exit 1
    fi
    sleep 1
done

# Start nginx in foreground
echo "Starting nginx..."
exec nginx -g "daemon off;"
