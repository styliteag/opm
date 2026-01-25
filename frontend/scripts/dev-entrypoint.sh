#!/bin/sh
set -e

# Read version from mounted VERSION file and export as VITE_APP_VERSION
if [ -f /app/VERSION ]; then
  export VITE_APP_VERSION=$(cat /app/VERSION | tr -d '\n\r ')
  echo "Frontend version: $VITE_APP_VERSION"
else
  export VITE_APP_VERSION="unknown"
  echo "Warning: VERSION file not found, using 'unknown'"
fi

# Start Vite dev server
exec bun run dev -- --host 0.0.0.0
