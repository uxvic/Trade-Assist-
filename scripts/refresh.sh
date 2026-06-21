#!/usr/bin/env bash
# See my latest work in one command: get the newest changes, then restart the app.
#
#   ./scripts/refresh.sh                # update the branch you're already on
#   ./scripts/refresh.sh <branch-name>  # switch to that branch first, then update
#
# Tip: stop the app first (click its Terminal window and press Ctrl-C) before
# running this, so the ports (8000 / 3000) are free.
set -euo pipefail
cd "$(dirname "$0")/.."

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "==> Fetching the latest from GitHub…"
git fetch origin

echo "==> Switching to branch: $BRANCH"
git checkout "$BRANCH"

echo "==> Pulling the newest changes…"
git pull --ff-only origin "$BRANCH"

echo ""
echo "✅ Up to date. Starting the app…"
echo "   Open http://localhost:3000 once it's ready (Ctrl-C here to stop)."
echo ""
exec ./scripts/dev.sh
