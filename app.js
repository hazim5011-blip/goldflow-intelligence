var allSymbols=[], filteredSymbols=[], selectedSymbol=localStorage.getItem("gf_symbol")||"", selectedTF=localStorage.getItem("gf_tf")||"M5", selectedIndicator=localStorage.getItem("gf_indicator")||"105";
var focusedZone=null, lastAnalysis=null, lastLiveTick=null, chart=null, candleSeries=null, loading=false, liveTickLoading=false, macroLoaded=false, macroLoading=false, lastMacro=null;
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
function indicatorName(v){
  return ({
    "105":"MTF 1.05",
    "103":"MTF 1.03",
    "pvt":"PVT 1.02",
    "pattern132":"Pattern Tutor 1.32",
    "snd107":"SND/SNR 1.07",
    "owl101":"OWL 1.01",
    "fund104":"Fund Structure A 1.04 • WEB STUDY"
  })[v]||String(v||"ENGINE").toUpperCase();
}

document.querySelectorAll(".tab").forEach(function(b){b.onclick=function(){
  document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("on")});
  document.querySelectorAll(".page").forEach(function(x){x.classList.remove("on")});
  b.classList.add("on");$(b.dataset.page).classList.add("on");
  if(b.dataset.page==="chartPage")setTimeout(function(){drawChart();refreshLiveZoneEntry()},50);
  if(b.dataset.page==="tvPage")setTimeout(renderTradingView,50);
  if(b.dataset.page==="macroPage")setTimeout(function(){loadMacro(false)},50);
}});

$("tfSelect").value=selectedTF;
$("indicatorSelect").value=selectedIndicator;
$("tfSelect").onchange=function(){selectedTF=this.value;focusedZone=null;lastLiveTick=null;localStorage.setItem("gf_tf",selectedTF);loadAnalysis();renderTradingView()};
$("indicatorSelect").onchange=function(){selectedIndicator=this.value;focusedZone=null;lastLiveTick=null;localStorage.setItem("gf_indicator",selectedIndicator);loadAnalysis()};
$("refreshBtn").onclick=function(){loadSymbols(true);loadAnalysis()};
$("symbolSearch").oninput=applySymbolFilter;
$("category").onchange=applySymbolFilter;
$("symbolSelect").onchange=function(){selectSymbol(this.value)};
if($("macroRefresh"))$("macroRefresh").onclick=function(){loadMacro(true)};

