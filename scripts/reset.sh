#!/usr/bin/env bash
# Start over from scratch — erase ALL local data and relaunch the app.
#
#   ./scripts/reset.sh
#
# This deletes the local database, which holds EVERYTHING:
#   - your login (email + password)
#   - every practice account, position and order
#   - the bot's trades, events and forecasts
# The app rebuilds an empty database on the next start, so you come back as a
# brand-new user. This cannot be undone.
#
# Tip: stop the app first (click its Terminal window and press Ctrl-C) so the
# database file isn't in use. Then run this in that same window.
#
# After it restarts, open the app in a private/incognito browser window — or use
# Settings -> Sign out — to clear the login your browser remembers, so you land
# on the Sign-up screen like a new user.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="backend/data/trade_assist.db"

echo "==> Erasing all local data…"
rm -f "$DB" "$DB-wal" "$DB-shm"
echo "    Removed $DB (login, practice accounts, bot history, forecasts)."

echo ""
echo "✅ Clean slate. Starting the app fresh…"
echo "   Open http://localhost:3000 in a private window once it's ready (Ctrl-C here to stop)."
echo ""
exec ./scripts/dev.sh
