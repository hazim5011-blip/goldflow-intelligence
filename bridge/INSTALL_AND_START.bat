@echo off
setlocal
cd /d %~dp0
if not exist .env (
  for /f "usebackq delims=" %%K in (`powershell -NoProfile -Command "$a=[guid]::NewGuid().ToString('N');$b=[guid]::NewGuid().ToString('N');Write-Output ($a+$b)"`) do set KEY=%%K
  >.env echo BROKER_NAME=Vantage
  >>.env echo BRIDGE_KEY=%KEY%
  >>.env echo BRIDGE_PORT=8787
  >>.env echo MT5_TERMINAL_PATH=
  >>.env echo SYMBOL_MAP_JSON={}
)
if not exist .venv py -m venv .venv
call .venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python mt5_bridge.py
pause
