@echo off
setlocal
cd /d %~dp0

set CF=
if exist cloudflared.exe set CF=%cd%\cloudflared.exe
if "%CF%"=="" (
  where cloudflared >nul 2>nul
  if %errorlevel%==0 set CF=cloudflared
)

if "%CF%"=="" (
  echo cloudflared not found.
  echo Run INSTALL_CLOUDFLARED.bat first.
  pause
  exit /b 1
)

echo Starting GoldFlow Quick Tunnel...
echo Keep this window OPEN.
echo Copy the https://xxxxx.trycloudflare.com URL after it appears.
echo.
"%CF%" tunnel --url http://127.0.0.1:8787
pause
