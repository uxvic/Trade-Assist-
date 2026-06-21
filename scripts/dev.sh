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

# Free a port held by a leftover process from a previous run. Without this the
# backend dies on startup with "[Errno 48] Address already in use", the page
# still loads against the dead :8000, and sign-up fails with "Internal Server
# Error". Happens when a past run wasn't fully stopped, or dev/refresh/reset was
# launched from a second terminal. Best-effort; lsof ships with macOS.
free_port() {
  local port="$1" pids
  pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  [ -z "$pids" ] && return 0
  echo "==> Port ${port} is in use by a previous run — freeing it…"
  # shellcheck disable=SC2086
  kill $pids 2>/dev/null || true
  sleep 1
  pids="$(lsof -ti "tcp:${port}" 2>/dev/null || true)"
  # shellcheck disable=SC2086
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
}

free_port 8000
free_port 3000

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
