#!/usr/bin/env bash
# Starts the CYPHER Telegram bot. Start the main app first (./run.sh) in another terminal.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "[cypher] No .env file found. Copy .env.example to .env and paste your TELEGRAM_BOT_TOKEN."; exit 1; }
exec .venv/bin/python -m bot.telegram_bot
