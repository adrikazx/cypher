@echo off
REM Starts the CYPHER Telegram bot. Start the main app first (run.bat) in another window.
cd /d "%~dp0"
if not exist ".env" (
  echo [cypher] No .env file found. Copy .env.example to .env and paste your TELEGRAM_BOT_TOKEN.
  exit /b 1
)
".venv\Scripts\python.exe" -m bot.telegram_bot
