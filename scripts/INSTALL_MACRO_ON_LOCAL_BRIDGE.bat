@echo off
setlocal
cd /d "%~dp0.."
echo GoldFlow local MT5 Bridge macro update.
echo This will NOT automatically stop MT5 or the Cloudflare named tunnel.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0INSTALL_MACRO_ON_LOCAL_BRIDGE.ps1"
set "rc=%ERRORLEVEL%"
if not "%rc%"=="0" (
 echo Local Bridge update was NOT completed. Fix the message above before restarting.
) else (
 echo Files copied. Restart your EXISTING MT5 Bridge process when safe, then run DEPLOY_CLOUDFLARE_TEST.bat again.
)
pause
exit /b %rc%
