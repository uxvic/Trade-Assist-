#!/usr/bin/env bash
# One-time setup: backend Python env + frontend Node deps.
# Run from the repo root:  ./scripts/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Setting up the backend (Python)…"
cd backend
uv venv --python 3.12
# shellcheck disable=SC1091
source .venv/bin/activate
uv pip install -e ".[dev]"
cd ..

echo "==> Setting up the frontend (Node)…"
cd frontend
npm install
cd ..

echo ""
echo "✅ Setup complete. Now run:  ./scripts/dev.sh"
echo "   Then open:  http://localhost:3000"
