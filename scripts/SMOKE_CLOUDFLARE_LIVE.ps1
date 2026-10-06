param([Parameter(Mandatory=$true)][string]$BaseUrl)
$ErrorActionPreference="Stop"
$BaseUrl=$BaseUrl.TrimEnd("/")
function Probe([string]$path){
 $url="$BaseUrl$path"
 try{
  $res=Invoke-WebRequest -UseBasicParsing -Uri $url -TimeoutSec 90
  if($res.StatusCode -ne 200){throw "HTTP $($res.StatusCode)"}
  return ($res.Content | ConvertFrom-Json -Depth 30)
 }catch{throw "FAIL $path : $($_.Exception.Message)"}
}
Write-Host "GoldFlow Cloudflare READ-ONLY live smoke (no orders, no Vercel changes)."
$health=Probe "/api/health"
if($health.hosting -ne "CLOUDFLARE_PAGES"){throw "Not the Cloudflare deployment"}
Write-Host "PASS: Cloudflare health $($health.version)"
$bridge=Probe "/api/bridge-health"
if(!$bridge.online -or $bridge.status -ne "MT5 LIVE"){throw "Bridge not MT5 LIVE: $($bridge.status)"}
Write-Host "PASS: Bridge $($bridge.broker) / $($bridge.server)"
$macro=Probe "/api/macro"
if($macro.quality.available -ne 16 -or $macro.quality.total -ne 16 -or @($macro.quality.errors).Count -gt 0 -or @($macro.timeline).Count -lt 12){throw "Macro parity failure"}
Write-Host "PASS: Macro 16/16, 12 months, no primary-source errors"
$market=Probe "/api/market-online"
if(!$market.ok -or $market.sampled -le 0){throw "Market-online verification unavailable"}
Write-Host "PASS: Market-online sampled $($market.sampled); verified $(@($market.verified).Count); partial=$($market.partialCoverage)"
$asset=Invoke-WebRequest -UseBasicParsing -Uri "$BaseUrl/study-ui.js" -TimeoutSec 20
if($asset.StatusCode -ne 200 -or !$asset.Content.Contains("GFStudy")){throw "Missing GF study UI"}
Write-Host "PASS: GF study script"
foreach($tf in @("M5","M15","M30","H1")){
 $study=Probe "/api/study?symbol=BTCUSD&tf=$tf&mode=study"
 if(!$study.source -or $study.source -ne "VANTAGE_MT5" -or !$study.engine -or !$study.chartBars){throw "Study failed $tf : $($study.reason)"}
 if($study.canEnter -and $study.status -notin @("BUY_ENTRY_READY","SELL_ENTRY_READY")){throw "Unsafe entry state $tf"}
 Write-Host "PASS: BTCUSD $tf $($study.status), broker candles $(@($study.chartBars).Count)"
}
$gold=Probe "/api/study?symbol=XAUUSD247&tf=M15&mode=ai"
if($gold.status -eq "DATA_UNVERIFIED" -and $gold.reason -eq "OFFICIAL_MACRO_INCOMPLETE_OR_STALE"){throw "GF-AI GOLD missing macro"}
Write-Host "Gold study status: $($gold.status), macro $($gold.news.quality.available)/$($gold.news.quality.total)"
$ledger=Probe "/api/v8?route=forward-ingest"
if($ledger.enabled -ne $false){throw "Unexpected forward storage enabled"}
Write-Host "PASS: Forward proof correctly disabled pending immutable R2 archive"
Write-Host "API TEST PASSED. Still verify original seven engines, browser/mobile, CPU/quota and 24h soak before replacing Production."
