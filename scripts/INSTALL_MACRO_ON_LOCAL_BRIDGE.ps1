# Copies ONLY two authenticated Bridge Python files into the EXISTING live install.
# No .env/token edits, no process kills, no changes to MT5 orders or Cloudflare Tunnel.
$ErrorActionPreference="Stop"
$root=Split-Path -Parent $PSScriptRoot
$src=Join-Path $root "bridge"
foreach($file in @("mt5_bridge.py","macro_sources.py")){
 if(!(Test-Path (Join-Path $src $file))){throw "Missing new ZIP file: $file. Download newest staging ZIP."}
}
Write-Host "GoldFlow GF Macro - Safe update of EXISTING Windows Bridge (NOT Vercel)" -ForegroundColor Cyan
Write-Host "This copies mt5_bridge.py and macro_sources.py, backs up the old Bridge, and does NOT restart it." -ForegroundColor Yellow
$candidates=@()
try{
 $procs=Get-CimInstance Win32_Process | Where-Object { $_.Name -match "^(python|pythonw|uvicorn)(\.exe)?$" -and $_.CommandLine -match "mt5_bridge" }
 foreach($pr in $procs){
  $cmd=[string]$pr.CommandLine
  foreach($pat in @('"([A-Za-z]:\\[^"]*?mt5_bridge\.py)"','(?:^|\s)([A-Za-z]:\\[^\s"]*mt5_bridge\.py)')){
   foreach($match in [regex]::Matches($cmd,$pat,[System.Text.RegularExpressions.RegexOptions]::IgnoreCase)){
    $candidate=$match.Groups[1].Value
    if(Test-Path -LiteralPath $candidate){$candidates+=Split-Path -Parent $candidate}
   }
  }
 }
}catch{Write-Host "Automatic process lookup unavailable; you can paste the existing bridge directory."}
$candidates=@($candidates | Select-Object -Unique)
$target=""
if($candidates.Count -eq 1){
 Write-Host "Detected running Bridge folder: $($candidates[0])"
 $answer=Read-Host "Use this EXACT EXISTING folder? Type YES to confirm, else press Enter"
 if($answer -ceq "YES"){$target=$candidates[0]}
}
if(!$target){$target=Read-Host "Paste the FULL PATH to the EXISTING LIVE bridge folder (contains mt5_bridge.py)"}
$target=$target.Trim().Trim('"')
if(!(Test-Path -LiteralPath (Join-Path $target "mt5_bridge.py"))){
 throw "STOP: Existing mt5_bridge.py NOT found in this folder. Do not overwrite an unknown folder."
}
if((Resolve-Path -LiteralPath $target).Path -eq (Resolve-Path -LiteralPath $src).Path){
 throw "STOP: You selected the NEW extracted ZIP, not the separate EXISTING running Bridge folder."
}
$answer=Read-Host "Copy TWO code files only to '$target'? Type YES to continue"
if($answer -cne "YES"){Write-Host "Cancelled. Nothing changed.";exit 1}
$stamp=Get-Date -Format "yyyyMMdd_HHmmss"
$backup=Join-Path $target ("GF_Macro_Backup_"+$stamp)
New-Item -ItemType Directory -Path $backup -ErrorAction Stop | Out-Null
foreach($file in @("mt5_bridge.py","macro_sources.py")){
 $old=Join-Path $target $file
 if(Test-Path -LiteralPath $old){Copy-Item -LiteralPath $old -Destination (Join-Path $backup $file) -ErrorAction Stop}
 Copy-Item -LiteralPath (Join-Path $src $file) -Destination $old -Force -ErrorAction Stop
}
Write-Host "SUCCESS: Two files installed. Backup: $backup" -ForegroundColor Green
Write-Host "IMPORTANT: Restart ONLY the original Bridge using your EXISTING Bridge launcher after confirming MT5 is safe to reconnect. Keep Cloudflare named tunnel active."
Write-Host "Then redeploy Cloudflare TEST with scripts\DEPLOY_CLOUDFLARE_TEST.bat from the NEW ZIP."
Write-Host "Do not share BRIDGE_KEY / .env / secret values in screenshots."
