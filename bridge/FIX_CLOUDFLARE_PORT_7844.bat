@echo off
setlocal
cd /d "%~dp0"
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set "CF=%cd%\cloudflared.exe"
if not exist "%CF%" (
  where cloudflared >nul 2>nul
  if %errorlevel%==0 (set "CF=cloudflared") else (echo cloudflared.exe not found.&pause&exit /b 1)
)
netsh advfirewall firewall delete rule name="GoldFlow Cloudflared TCP 7844" >nul 2>&1
netsh advfirewall firewall delete rule name="GoldFlow Cloudflared UDP 7844" >nul 2>&1
netsh advfirewall firewall delete rule name="GoldFlow Cloudflared Program" >nul 2>&1
netsh advfirewall firewall add rule name="GoldFlow Cloudflared TCP 7844" dir=out action=allow protocol=TCP remoteport=7844 profile=any >nul
netsh advfirewall firewall add rule name="GoldFlow Cloudflared UDP 7844" dir=out action=allow protocol=UDP remoteport=7844 profile=any >nul
if exist "%cd%\cloudflared.exe" netsh advfirewall firewall add rule name="GoldFlow Cloudflared Program" dir=out action=allow program="%cd%\cloudflared.exe" enable=yes profile=any >nul
powershell -NoProfile -Command "$r=Test-NetConnection region1.v2.argotunnel.com -Port 7844 -WarningAction SilentlyContinue; Write-Host ('REGION1 TCP 7844 = ' + $r.TcpTestSucceeded)"
powershell -NoProfile -Command "$r=Test-NetConnection region2.v2.argotunnel.com -Port 7844 -WarningAction SilentlyContinue; Write-Host ('REGION2 TCP 7844 = ' + $r.TcpTestSucceeded)"
echo Starting HTTP/2 tunnel...
"%CF%" tunnel --protocol http2 --url http://127.0.0.1:8787
pause
