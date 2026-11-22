#!/usr/bin/env bash
# One-command launcher for macOS / Linux: builds the UI if needed, then serves UI + API on http://127.0.0.1:8000
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  echo "[cypher] creating virtual environment..."
  python3 -m venv .venv
  .venv/bin/pip install --upgrade pip
  .venv/bin/pip install -r requirements.txt
fi

if [ ! -f frontend/dist/index.html ]; then
  echo "[cypher] building frontend..."
  (cd frontend && npm install && npm run build)
fi

echo "[cypher] open http://127.0.0.1:8000"
exec .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
