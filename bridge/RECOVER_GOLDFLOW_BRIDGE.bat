@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
if not exist logs mkdir logs >nul 2>nul

for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd_HHmmss"') do set "STAMP=%%T"
set "LOG=%cd%\logs\bridge_recovery_%STAMP%.log"

set "KEY="
set "PORT=8787"
set "MT5PATH="
if exist ".env" (
  for /f "usebackq tokens=1,* delims==" %%A in (".env") do (
    if /I "%%A"=="BRIDGE_KEY" set "KEY=%%B"
    if /I "%%A"=="BRIDGE_PORT" set "PORT=%%B"
    if /I "%%A"=="MT5_TERMINAL_PATH" set "MT5PATH=%%B"
  )
)
if not defined KEY (
  echo [ERROR] BRIDGE_KEY missing from bridge\.env
  pause
  exit /b 1
)
set "GF_BRIDGE_KEY=%KEY%"

echo ===============================================
echo GoldFlow Bridge v3.0.1 - One Click Recovery
echo ===============================================
echo Log: %LOG%
echo.

call :log "[1/5] Checking MT5 terminal..."
if defined MT5PATH if exist "%MT5PATH%" (
  tasklist /FI "IMAGENAME eq terminal64.exe" | find /I "terminal64.exe" >nul
  if errorlevel 1 (
    start "" "%MT5PATH%"
    timeout /t 4 /nobreak >nul
  )
)

call :log "[2/5] Checking local bridge http://127.0.0.1:%PORT%/health ..."
call :testlocal
if errorlevel 1 (
  call :log "[WARN] Local bridge unhealthy. Restarting Python bridge..."
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue; if($c){$c|ForEach-Object{Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue}}" >>"%LOG%" 2>&1
  timeout /t 2 /nobreak >nul
  if not exist ".venv\Scripts\python.exe" (
    call :log "[ERROR] .venv missing. Run FIX_BRIDGE_PYTHON_ENV.bat first."
    goto :fail
  )
  start "GoldFlow Vantage MT5 Bridge v3.0.1" cmd /k ""%cd%\.venv\Scripts\python.exe" "%cd%\mt5_bridge.py""
  timeout /t 6 /nobreak >nul
  call :testlocal
  if errorlevel 1 (
    call :log "[ERROR] Local bridge is still unhealthy. Check Vantage MT5 login/terminal and bridge window."
    goto :fail
  )
)
call :log "[OK] Local MT5 bridge is healthy."

call :log "[3/5] Checking Production named tunnel..."
call "%cd%\START_NAMED_TUNNEL.bat" /AUTO >>"%LOG%" 2>&1
if errorlevel 1 (
  call :log "[ERROR] Production named tunnel could not be started."
  goto :fail
)

call :log "[4/5] Checking DNS for bridge.hazim5011.com ..."
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{Resolve-DnsName 'bridge.hazim5011.com' -ErrorAction Stop|Out-String|Write-Output;exit 0}catch{Write-Output $_.Exception.Message;exit 1}" >>"%LOG%" 2>&1
if errorlevel 1 call :log "[WARN] DNS lookup failed."

call :log "[5/5] Testing public Production bridge ..."
call :testpublic
if errorlevel 1 (
  call :log "[WARN] Public bridge is not healthy yet. Restarting cloudflared service if present..."
  sc query cloudflared >nul 2>nul
  if not errorlevel 1 (
    sc stop cloudflared >nul 2>nul
    timeout /t 2 /nobreak >nul
    sc start cloudflared >nul 2>nul
    timeout /t 5 /nobreak >nul
    call :testpublic
  )
)
if errorlevel 1 (
  call :log "[ERROR] Local bridge works, but https://bridge.hazim5011.com/health is not reachable."
  call :log "This isolates the fault to Cloudflare named tunnel / hostname routing, not MT5 Python."
  goto :fail
)

call :log "[SUCCESS] LOCAL BRIDGE + NAMED TUNNEL + PUBLIC HOST are healthy."
echo.
echo RECOVERY SUCCESS. Refresh GoldFlow with Ctrl+Shift+R.
echo See log: %LOG%
pause
exit /b 0

:testlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=@{'X-Bridge-Key'=$env:GF_BRIDGE_KEY}; try{$r=Invoke-RestMethod ('http://127.0.0.1:%PORT%/health') -Headers $h -TimeoutSec 12; $r|ConvertTo-Json -Compress|Write-Output; if($r.ok -and $r.connected){exit 0}else{exit 2}}catch{Write-Output $_.Exception.Message;exit 1}" >>"%LOG%" 2>&1
exit /b %errorlevel%

:testpublic
powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=@{'X-Bridge-Key'=$env:GF_BRIDGE_KEY}; try{$r=Invoke-RestMethod 'https://bridge.hazim5011.com/health' -Headers $h -TimeoutSec 18; $r|ConvertTo-Json -Compress|Write-Output; if($r.ok -and $r.connected){exit 0}else{exit 2}}catch{Write-Output $_.Exception.Message;exit 1}" >>"%LOG%" 2>&1
exit /b %errorlevel%

:log
echo %~1
>>"%LOG%" echo [%date% %time%] %~1
exit /b 0

:fail
echo.
echo RECOVERY NOT COMPLETE.
echo Read the last lines of:
echo %LOG%
echo.
echo Do NOT use START_QUICK_TUNNEL.bat for Production.
pause
exit /b 1