function selectSymbol(s){
  if(!s)return;focusedZone=null;lastLiveTick=null;selectedSymbol=s;localStorage.setItem("gf_symbol",s);
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
    lastLiveTick=null;if(lastAnalysis?.ready)renderZones(lastAnalysis.indicator?.activeZones||{},null);chip("bridgeChip","bad","BRIDGE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=h.error||"Bridge configured but offline.";return false;
  }catch(e){lastLiveTick=null;if(lastAnalysis?.ready)renderZones(lastAnalysis.indicator?.activeZones||{},null);chip("bridgeChip","bad","BRIDGE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=e.message;return false}
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
  if(!selectedSymbol||loading)return;loading=true;
  var sameContext=!!(lastAnalysis?.ready&&lastAnalysis.requested===selectedSymbol&&lastAnalysis.selectedTF===selectedTF&&lastAnalysis.indicatorMode===selectedIndicator);
  if(!sameContext){lastLiveTick=null;lastAnalysis=null;focusedZone=null;resetDashboard();renderZones({buy:[],sell:[]},null)}
  try{
    var requestedSymbol=selectedSymbol,requestedTF=selectedTF,requestedIndicator=selectedIndicator;
    var r=await getJson("/api/analyze?symbol="+encodeURIComponent(requestedSymbol)+"&tf="+encodeURIComponent(requestedTF)+"&indicator="+encodeURIComponent(requestedIndicator));
    if(requestedSymbol!==selectedSymbol||requestedTF!==selectedTF||requestedIndicator!==selectedIndicator){setTimeout(loadAnalysis,0);return}
    lastAnalysis=r;
    if(!r.ok||!r.ready){
      chip("engineChip","warn","ENGINE WAIT");chip("marketChip","warn","WAIT");
      lastLiveTick=null;renderZones({buy:[],sell:[]},null);resetDashboard();$("connectionNotice").className="notice bad";$("connectionNotice").textContent=r.error||"Indicator engine not ready.";clearChart();return;
    }
    var ind=r.indicator||{},sig=ind.latestSignal||{},st=ind.stats||{},pd=ind.premiumDiscount||null;
    var engName=indicatorName(selectedIndicator);
    chip("bridgeChip","good","● VANTAGE MT5");chip("engineChip","good","● "+engName+" ENGINE");chip("marketChip",String(r.marketState).indexOf("STALE")>=0?"warn":"good",r.marketState||"MT5 LIVE");
    $("connectionNotice").className="notice good";$("connectionNotice").innerHTML="<b>"+selectedSymbol+"</b> • "+r.symbol+" • "+engName+" • "+r.triggerTF+" → "+r.setupTF+" → "+r.biasTF+" • direct Vantage MT5 candles"+(selectedIndicator==="fund104"?" • WEB STUDY SUBSET: native iCustom / full macro parity unavailable; A++ blocked; VALID_ONLY results.":"");
    $("price").textContent=px(r.price);$("spread").textContent=finite(r.tick&&r.tick.spread)?"Spread "+px(r.tick.spread):"";
    $("source").textContent=(r.broker||"Vantage")+" • "+r.symbol+" • MT5_BRIDGE";
    $("signal").textContent=sig.code||"WAIT";$("signal").className=clsDir(sig.direction);
    $("signalScore").textContent=finite(sig.score)?fmt(sig.score,0)+"%":"—";$("signalStatus").textContent=(sig.grade?(sig.grade+(selectedIndicator==="fund104"?" WEB STUDY":"")+" • "):"")+(sig.status||"WAIT");
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
    if($("statsNote")){
      $("statsNote").textContent=selectedIndicator==="fund104"
        ?"FUND 1.04 WEB STUDY • VALIDATION ONLY • Candidates "+(ind.studyDiagnostics?.patternCandidates??0)+" • Confirmed "+(ind.studyDiagnostics?.confirmedAtClose??0)+" • Invalidated "+(ind.studyDiagnostics?.invalidatedAfterClose??0)+" • Native buffers/macro parity not verified"
        :(selectedIndicator==="pattern132"||selectedIndicator==="snd107")
          ?"VALIDATION ONLY • TP/SL outcome not defined by indicator source"
          :"WIN = TP + TRAIL + BE • LOSE = SL only";
    }
    lastLiveTick=null;renderZones(ind.activeZones||{},null);renderStats(st);renderHistory(ind.history||[]);setTimeout(refreshLiveZoneEntry,0);
    $("vantageLink").href="https://secure.vantagemarketsea.com/web-trade/trade/"+encodeURIComponent(rootSymbol(selectedSymbol));
    $("chartTitle").textContent=(r.symbol||selectedSymbol)+" • VANTAGE MT5";$("chartTag").textContent=r.triggerTF;
    if($("chartPage").classList.contains("on"))drawChart();
  }catch(e){
    lastAnalysis=null;lastLiveTick=null;renderZones({buy:[],sell:[]},null);resetDashboard();chip("engineChip","bad","ENGINE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=e.message;
  }finally{loading=false}
}

function quoteForZone(d,tick){
  if(!tick||!Number.isFinite(tick.seenAtMs)||Date.now()-tick.seenAtMs>15000)return null;
  var q=Number(d)>0?tick.ask:tick.bid;
  return finite(q)?Number(q):null;
}
function zoneEntryState(x,d,tick){
  var lo=Number(x&&x.low),hi=Number(x&&x.high),q=quoteForZone(d,tick);
  var side=Number(d)>0?"ASK":"BID";
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||q===null)return {label:"QUOTE OFFLINE",live:false,quote:null,side:side,ready:false};
  var live=q>=Math.min(lo,hi)&&q<=Math.max(lo,hi);
  return{label:live?"LIVE ENTRY":"PENDING",live:live,quote:q,side:side,ready:true};
}
function renderZones(z,tick){
  var buy=z.buy||[],sell=z.sell||[];
  $("buyCount").textContent=buy.length;$("sellCount").textContent=sell.length;
  function html(a,d){return a.length?a.map(function(x,i){
    var st=zoneEntryState(x,d,tick),side=d>0?"buy":"sell";
    var action=st.live?'<button class="zoneAction" type="button" data-side="'+side+'" data-index="'+i+'" aria-label="View live entry setup on broker chart">LIVE TRADE • VIEW CHART ↗</button>':"";
    return '<div class="zone '+(st.live?("zoneLive "+side):"")+'"><div class="zoneTop"><b class="'+(d>0?"g":"r")+'">'+(d>0?"BUY":"SELL")+(x.swapped?" SWAP":"")+' • '+x.sourceEvent+'</b><span class="zoneStatus '+(st.live?("live "+side):st.ready?"pending":"offline")+'">'+(st.live?"● ":"")+st.label+'</span></div><div class="zonePrice">'+px(x.low)+" — "+px(x.high)+'</div><div class="zoneLiveLine"><span class="sub">LIVE '+st.side+' '+(finite(st.quote)?px(st.quote):"—")+'</span><span class="sub">Retest '+x.currentRetests+'</span></div>'+action+'<div class="sub">Base score '+fmt(x.baseScore,0)+'%</div></div>';
  }).join(""):'<div class="sub">No active zone.</div>'}
  $("buyZones").innerHTML=html(buy,1);$("sellZones").innerHTML=html(sell,-1);
  document.querySelectorAll(".zoneAction").forEach(function(b){b.onclick=function(){
    var z=(lastAnalysis?.indicator?.activeZones||{})[b.dataset.side]||[];
    var item=z[Number(b.dataset.index)];
    var d=b.dataset.side==="buy"?1:-1;
    if(!item||!zoneEntryState(item,d,lastLiveTick).live)return;
    focusedZone={...item,currentDirection:d};
    document.querySelector('.tab[data-page="chartPage"]').click();
    setTimeout(drawChart,70);
  }});
}
async function refreshLiveZoneEntry(){
  if(liveTickLoading||document.hidden||!selectedSymbol||!lastAnalysis||!lastAnalysis.ready)return;
  var onChart=$("chartPage").classList.contains("on");
  if(!$("dashboard").classList.contains("on")&&!onChart)return;
  var previousChartLive=!!(onChart&&focusedZone&&zoneEntryState(focusedZone,focusedZone.currentDirection,lastLiveTick).live);
  liveTickLoading=true;
  try{
    var activeSymbol=selectedSymbol,activeAnalysis=lastAnalysis;
    var j=await getJson("/api/status?lite=1&pair="+encodeURIComponent(activeSymbol));
    if(activeSymbol!==selectedSymbol||activeAnalysis!==lastAnalysis)return;
    if(!j.ok||!j.bridgeOnline||!finite(j.bid)||!finite(j.ask)||!finite(j.serverTime)||!finite(j.ageSeconds)||Number(j.ageSeconds)>30||Number(j.bid)<=0||Number(j.ask)<Number(j.bid))throw Error("BROKER_TICK_STALE_OR_UNAVAILABLE");
    lastLiveTick={bid:Number(j.bid),ask:Number(j.ask),seenAtMs:Date.now()};
    lastAnalysis.price=lastLiveTick.bid;$("price").textContent=px(lastLiveTick.bid);
    $("spread").textContent="Spread "+px(lastLiveTick.ask-lastLiveTick.bid);
    renderZones((lastAnalysis.indicator&&lastAnalysis.indicator.activeZones)||{},lastLiveTick);
    if(onChart&&focusedZone&&previousChartLive!==zoneEntryState(focusedZone,focusedZone.currentDirection,lastLiveTick).live)drawChart();
  }catch(e){
    // Never retain a stale quote as a LIVE ENTRY indication.
    if(lastAnalysis&&lastAnalysis.ready){lastLiveTick=null;renderZones((lastAnalysis.indicator&&lastAnalysis.indicator.activeZones)||{},null);if(onChart&&focusedZone&&previousChartLive)drawChart()}
  }finally{liveTickLoading=false}
}
function renderStats(s){
  var win=Number(s.wins||0),lose=Number(s.losses||0);$("stTotal").textContent=s.total||0;$("stWin").textContent=win;$("stLose").textContent=lose;$("stPending").textContent=s.pending||0;$("stWR").textContent=win+lose?fmt(100*win/(win+lose),1)+"%":"—";
}
function renderHistory(rows){
  $("historyRows").innerHTML=rows.slice().reverse().map(function(x){
    var raw=String(x.status||"P"),win=["TP","TR","BE"].indexOf(raw)>=0,study=["pattern132","snd107","fund104"].includes(selectedIndicator),out=study?(raw==="WEB_INVALIDATED"?"INVALID STUDY":raw==="WEB_VALIDATION"||raw==="VALID"?"VALID STUDY":"WATCH"):raw==="SL"?"LOSE":win?"WIN":"PENDING";
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
  var allZones=[].concat((ind.activeZones&&ind.activeZones.buy)||[],(ind.activeZones&&ind.activeZones.sell)||[]);
  var zones=focusedZone?[focusedZone]:allZones.slice().sort(function(a,b){var p=Number(lastAnalysis.price);return Math.abs((a.low+a.high)/2-p)-Math.abs((b.low+b.high)/2-p)}).slice(0,10);
  zones.forEach(function(z){
    var d=z.currentDirection||z.direction||1,st=zoneEntryState(z,d,lastLiveTick),col=d>0?"#31d6a4":"#ff6079";
    var label=st.live?"LIVE SETUP":st.ready?"PENDING":"OFFLINE";
    candleSeries.createPriceLine({price:Number(z.low),color:col,lineWidth:focusedZone?2:1,lineStyle:st.live?0:2,axisLabelVisible:true,title:label+" "+(d>0?"BUY":"SELL")+" ENTRY LOW"});
    candleSeries.createPriceLine({price:Number(z.high),color:col,lineWidth:focusedZone?2:1,lineStyle:st.live?0:2,axisLabelVisible:true,title:label+" "+(d>0?"BUY":"SELL")+" ENTRY HIGH"});
  });
  var barTimes=new Set(bars.map(function(b){return b.t}));
  var markers=(ind.history||[]).filter(function(x){return barTimes.has(x.time)}).slice(-80).map(function(x){return {time:x.time,position:x.direction>0?"belowBar":"aboveBar",color:x.direction>0?"#f2c75b":"#ff6079",shape:x.direction>0?"arrowUp":"arrowDown",text:x.code+" "+Math.round(x.score)+"%"}});
  if(focusedZone && zoneEntryState(focusedZone,focusedZone.currentDirection,lastLiveTick).live && bars.length){
    markers.push({time:bars[bars.length-1].t,position:focusedZone.currentDirection>0?"belowBar":"aboveBar",color:focusedZone.currentDirection>0?"#31d6a4":"#ff6079",shape:"circle",text:"LIVE ENTRY • PRICE IN ZONE (NOT EXECUTED)"});
  }
  if(candleSeries.setMarkers)candleSeries.setMarkers(markers.sort(function(a,b){return a.time-b.time}));
  chart.timeScale().fitContent();$("chartInfo").textContent=(lastAnalysis.symbol||selectedSymbol)+" • "+lastAnalysis.triggerTF+" • Vantage MT5 • "+(lastAnalysis.marketState||"")+" • PENDING = entry area; LIVE = current quote within area, NOT broker order";
}
async function init(){
  await checkBridge();await loadSymbols(false);
  setInterval(checkBridge,30000);
  setInterval(refreshLiveZoneEntry,5000);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)refreshLiveZoneEntry()});
  setInterval(function(){
    // V8 has lazy broker requests with CDN caching; do not poll an extra V7 dashboard while V8 analytics/news is in view.
    var v8Active=document.querySelector("#v8History.on,#v8Performance.on,#v8Evidence.on,#v8News.on");
    if(selectedSymbol&&!v8Active)loadAnalysis();
  },30000);
}
init();

function tvSymbol(s){
  var r=rootSymbol(s).toUpperCase();
  if(r==="XAUUSD247")return "OANDA:XAUUSD"; // TradingView independent reference, NOT Vantage native quote.
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
  // Defer the chart until the TradingView tab is visible (avoids hidden iframe load).
  if(!$("tvPage")?.classList.contains("on"))return;
  var sym=tvSymbol(selectedSymbol),intv=tvInterval(selectedTF);
  el.innerHTML='<iframe allowtransparency="true" frameborder="0" scrolling="no" allowfullscreen src="https://s.tradingview.com/widgetembed/?frameElementId=tv_goldflow&symbol='+encodeURIComponent(sym)+'&interval='+encodeURIComponent(intv)+'&hidesidetoolbar=0&symboledit=1&saveimage=0&toolbarbg=%230f2740&studies=[]&theme=dark&style=1&timezone=Asia%2FKuala_Lumpur&withdateranges=1&hideideas=1"></iframe>';
}

function macroImpactClass(v){
  return v==="SUPPORTIVE"?"g":v==="PRESSURE"?"r":"y";
}
function macroChangeText(c){
  if(!finite(c))return "—";
  var n=Number(c),sign=n>0?"+":"";
  return sign+fmt(n,2);
}
function macroStatusTag(card){
  if(card.status==="UNAVAILABLE")return '<span class="r">UNAVAILABLE</span>';
  if(card.stale)return '<span class="y">STALE / DATE UNCONFIRMED</span>';
  if(card.status==="DERIVED")return '<span class="y">DERIVED MODEL</span>';
  return '<span class="g">OFFICIAL DATA</span>';
}
function renderMacroCards(cards){
  var el=$("macroCards");if(!el)return;
  el.innerHTML=(cards||[]).map(function(x){
    var impact=x.goldImpact||"MIXED";
    return '<div class="macroCard '+(x.stale?"stale":"")+'">'+
      '<div class="mcTop"><div><div class="mcName">'+x.name+'</div><div class="sub">'+x.id+'</div></div><span class="mcDot"></span></div>'+
      '<div class="mcValue">'+(x.display||"—")+'</div>'+
      '<div class="mcChange '+(finite(x.change)?(Number(x.change)>0?"g":Number(x.change)<0?"r":""):"")+'">'+macroChangeText(x.change)+' • '+(x.changeLabel||"")+'</div>'+
      '<div class="mcDetail">'+(x.detail||"")+'</div>'+
      '<div class="mcFoot"><span>'+macroStatusTag(x)+' • '+(x.date||"—")+' • '+(x.frequency||"")+'</span>'+
      '<a class="macroLink" href="'+(x.seriesUrl||"#")+'" target="_blank" rel="noopener">'+(x.source||"FRED")+'</a>'+
      '<span class="mcImpact '+macroImpactClass(impact)+'">GOLD '+(x.status==="UNAVAILABLE"?"WAIT DATA":impact)+'</span></div>'+
    '</div>';
  }).join("");
}
function setMacroScore(id,v){
  var e=$(id),b=$("bar"+id.replace("score",""));
  if(e)e.textContent=finite(v)?Math.round(Number(v)):"—";
  if(b)b.style.width=finite(v)?Math.max(0,Math.min(100,Number(v)))+"%":"0%";
}
function renderMacroPlaybook(p){
  var el=$("macroPlaybook");if(!el)return;
  var rows=[["Gold",p.gold],["USD",p.usd],["US Treasury",p.treasury],["Equities",p.equities],["Oil",p.oil]];
  el.innerHTML=rows.map(function(r){
    var x=r[1]||{label:"MIXED",detail:"—"};
    return '<div class="pbRow"><div class="pbAsset">'+r[0]+'</div><div class="pbLabel '+macroImpactClass(x.label)+'">'+x.label+'</div><div class="pbText">'+x.detail+'</div></div>';
  }).join("");
}
function renderMacroTimeline(rows){
  var el=$("macroTimeline");if(!el)return;
  el.innerHTML=(rows||[]).map(function(x){
    var r=String(x.regime||"").toLowerCase();
    var h=Math.max(18,Math.min(100,Number(x.growth||50)));
    return '<div class="tlItem '+r+'"><div class="tlBar"><span style="height:'+h+'%"></span></div><div class="tlMonth">'+String(x.month||"").slice(2)+'</div><div class="tlRegime">'+x.regime+'</div><div class="sub">G '+x.growth+' • I '+x.inflation+'</div></div>';
  }).join("");
}
function renderMacroMethod(m){
  var el=$("macroMethod");if(!el)return;
  var rows=[
    ["OFFICIAL DATA",m.official],
    ["DERIVED MODEL",m.derived],
    ["HISTORY LIMITATION",m.revisions],
    ["NET LIQUIDITY FORMULA",m.netLiquidity]
  ];
  el.innerHTML=rows.map(function(x){return '<div class="methodBox"><b>'+x[0]+'</b>'+String(x[1]||"—")+'</div>'}).join("");
}
async function loadMacro(force){
  if(macroLoading||(!force&&macroLoaded))return;
  macroLoading=true;
  if($("macroNotice")){$("macroNotice").className="notice info";$("macroNotice").textContent="Loading official U.S. macro data…";}
  try{
    var j=await getJson("/api/macro"+(force?"?t="+Date.now():""));
    if(!j.ok)throw new Error(j.error||"Macro data unavailable");
    lastMacro=j;macroLoaded=true;
    renderMacroCards(j.cards||[]);
    $("macroQuality").textContent=(j.quality?.available||0)+"/"+(j.quality?.total||0)+" VALID • "+(j.quality?.fresh||0)+" FRESH";
    $("macroQuality").className="tag "+((j.quality?.fresh||0)===(j.quality?.total||0)?"g":"y");
    var issues=[...(j.quality?.errors||[]),...(j.quality?.notes||[])];
    if(j.quality?.unavailable?.length)issues.push("Unavailable: "+j.quality.unavailable.join(", "));
    if(j.quality?.stale?.length)issues.push("Stale / date unavailable: "+j.quality.stale.join(", "));
    $("macroNotice").className=issues.length?"notice info":"notice good";
    $("macroNotice").textContent=(issues.length?"PARTIAL DATA • ":"OFFICIAL DATA VERIFIED • ")+
      "Source: BLS, BEA, Federal Reserve, Treasury and NY Fed. Scores, regime and gold impact are DERIVED, not guaranteed directions."+
      (issues.length?" "+issues.join(" | "):"");
    $("macroRegime").textContent=j.regime?.name||"—";
    $("macroRegimeTag").textContent="DERIVED";
    $("macroConfidence").textContent=finite(j.regime?.confidence)?"Input coverage "+Math.round(j.regime.confidence)+"% • not probability":"—";
    $("macroRegimeNote").textContent=j.regime?.note||"—";
    setMacroScore("scoreGrowth",j.scores?.growth);
    setMacroScore("scoreInflation",j.scores?.inflation);
    setMacroScore("scorePolicy",j.scores?.policy);
    setMacroScore("scoreLiquidity",j.scores?.liquidity);
    setMacroScore("scoreRealYield",j.scores?.realYield);
    setMacroScore("scoreDollar",j.scores?.dollar);
    $("goldMacroScore").textContent=finite(j.gold?.score)?Math.round(j.gold.score):"—";
    $("goldMacroTag").textContent=j.gold?.bias||"—";
    $("goldMacroTag").className="tag "+macroImpactClass(j.gold?.bias);
    $("goldMacroText").textContent=j.gold?.note||"—";
    renderMacroPlaybook(j.playbook||{});
    renderMacroTimeline(j.timeline||[]);
    renderMacroMethod(j.methodology||{});
    $("macroFetched").textContent=j.fetchedAt?("Fetched "+new Date(j.fetchedAt).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"})):"—";
  }catch(e){
    if($("macroNotice")){$("macroNotice").className="notice bad";$("macroNotice").textContent=e.message;}
  }finally{macroLoading=false}
}
setInterval(function(){if(macroLoaded)loadMacro(true)},900000);
