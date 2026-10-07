@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo GoldFlow Vantage Bridge - Auto Update v3.0.1
echo ==========================================
echo.

echo [1/5] Downloading latest bridge from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/mt5_bridge.py' -OutFile 'mt5_bridge.py.new' -UseBasicParsing"
if not exist mt5_bridge.py.new (
  echo ERROR: Download failed.
  pause
  exit /b 1
)
move /Y mt5_bridge.py.new mt5_bridge.py >nul

echo [2/5] Updating requirements and Production recovery tools...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/requirements.txt' -OutFile 'requirements.txt' -UseBasicParsing; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/RECOVER_GOLDFLOW_BRIDGE.bat' -OutFile 'RECOVER_GOLDFLOW_BRIDGE.bat' -UseBasicParsing; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/START_NAMED_TUNNEL.bat' -OutFile 'START_NAMED_TUNNEL.bat' -UseBasicParsing; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/START_TUNNEL_HTTP2.bat' -OutFile 'START_TUNNEL_HTTP2.bat' -UseBasicParsing"

echo [3/5] Checking Python environment...
set "VENVOK=0"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -c "import sys,MetaTrader5,fastapi,uvicorn,dotenv;print(sys.executable)" >nul 2>nul
  if not errorlevel 1 set "VENVOK=1"
)

if "%VENVOK%"=="0" (
  echo Existing .venv is missing or broken.
  echo Rebuilding Python environment...
  call "%~dp0FIX_BRIDGE_PYTHON_ENV.bat"
  exit /b
)

echo [4/5] Stopping old bridge on port 8787...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue; if($c){$c | ForEach-Object {Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue}}"
timeout /t 2 /nobreak >nul

echo [5/5] Starting updated bridge...
start "GoldFlow Vantage MT5 Bridge v3.0.1" cmd /k ""%cd%\.venv\Scripts\python.exe" "%cd%\mt5_bridge.py""

echo.
echo Update launched. Keep the new bridge window open.
echo Next: run RECOVER_GOLDFLOW_BRIDGE.bat to verify local MT5 + Production named tunnel.
pause
