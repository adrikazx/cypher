@echo off
REM One-command launcher for Windows: builds the UI if needed, then serves UI + API on http://127.0.0.1:8000
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo [cypher] creating virtual environment...
  python -m venv .venv || goto :error
  ".venv\Scripts\python.exe" -m pip install --upgrade pip
  ".venv\Scripts\pip.exe" install -r requirements.txt || goto :error
)

if not exist "frontend\dist\index.html" (
  echo [cypher] building frontend...
  pushd frontend
  call npm install || goto :error
  call npm run build || goto :error
  popd
)

echo [cypher] open http://127.0.0.1:8000
".venv\Scripts\python.exe" -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
goto :eof

:error
echo [cypher] setup failed - see the messages above.
exit /b 1
