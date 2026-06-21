#!/usr/bin/env bash
# Start the backend and frontend together. Ctrl-C stops both.
# Run from the repo root:  ./scripts/dev.sh
set -euo pipefail
cd "$(dirname "$0")/.."

# The backend needs its Python env. Without it the backend would die on startup
# while the frontend keeps running — so the page loads but every request 500s
# ("Internal Server Error" on the sign-up screen). Fail loudly with the fix.
if [ ! -f backend/.venv/bin/activate ]; then
  echo "❌ Backend isn't set up yet (missing backend/.venv)."
  echo "   Run ./scripts/setup.sh once, then ./scripts/dev.sh again."
  exit 1
fi

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

# Warn loudly if the backend never answers — otherwise the UI loads but sign-up
# and every other call fail with a baffling "Internal Server Error". Best-effort:
# uses curl (ships with macOS) and never blocks startup.
(
  for _ in $(seq 1 20); do
    sleep 1
    if curl -fsS http://localhost:8000/health >/dev/null 2>&1; then
      echo "✅ Backend is up on http://localhost:8000"
      exit 0
    fi
  done
  echo ""
  echo "⚠️  Backend hasn't answered on http://localhost:8000 after 20s."
  echo "    Scroll up for its error. The app will load, but sign-up/login will"
  echo "    keep failing until the backend is running."
) &

echo ""
echo "👉 Open http://localhost:3000 in your browser."
echo "   (Press Ctrl-C here to stop everything.)"
echo ""

wait
