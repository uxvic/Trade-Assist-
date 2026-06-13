#!/usr/bin/env bash
# Start the backend and frontend together. Ctrl-C stops both.
# Run from the repo root:  ./scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# Stop both child processes when this script exits (Ctrl-C included).
cleanup() {
  echo ""
  echo "Stopping…"
  kill 0 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "==> Starting backend on http://localhost:8000 …"
(
  cd backend
  # shellcheck disable=SC1091
  source .venv/bin/activate
  exec uvicorn app.main:app --reload --port 8000
) &

echo "==> Starting frontend on http://localhost:3000 …"
(
  cd frontend
  exec npm run dev
) &

echo ""
echo "👉 Open http://localhost:3000 in your browser."
echo "   (Press Ctrl-C here to stop everything.)"
echo ""

wait
