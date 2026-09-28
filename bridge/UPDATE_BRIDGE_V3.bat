@echo off
setlocal
cd /d "%~dp0"
echo ==========================================
echo GoldFlow Vantage Bridge - Auto Update v3
echo ==========================================
echo.
echo [1/4] Downloading latest bridge from GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/mt5_bridge.py' -OutFile 'mt5_bridge.py.new' -UseBasicParsing"
if not exist mt5_bridge.py.new (
  echo ERROR: Download failed.
  pause
  exit /b 1
)
move /Y mt5_bridge.py.new mt5_bridge.py >nul

echo [2/4] Updating requirements...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest 'https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/bridge/requirements.txt' -OutFile 'requirements.txt' -UseBasicParsing"

echo [3/4] Stopping old bridge on port 8787...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue; if($c){$c | ForEach-Object {Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue}}"
timeout /t 2 /nobreak >nul

echo [4/4] Starting updated bridge...
if exist .venv\Scripts\python.exe (
  start "GoldFlow Vantage MT5 Bridge v3" cmd /k ".venv\Scripts\python.exe mt5_bridge.py"
) else (
  start "GoldFlow Vantage MT5 Bridge v3" cmd /k "py mt5_bridge.py"
)
echo.
echo Update launched. Keep the new bridge window open.
echo Existing Cloudflare tunnel can stay open and should reconnect automatically.
pause
