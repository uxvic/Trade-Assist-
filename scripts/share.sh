#!/usr/bin/env bash
# Share your local Trade-Assist with testers via a temporary public URL.
#
# Boots the backend + frontend (like dev.sh), then opens a FREE Cloudflare
# quick-tunnel to localhost:3000 and prints an https://….trycloudflare.com URL
# you can paste to friends. The link is live only while this runs and changes
# each time. Each tester signs up for their own practice account.
#
# Requires cloudflared (one-time install):
#   macOS:   brew install cloudflared
#   Windows: winget install --id Cloudflare.cloudflared
#   Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "❌ cloudflared not found. Install it, then re-run ./scripts/share.sh:"
  echo "   macOS:   brew install cloudflared"
  echo "   Windows: winget install --id Cloudflare.cloudflared"
  echo "   Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

# Reminder: signing tokens with the default secret is unsafe for a shared link.
if ! grep -qs '^AUTH_SECRET=' backend/.env 2>/dev/null; then
  echo "⚠️  Tip: set a real AUTH_SECRET in backend/.env before sharing widely:"
  echo "     python -c \"import secrets; print('AUTH_SECRET=' + secrets.token_hex(32))\" >> backend/.env"
  echo ""
fi

cleanup() { echo ""; echo "Stopping…"; kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "==> Starting backend on http://localhost:8000 …"
(
  cd backend
  # shellcheck disable=SC1091
  source .venv/bin/activate
  exec uvicorn app.main:app --port 8000
) &

echo "==> Starting frontend on http://localhost:3000 …"
(
  cd frontend
  exec npm run dev
) &

# Give both a moment to come up before exposing them.
sleep 5

echo ""
echo "==> Opening a public tunnel to localhost:3000 …"
echo "    Share the https://….trycloudflare.com link below with your testers."
echo "    (Live only while this is running. Press Ctrl-C to stop everything.)"
echo ""
exec cloudflared tunnel --url http://localhost:3000
