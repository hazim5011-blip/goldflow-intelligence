@echo off
where cloudflared >nul 2>nul
if not %errorlevel%==0 (
  echo Run INSTALL_CLOUDFLARED.bat first.
  pause
  exit /b 1
)
cloudflared tunnel --url http://127.0.0.1:8787
pause
