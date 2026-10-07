@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"

set "PUBLIC_HOST=bridge.hazim5011.com"
set "CF=%cd%\cloudflared.exe"
if not exist "%CF%" (
  where cloudflared >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] cloudflared not found. Run INSTALL_CLOUDFLARED.bat first.
    if /I not "%~1"=="/AUTO" pause
    exit /b 1
  )
  set "CF=cloudflared"
)

set "CLOUDFLARE_TUNNEL_TOKEN="
set "CLOUDFLARE_TUNNEL_NAME="
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="CLOUDFLARE_TUNNEL_TOKEN" set "CLOUDFLARE_TUNNEL_TOKEN=%%B"
    if /I "%%A"=="CLOUDFLARE_TUNNEL_NAME" set "CLOUDFLARE_TUNNEL_NAME=%%B"
  )
)

echo ===============================================
echo GoldFlow Production Named Tunnel
echo Host: %PUBLIC_HOST%
echo ===============================================
echo.

sc query cloudflared >nul 2>nul
if not errorlevel 1 (
  for /f "tokens=3" %%S in ('sc query cloudflared ^| findstr /I "STATE"') do set "SVCSTATE=%%S"
  if /I "!SVCSTATE!"=="RUNNING" (
    echo [OK] Windows cloudflared service is already RUNNING.
    exit /b 0
  )
  echo [INFO] cloudflared service exists but is not running. Starting it...
  sc start cloudflared >nul 2>nul
  timeout /t 3 /nobreak >nul
  sc query cloudflared | findstr /I "RUNNING" >nul
  if not errorlevel 1 (
    echo [OK] cloudflared service started.
    exit /b 0
  )
  echo [WARN] Existing cloudflared service did not start.
)

if defined CLOUDFLARE_TUNNEL_TOKEN (
  echo [INFO] Starting remotely-managed named tunnel using the local token.
  set "TUNNEL_TOKEN=!CLOUDFLARE_TUNNEL_TOKEN!"
  start "GoldFlow Named Tunnel" cmd /k ""%CF%" tunnel --protocol http2 --loglevel info run"
  timeout /t 4 /nobreak >nul
  echo [OK] Named tunnel process launched.
  exit /b 0
)

if exist "%USERPROFILE%\.cloudflared\config.yml" (
  echo [INFO] Starting locally-managed named tunnel from %%USERPROFILE%%\.cloudflared\config.yml
  start "GoldFlow Named Tunnel" cmd /k ""%CF%" --config "%USERPROFILE%\.cloudflared\config.yml" tunnel --protocol http2 run"
  timeout /t 4 /nobreak >nul
  echo [OK] Named tunnel process launched from config.yml.
  exit /b 0
)

echo [ERROR] No Production named-tunnel service, token, or config.yml was found.
echo Quick Tunnel files do NOT power https://%PUBLIC_HOST%.
echo Configure the existing Cloudflare named tunnel first, then rerun this file.
if /I not "%~1"=="/AUTO" pause
exit /b 2
