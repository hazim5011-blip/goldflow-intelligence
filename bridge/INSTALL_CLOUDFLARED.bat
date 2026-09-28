@echo off
where cloudflared >nul 2>nul
if %errorlevel%==0 (
  cloudflared --version
  pause
  exit /b 0
)
winget install --id Cloudflare.cloudflared --accept-package-agreements --accept-source-agreements
pause
