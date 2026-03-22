#!/usr/bin/env bash
# tools/sync-from-nmap.sh
# Syncs NSE scripts from upstream nmap/nmap repository.
set -euo pipefail

# Default output: nse-templates/scripts (sibling of tools/), regardless of cwd
_sync_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

UPSTREAM_REPO="${UPSTREAM_REPO:-https://github.com/nmap/nmap.git}"
UPSTREAM_REF="${UPSTREAM_REF:-master}"
SCRIPTS_DIR="${SCRIPTS_DIR:-$_sync_root/scripts}"

# Create temporary directory and cleanup on exit
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "[sync] Syncing NSE scripts from ${UPSTREAM_REPO} (ref: ${UPSTREAM_REF})"

# Sparse checkout: only fetch /scripts directory
echo "[sync] Performing sparse checkout of /scripts directory..."
git clone --depth=1 --filter=blob:none --sparse "$UPSTREAM_REPO" "$work" 2>&1 | grep -v "^Cloning" || true
git -C "$work" sparse-checkout set scripts 2>&1 || true

mkdir -p "$SCRIPTS_DIR"

# Track changes
new_count=0
updated_count=0
total_count=0

# Copy all .nse files from upstream
for f in "$work"/scripts/*.nse; do
  [ -f "$f" ] || continue
  base="$(basename "$f")"
  total_count=$((total_count + 1))

  if [ -f "$SCRIPTS_DIR/$base" ]; then
    if ! cmp -s "$f" "$SCRIPTS_DIR/$base" 2>/dev/null; then
      cp "$f" "$SCRIPTS_DIR/$base"
      echo "  [updated] $SCRIPTS_DIR/$base"
      updated_count=$((updated_count + 1))
    fi
  else
    cp "$f" "$SCRIPTS_DIR/$base"
    echo "  [new] $SCRIPTS_DIR/$base"
    new_count=$((new_count + 1))
  fi
done

echo "[sync] Complete: ${total_count} scripts total, ${new_count} new, ${updated_count} updated"
