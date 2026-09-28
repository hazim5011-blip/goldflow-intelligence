@echo off
setlocal
cd /d "%~dp0"
set "CF=%cd%\cloudflared.exe"
if not exist "%CF%" (
  where cloudflared >nul 2>nul
  if %errorlevel%==0 (set "CF=cloudflared") else (echo cloudflared not found.&pause&exit /b 1)
)
"%CF%" tunnel --protocol http2 --url http://127.0.0.1:8787
pause
