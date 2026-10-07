@echo off
setlocal
cd /d %~dp0

echo ============================================
echo GoldFlow - Install cloudflared (Winget bypass)
echo ============================================

if exist cloudflared.exe (
  echo cloudflared.exe already exists.
  cloudflared.exe --version
  pause
  exit /b 0
)

echo Downloading official 64-bit cloudflared.exe from Cloudflare GitHub...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='Stop'; $u='https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'; Invoke-WebRequest -Uri $u -OutFile 'cloudflared.exe' -UseBasicParsing"

if not exist cloudflared.exe (
  echo.
  echo ERROR: Download failed.
  echo Please check internet / antivirus and try again.
  pause
  exit /b 1
)

echo.
echo Download complete.
cloudflared.exe --version
echo.
echo NEXT for Production: Double-click RECOVER_GOLDFLOW_BRIDGE.bat
echo Quick Tunnel is development-only and does not power bridge.hazim5011.com
pause
