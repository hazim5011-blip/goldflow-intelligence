var allSymbols=[], filteredSymbols=[], selectedSymbol=localStorage.getItem("gf_symbol")||"", selectedTF=localStorage.getItem("gf_tf")||"M5", selectedIndicator=localStorage.getItem("gf_indicator")||"105";
var lastAnalysis=null, chart=null, candleSeries=null, loading=false;
function $(id){return document.getElementById(id)}
function finite(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function fmt(v,d){if(!finite(v))return "—";return Number(v).toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})}
function digits(){if(finite(lastAnalysis&&lastAnalysis.digits))return Number(lastAnalysis.digits);var s=allSymbols.find(function(x){return x.name===selectedSymbol});if(s&&finite(s.digits))return Number(s.digits);return /JPY/i.test(selectedSymbol)?3:/XAU|XAG/i.test(selectedSymbol)?2:5}
function px(v){return fmt(v,digits())}
function clsDir(d){return Number(d)>0?"g":Number(d)<0?"r":"y"}
function stateText(d){return Number(d)>0?"BULLISH":Number(d)<0?"BEARISH":"RANGE"}
function chip(id,type,text){var e=$(id);e.className="chip "+type;e.textContent=text}
async function getJson(url){var r=await fetch(url,{cache:"no-store"});var j=await r.json();if(!r.ok)throw new Error(j.error||("HTTP "+r.status));return j}
function rootSymbol(s){return String(s||"").replace(/[.#].*$/,"")}

document.querySelectorAll(".tab").forEach(function(b){b.onclick=function(){
  document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("on")});
  document.querySelectorAll(".page").forEach(function(x){x.classList.remove("on")});
  b.classList.add("on");$(b.dataset.page).classList.add("on");
  if(b.dataset.page==="chartPage")setTimeout(drawChart,50);
  if(b.dataset.page==="tvPage")setTimeout(renderTradingView,50);
}});

$("tfSelect").value=selectedTF;
$("indicatorSelect").value=selectedIndicator;
$("tfSelect").onchange=function(){selectedTF=this.value;localStorage.setItem("gf_tf",selectedTF);loadAnalysis();renderTradingView()};
$("indicatorSelect").onchange=function(){selectedIndicator=this.value;localStorage.setItem("gf_indicator",selectedIndicator);loadAnalysis()};
$("refreshBtn").onclick=function(){loadSymbols(true);loadAnalysis()};
$("symbolSearch").oninput=applySymbolFilter;
$("category").onchange=applySymbolFilter;
$("symbolSelect").onchange=function(){selectSymbol(this.value)};

function selectSymbol(s){
  if(!s)return;selectedSymbol=s;localStorage.setItem("gf_symbol",s);
  $("symbolSelect").value=s;renderSymbolCards();loadAnalysis();renderTradingView();
}
function categoryRank(x){return {METALS:1,FOREX:2,CRYPTO:3,INDICES:4,ENERGY:5,STOCKS:6,OTHER:7}[x]||9}
function applySymbolFilter(){
  var q=$("symbolSearch").value.trim().toUpperCase(),cat=$("category").value;
  filteredSymbols=allSymbols.filter(function(s){
    var okCat=cat==="ALL"||s.category===cat;
    var hay=(s.name+" "+(s.description||"")+" "+(s.path||"")).toUpperCase();
    return okCat&&(!q||hay.indexOf(q)>=0);
  });
  renderSymbolSelect();renderSymbolCards();
}
function renderCategories(){
  var cats=Array.from(new Set(allSymbols.map(function(x){return x.category||"OTHER"}))).sort(function(a,b){return categoryRank(a)-categoryRank(b)});
  $("category").innerHTML='<option value="ALL">ALL</option>'+cats.map(function(c){return '<option value="'+c+'">'+c+'</option>'}).join("");
}
function renderSymbolSelect(){
  var rows=filteredSymbols.slice(0,2000);
  if(selectedSymbol&&!rows.some(function(x){return x.name===selectedSymbol})){
    var cur=allSymbols.find(function(x){return x.name===selectedSymbol});if(cur)rows.unshift(cur);
  }
  $("symbolSelect").innerHTML=rows.map(function(s){return '<option value="'+s.name.replace(/"/g,"&quot;")+'">'+s.name+' • '+s.category+'</option>'}).join("");
  if(selectedSymbol)$("symbolSelect").value=selectedSymbol;
}
function renderSymbolCards(){
  $("symbolCount").textContent=filteredSymbols.length+" / "+allSymbols.length;
  var rows=filteredSymbols.slice(0,600);
  $("symbolCards").innerHTML=rows.map(function(s){
    return '<div class="symCard" data-sym="'+s.name.replace(/"/g,"&quot;")+'"><div class="symName">'+s.name+'</div><div class="symMeta">'+s.category+(s.description?" • "+s.description:"")+'</div></div>';
  }).join("")+(filteredSymbols.length>600?'<div class="sub">Type in Search Symbol to narrow '+filteredSymbols.length+' results.</div>':"");
  document.querySelectorAll(".symCard").forEach(function(c){c.onclick=function(){selectSymbol(c.dataset.sym);document.querySelector('[data-page="dashboard"]').click()}});
}
async function checkBridge(){
  try{
    var h=await getJson("/api/bridge-health");
    if(!h.configured){
      chip("bridgeChip","bad","BRIDGE OFF");chip("engineChip","warn","WAIT ENV");chip("marketChip","warn","NO SOURCE");
      $("connectionNotice").className="notice bad";
      $("connectionNotice").innerHTML="<b>Vantage MT5 Bridge belum disambungkan ke Vercel.</b> Set BROKER_BRIDGE_URL dan BROKER_BRIDGE_KEY pada project goldflow-intelligence, kemudian redeploy.";
      return false;
    }
    if(h.online){
      chip("bridgeChip","good","● VANTAGE MT5");$("connectionNotice").className="notice good";
      $("connectionNotice").innerHTML="<b>Vantage MT5 LIVE.</b> "+(h.server||"")+" • Bridge "+(h.version||"")+" • "+(h.terminal||"");
      return true;
    }
    chip("bridgeChip","bad","BRIDGE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=h.error||"Bridge configured but offline.";return false;
  }catch(e){chip("bridgeChip","bad","BRIDGE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=e.message;return false}
}
async function loadSymbols(force){
  try{
    var j=await getJson("/api/symbols"+(force?"?t="+Date.now():""));
    if(!j.ok)throw new Error(j.error||"Symbols unavailable");
    allSymbols=(j.symbols||[]).sort(function(a,b){return categoryRank(a.category)-categoryRank(b.category)||a.name.localeCompare(b.name)});
    renderCategories();filteredSymbols=allSymbols.slice();
    if(!selectedSymbol||!allSymbols.some(function(x){return x.name===selectedSymbol})){
      var pref=allSymbols.find(function(x){return /XAUUSD247/i.test(x.name)})||allSymbols.find(function(x){return /^XAUUSD/i.test(x.name)})||allSymbols[0];
      selectedSymbol=pref?pref.name:"";if(selectedSymbol)localStorage.setItem("gf_symbol",selectedSymbol);
    }
    renderSymbolSelect();renderSymbolCards();
    if(selectedSymbol)loadAnalysis();
  }catch(e){
    allSymbols=[];filteredSymbols=[];renderSymbolSelect();renderSymbolCards();
  }
}
function resetDashboard(){
  ["price","spread","signalScore","signalStatus","biasState","biasStrength","biasEvent","setupState","setupStrength","setupEvent","profile","lastAge","resolvedSymbol","entry","sl","tp1","tp2","pdHigh","pdEq","pdLow","pdPos"].forEach(function(id){$(id).textContent="—"});
  $("signal").textContent="WAIT";$("reasons").textContent="Waiting for broker analysis…";$("watch").textContent="No active zone nearby.";
}
async function loadAnalysis(){
  if(!selectedSymbol||loading)return;loading=true;resetDashboard();
  try{
    var r=await getJson("/api/analyze?symbol="+encodeURIComponent(selectedSymbol)+"&tf="+encodeURIComponent(selectedTF)+"&indicator="+encodeURIComponent(selectedIndicator));
    lastAnalysis=r;
    if(!r.ok||!r.ready){
      chip("engineChip","warn","ENGINE WAIT");chip("marketChip","warn","WAIT");
      $("connectionNotice").className="notice bad";$("connectionNotice").textContent=r.error||"Indicator engine not ready.";clearChart();return;
    }
    var ind=r.indicator||{},sig=ind.latestSignal||{},st=ind.stats||{},pd=ind.premiumDiscount||null;
    var engName=selectedIndicator==="103"?"1.03":selectedIndicator==="pvt"?"PVT 1.02":"1.05";
    chip("bridgeChip","good","● VANTAGE MT5");chip("engineChip","good","● "+engName+" ENGINE");chip("marketChip",String(r.marketState).indexOf("STALE")>=0?"warn":"good",r.marketState||"MT5 LIVE");
    $("connectionNotice").className="notice good";$("connectionNotice").innerHTML="<b>"+selectedSymbol+"</b> • "+r.symbol+" • "+engName+" • "+r.triggerTF+" → "+r.setupTF+" → "+r.biasTF+" • direct Vantage MT5 candles";
    $("price").textContent=px(r.price);$("spread").textContent=finite(r.tick&&r.tick.spread)?"Spread "+px(r.tick.spread):"";
    $("source").textContent=(r.broker||"Vantage")+" • "+r.symbol+" • MT5_BRIDGE";
    $("signal").textContent=sig.code||"WAIT";$("signal").className=clsDir(sig.direction);
    $("signalScore").textContent=finite(sig.score)?fmt(sig.score,0)+"%":"—";$("signalStatus").textContent=sig.status||"WAIT";
    $("biasState").textContent=stateText(ind.biasState&&ind.biasState.trend);$("biasState").className=clsDir(ind.biasState&&ind.biasState.trend);
    $("biasStrength").textContent=finite(ind.biasState&&ind.biasState.strength)?fmt(ind.biasState.strength,0)+"%":"—";$("biasEvent").textContent=(ind.biasState&&ind.biasState.lastEvent)||"—";
    $("setupState").textContent=stateText(ind.setupState&&ind.setupState.trend);$("setupState").className=clsDir(ind.setupState&&ind.setupState.trend);
    $("setupStrength").textContent=finite(ind.setupState&&ind.setupState.strength)?fmt(ind.setupState.strength,0)+"%":"—";$("setupEvent").textContent=(ind.setupState&&ind.setupState.lastEvent)||"—";
    $("profile").textContent=r.triggerTF+"→"+r.setupTF+"→"+r.biasTF;$("lastAge").textContent=finite(r.ageMin)?(Number(r.ageMin)<60?Math.round(r.ageMin)+" min":(Number(r.ageMin)/60).toFixed(1)+" h"):"—";$("resolvedSymbol").textContent=r.symbol;
    $("entry").textContent=px(sig.entry);$("sl").textContent=px(sig.invalidation);$("tp1").textContent=px(sig.tp1);$("tp2").textContent=px(sig.tp2);
    $("planBadge").textContent=sig.code||"WAIT";$("planBadge").className="tag "+clsDir(sig.direction);
    $("reasons").textContent=(sig.reasons||[]).join(" + ")||sig.reason||"Wait for closed-candle confirmation.";
    if(pd){$("pdHigh").textContent=px(pd.high);$("pdEq").textContent=px(pd.equilibrium);$("pdLow").textContent=px(pd.low);$("pdPos").textContent=pd.position}else{$("pdHigh").textContent=$("pdEq").textContent=$("pdLow").textContent=$("pdPos").textContent="—"}
    if(ind.watch&&ind.watch.zone){$("watch").textContent=ind.watch.reason+" • "+px(ind.watch.zone.low)+" - "+px(ind.watch.zone.high)}else $("watch").textContent="No active zone nearby.";
    renderZones(ind.activeZones||{});renderStats(st);renderHistory(ind.history||[]);
    $("vantageLink").href="https://secure.vantagemarketsea.com/web-trade/trade/"+encodeURIComponent(rootSymbol(selectedSymbol));
    $("chartTitle").textContent=(r.symbol||selectedSymbol)+" • VANTAGE MT5";$("chartTag").textContent=r.triggerTF;
    if($("chartPage").classList.contains("on"))drawChart();
  }catch(e){
    chip("engineChip","bad","ENGINE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=e.message;
  }finally{loading=false}
}
function renderZones(z){
  var buy=z.buy||[],sell=z.sell||[];$("buyCount").textContent=buy.length;$("sellCount").textContent=sell.length;
  function html(a,d){return a.length?a.map(function(x){return '<div class="zone"><div class="zoneTop"><b class="'+(d>0?"g":"r")+'">'+(d>0?"BUY":"SELL")+(x.swapped?" SWAP":"")+' • '+x.sourceEvent+'</b><span class="sub">Retest '+x.currentRetests+'</span></div><div class="zonePrice">'+px(x.low)+" — "+px(x.high)+'</div><div class="sub">Base score '+fmt(x.baseScore,0)+'%</div></div>'}).join(""):'<div class="sub">No active zone.</div>'}
  $("buyZones").innerHTML=html(buy,1);$("sellZones").innerHTML=html(sell,-1);
}
function renderStats(s){
  var win=Number(s.wins||0),lose=Number(s.losses||0);$("stTotal").textContent=s.total||0;$("stWin").textContent=win;$("stLose").textContent=lose;$("stPending").textContent=s.pending||0;$("stWR").textContent=win+lose?fmt(100*win/(win+lose),1)+"%":"—";
}
function renderHistory(rows){
  $("historyRows").innerHTML=rows.slice().reverse().map(function(x){
    var raw=String(x.status||"P"),win=["TP","TR","BE"].indexOf(raw)>=0,out=raw==="SL"?"LOSE":win?"WIN":"PENDING";
    var when=new Date(Number(x.time)*1000).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
    return '<div class="hist"><div>'+when+'</div><div class="'+clsDir(x.direction)+'"><b>'+x.code+'</b><br>'+fmt(x.score,0)+'%</div><div>Entry '+px(x.entry)+'<br><span class="sub">SL '+px(x.invalidation)+' • TP1 '+px(x.tp1)+' • TP2 '+px(x.tp2)+'</span></div><div><b class="'+(out==="WIN"?"g":out==="LOSE"?"r":"y")+'">'+out+'</b><br><span class="sub">'+raw+'</span></div><div>'+(x.reasons||[]).join(" + ")+'</div></div>';
  }).join("")||'<div class="sub">No completed signal history for this symbol/TF yet.</div>';
}
function clearChart(){if(chart){chart.remove();chart=null;candleSeries=null}$("chart").innerHTML=""}
function drawChart(){
  clearChart();if(!lastAnalysis||!lastAnalysis.ready||!(lastAnalysis.chartBars||[]).length){$("chartInfo").textContent="No broker bars.";return}
  var bars=lastAnalysis.chartBars,ind=lastAnalysis.indicator||{};
  chart=LightweightCharts.createChart($("chart"),{layout:{background:{color:"#07131c"},textColor:"#aab9c3"},grid:{vertLines:{color:"#10222e"},horzLines:{color:"#10222e"}},rightPriceScale:{borderColor:"#24404e"},timeScale:{borderColor:"#24404e",timeVisible:true,secondsVisible:false}});
  candleSeries=chart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",borderVisible:false,wickUpColor:"#31d6a4",wickDownColor:"#ff6079"});
  candleSeries.setData(bars.map(function(b){return {time:b.t,open:b.o,high:b.h,low:b.l,close:b.c}}));
  var zones=[].concat((ind.activeZones&&ind.activeZones.buy)||[],(ind.activeZones&&ind.activeZones.sell)||[]);
  zones.slice(0,10).forEach(function(z){var d=z.currentDirection||z.direction,col=d>0?"#31d6a4":"#ff6079";candleSeries.createPriceLine({price:z.low,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:(d>0?"BUY":"SELL")+" L"});candleSeries.createPriceLine({price:z.high,color:col,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:(d>0?"BUY":"SELL")+" H"})});
  var barTimes=new Set(bars.map(function(b){return b.t}));
  var markers=(ind.history||[]).filter(function(x){return barTimes.has(x.time)}).slice(-80).map(function(x){return {time:x.time,position:x.direction>0?"belowBar":"aboveBar",color:x.direction>0?"#f2c75b":"#ff6079",shape:x.direction>0?"arrowUp":"arrowDown",text:x.code+" "+Math.round(x.score)+"%"}});
  if(candleSeries.setMarkers)candleSeries.setMarkers(markers);
  chart.timeScale().fitContent();$("chartInfo").textContent=(lastAnalysis.symbol||selectedSymbol)+" • "+lastAnalysis.triggerTF+" • Vantage MT5 • "+(lastAnalysis.marketState||"");
}
async function init(){
  await checkBridge();await loadSymbols(false);
  setInterval(checkBridge,30000);setInterval(function(){if(selectedSymbol)loadAnalysis()},30000);
}
init();

function tvSymbol(s){
  var r=rootSymbol(s).toUpperCase();
  if(r==="XAUUSD247")return "THINKMARKETS:XAUUSD247";
  if(r==="XAUUSD")return "OANDA:XAUUSD";
  if(r==="XAGUSD")return "OANDA:XAGUSD";
  if(/^(BTC|ETH|SOL|XRP|LTC|BCH)USD$/.test(r))return "COINBASE:"+r;
  if(/^[A-Z]{6}$/.test(r))return "FX:"+r;
  return r;
}
function tvInterval(tf){
  return ({M1:"1",M5:"5",M15:"15",M30:"30",H1:"60",H4:"240",D1:"D"})[tf]||"5";
}
function renderTradingView(){
  var el=$("tvWrap"); if(!el||!selectedSymbol)return;
  var sym=tvSymbol(selectedSymbol),intv=tvInterval(selectedTF);
  el.innerHTML='<iframe allowtransparency="true" frameborder="0" scrolling="no" allowfullscreen src="https://s.tradingview.com/widgetembed/?frameElementId=tv_goldflow&symbol='+encodeURIComponent(sym)+'&interval='+encodeURIComponent(intv)+'&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=%230f2740&studies=[]&theme=dark&style=1&timezone=Asia%2FKuala_Lumpur&withdateranges=1&hideideas=1"></iframe>';
}
