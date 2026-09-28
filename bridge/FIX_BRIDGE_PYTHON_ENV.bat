@echo off
setlocal EnableExtensions
cd /d "%~dp0"

echo ============================================
echo GoldFlow Bridge - Repair Python Environment
echo ============================================
echo.

set "PYEXE="

echo [1/6] Detecting compatible Python...
for %%V in (3.13 3.12 3.11 3.10) do (
  if not defined PYEXE (
    py -%%V -c "import sys; print(sys.executable)" > "%TEMP%\gf_py.txt" 2>nul
    if not errorlevel 1 (
      set /p PYEXE=<"%TEMP%\gf_py.txt"
      echo Found Python %%V: !PYEXE!
    )
  )
)

if not defined PYEXE (
  python -c "import sys; print(sys.executable)" > "%TEMP%\gf_py.txt" 2>nul
  if not errorlevel 1 (
    set /p PYEXE=<"%TEMP%\gf_py.txt"
    echo Found Python: !PYEXE!
  )
)

if not defined PYEXE (
  echo.
  echo ERROR: No compatible Python found.
  echo Please install Python 3.13, 3.12, 3.11 or 3.10, then run this file again.
  pause
  exit /b 1
)

echo.
echo [2/6] Removing broken virtual environment...
if exist ".venv" rmdir /s /q ".venv"

echo.
echo [3/6] Creating fresh virtual environment...
"%PYEXE%" -m venv .venv
if errorlevel 1 (
  echo ERROR: Could not create .venv
  pause
  exit /b 1
)

echo.
echo [4/6] Installing bridge dependencies...
call ".venv\Scripts\activate.bat"
python -m pip install --upgrade pip
if exist requirements.txt (
  pip install -r requirements.txt
) else (
  pip install fastapi "uvicorn[standard]" MetaTrader5 python-dotenv
)
if errorlevel 1 (
  echo ERROR: Dependency installation failed.
  pause
  exit /b 1
)

echo.
echo [5/6] Verifying MetaTrader5 module...
python -c "import MetaTrader5, fastapi, uvicorn, dotenv; print('Python environment OK')"
if errorlevel 1 (
  echo ERROR: Module verification failed.
  pause
  exit /b 1
)

echo.
echo [6/6] Starting GoldFlow Vantage MT5 Bridge v3...
start "GoldFlow Vantage MT5 Bridge v3" cmd /k ""%cd%\.venv\Scripts\python.exe" "%cd%\mt5_bridge.py""

echo.
echo Repair complete.
echo Keep the new bridge window OPEN.
echo Your existing Cloudflare tunnel can stay open.
pause
