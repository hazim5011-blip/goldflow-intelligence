@echo off
cd /d %~dp0
for /f "tokens=1,* delims==" %%A in (.env) do if /I "%%A"=="BRIDGE_KEY" set KEY=%%B
powershell -NoProfile -Command "$h=@{'X-Bridge-Key'='%KEY%'}; iwr 'http://127.0.0.1:8787/health' -Headers $h -UseBasicParsing | Select-Object -Expand Content"
pause
