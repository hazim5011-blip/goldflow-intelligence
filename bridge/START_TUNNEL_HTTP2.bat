@echo off
setlocal
cd /d "%~dp0"
echo GoldFlow Production uses the permanent named tunnel:
echo https://bridge.hazim5011.com
echo.
echo This launcher now delegates to START_NAMED_TUNNEL.bat.
call "%~dp0START_NAMED_TUNNEL.bat"
exit /b %errorlevel%
