@echo off
cd /d %~dp0
findstr /B "BRIDGE_KEY=" .env
pause
