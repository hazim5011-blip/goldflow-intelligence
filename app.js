var allSymbols=[], filteredSymbols=[], selectedSymbol=localStorage.getItem("gf_symbol")||"", selectedTF=localStorage.getItem("gf_tf")||"M5", selectedIndicator=localStorage.getItem("gf_indicator")||"105";
var chartLabelMode=localStorage.getItem("gf_chart_labels")||"nearest";
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
    "fund104":"Fund Structure A 1.04 • WEB STUDY",
    "gf-ai":"GF-AI REASONING v1.30",
    "gf-news":"GF-NEWS IMPACT PRO",
    "gf-study":"GF-MARKET STUDY PRO"
  })[v]||String(v||"ENGINE").toUpperCase();
}

document.querySelectorAll(".tab").forEach(function(b){b.onclick=function(){
  document.querySelectorAll(".tab").forEach(function(x){x.classList.remove("on")});
  document.querySelectorAll(".page").forEach(function(x){x.classList.remove("on")});
  b.classList.add("on");$(b.dataset.page).classList.add("on");
  if(b.dataset.page==="chartPage")setTimeout(function(){drawChart();refreshLiveZoneEntry()},50);
  if(b.dataset.page==="tvPage")setTimeout(renderTradingView,50);
  if(b.dataset.page==="macroPage")setTimeout(function(){loadMacro(false)},50);
  if(b.dataset.page==="gfStudyPage"&&/^gf-/.test(selectedIndicator))setTimeout(function(){window.GFStudy?.load()},50);
}});

$("tfSelect").value=selectedTF;
$("indicatorSelect").value=selectedIndicator;
$("tfSelect").onchange=function(){selectedTF=this.value;focusedZone=null;lastLiveTick=null;localStorage.setItem("gf_tf",selectedTF);loadAnalysis();renderTradingView()};
$("indicatorSelect").onchange=function(){selectedIndicator=this.value;focusedZone=null;lastLiveTick=null;window.GFStudy?.invalidate?.();localStorage.setItem("gf_indicator",selectedIndicator);if(!/^gf-/.test(selectedIndicator)&&$("gfStudyPage").classList.contains("on"))document.querySelector('[data-page="dashboard"]')?.click();loadAnalysis();if(/^gf-/.test(selectedIndicator)&&$("gfStudyPage").classList.contains("on"))window.GFStudy?.load()};
$("refreshBtn").onclick=function(){loadSymbols(true);loadAnalysis()};
$("symbolSearch").oninput=applySymbolFilter;
$("category").onchange=applySymbolFilter;
$("symbolSelect").onchange=function(){selectSymbol(this.value)};
if($("macroRefresh"))$("macroRefresh").onclick=function(){loadMacro(true)};
if($("chartLabelMode")){
  if(!["nearest","all","hide"].includes(chartLabelMode))chartLabelMode="nearest";
  $("chartLabelMode").value=chartLabelMode;
  $("chartLabelMode").onchange=function(){chartLabelMode=["nearest","all","hide"].includes(this.value)?this.value:"nearest";localStorage.setItem("gf_chart_labels",chartLabelMode);if($("chartPage")?.classList.contains("on"))drawChart()};
}

function selectSymbol(s){
  if(!s)return;focusedZone=null;lastLiveTick=null;selectedSymbol=s;localStorage.setItem("gf_symbol",s);
  $("symbolSelect").value=s;renderSymbolCards();loadAnalysis();renderTradingView();
}
function categoryRank(x){return {SYNTHETIC:0,METALS:1,FOREX:2,CRYPTO:3,INDICES:4,ENERGY:5,STOCKS:6,OTHER:7}[x]??9}
function applySymbolFilter(){
  var q=$("symbolSearch").value.trim().toUpperCase(),cat=$("category").value;
  filteredSymbols=allSymbols.filter(function(s){
    var special=cat==="MARKET_ONLINE"||cat==="MARKET_24H";
    var okCat=special?!!(window.GFMarket&&window.GFMarket.has(s.name,cat)):cat==="ALL"||s.category===cat;
    var hay=(s.name+" "+(s.description||"")+" "+(s.path||"")).toUpperCase();
    return okCat&&(!q||hay.indexOf(q)>=0);
  });
  if((cat==="MARKET_ONLINE"||cat==="MARKET_24H")&&filteredSymbols.length&&!filteredSymbols.some(function(s){return s.name===selectedSymbol})){
    // Auto-focus the first VERIFIED active instrument, never a guessed crypto alias.
    selectedSymbol=filteredSymbols[0].name;localStorage.setItem("gf_symbol",selectedSymbol);
    loadAnalysis();renderTradingView();
  }
  renderSymbolSelect();renderSymbolCards();
  if((cat==="MARKET_ONLINE"||cat==="MARKET_24H")&&window.GFMarket){
    if(window.GFMarket.needsUpdate())window.GFMarket.ensure().then(function(){if($("category").value===cat)applySymbolFilter()});
    if($("marketFilterNotice"))$("marketFilterNotice").textContent=window.GFMarket.note(cat);
  }else if($("marketFilterNotice"))$("marketFilterNotice").textContent="Market categories are broker symbol classes; choose MARKET ONLINE for fresh MT5 verification.";
}
function renderCategories(){
  var cats=Array.from(new Set(allSymbols.map(function(x){return x.category||"OTHER"}))).sort(function(a,b){return categoryRank(a)-categoryRank(b)});
  var prev=$("category").value;
  $("category").innerHTML='<option value="ALL">ALL MARKET</option><option value="MARKET_ONLINE">● MARKET ONLINE • Verified now</option><option value="MARKET_24H">● MARKET 24H • Weekend verified</option>'+cats.map(function(c){return '<option value="'+c+'">'+c+'</option>'}).join("");
  if(Array.from($("category").options).some(function(o){return o.value===prev}))$("category").value=prev;
}
function renderSymbolSelect(){
  var rows=filteredSymbols.slice(0,2000);
  if(selectedSymbol&&!["MARKET_ONLINE","MARKET_24H"].includes($("category").value)&&!rows.some(function(x){return x.name===selectedSymbol})){
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
    lastLiveTick=null;if(lastAnalysis?.ready)renderZones(lastAnalysis.indicator?.activeZones||{},null);window.GFStudy?.transportLost?.(h.error||"Bridge configured but offline.");chip("bridgeChip","bad","BRIDGE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=h.error||"Bridge configured but offline.";return false;
  }catch(e){lastLiveTick=null;if(lastAnalysis?.ready)renderZones(lastAnalysis.indicator?.activeZones||{},null);window.GFStudy?.transportLost?.(e.message||"Bridge request failed");chip("bridgeChip","bad","BRIDGE ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=e.message;return false}
}
async function loadSymbols(force){
  try{
    var j=await getJson("/api/symbols"+(force?"?t="+Date.now():""));
    if(!j.ok)throw new Error(j.error||"Symbols unavailable");
    allSymbols=(j.symbols||[]).sort(function(a,b){return categoryRank(a.category)-categoryRank(b.category)||a.name.localeCompare(b.name)});
    renderCategories();filteredSymbols=allSymbols.slice();
    if(["MARKET_ONLINE","MARKET_24H"].includes($("category").value))applySymbolFilter();
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
  if($("pdTitle"))$("pdTitle").textContent="PREMIUM / DISCOUNT";
  if($("newsWhyCard"))$("newsWhyCard").hidden=true;
  $("signal").textContent="WAIT";$("reasons").textContent="Waiting for broker analysis…";$("watch").textContent="No active zone nearby.";
}

function gfMode(){return ({"gf-ai":"ai","gf-news":"news","gf-study":"study"})[selectedIndicator]||null}
function gfDir(d){var p=d&&d.confirmation;return Number(p&&p.direction)||Number(d&&d.direction)||0}
function gfStatusLabel(st){st=String(st||"DATA_UNVERIFIED");return st.replace(/^AI_/,"").replace(/^STUDY_/,"").replaceAll("_"," ")}
function gfZones(d){
  var out={buy:[],sell:[]},dir=gfDir(d),p=d&&d.confirmation,cp=d&&d.mode==="ai"&&d.candidatePlan?d.candidatePlan:null,lo=null,hi=null,source="",eligible=!!(d&&d.canEnter);
  if(p&&finite(p.entryLow)&&finite(p.entryHigh)){lo=Number(p.entryLow);hi=Number(p.entryHigh)}
  else if(cp&&finite(cp.entryLow)&&finite(cp.entryHigh)){lo=Number(cp.entryLow);hi=Number(cp.entryHigh);eligible=false}
  else if(d&&d.mode==="study"&&d.structureLevels&&finite(d.structureLevels.reactionZoneLow)&&finite(d.structureLevels.reactionZoneHigh)){
    lo=Number(d.structureLevels.reactionZoneLow);hi=Number(d.structureLevels.reactionZoneHigh);eligible=false;
  }
  if(!dir||!finite(lo)||!finite(hi))return out;
  if(d.mode==="study"){
    if(d.structureFlip&&d.structureFlip.type)source=d.structureFlip.type+" "+(d.structureFlip.stage==="RETEST_CONFIRMED"?"CONFIRMED":"BREAK / RETEST");
    else if(d.structureFlipWatch&&d.structureFlipWatch.type)source=d.structureFlipWatch.type+" WATCH";
    else if(p&&p.confirmationType==="STRUCTURAL_ZONE_REJECTION")source=dir>0?"DEMAND REJECTION":"SUPPLY REJECTION";
    else source=dir>0?"DEMAND / RBS WATCH":"SUPPLY / SBR WATCH";
  }else if(d.mode==="ai")source=(p?.entryMethod||cp?.entryMethod||"AI MARKET WATCH")+" • "+(p?"CONFIRMED":"WATCH");
  else source="NEWS TECHNICAL RETEST";
  var zone={low:Math.min(lo,hi),high:Math.max(lo,hi),currentDirection:dir,direction:dir,sourceEvent:source,
    currentRetests:null,baseScore:p&&finite(p.score)?Number(p.score):d.mode==="ai"&&finite(d.analysis?.directionScore)?Number(d.analysis.directionScore):null,gfStudy:true,gfEligible:eligible};
  (dir>0?out.buy:out.sell).push(zone);return out;
}
function gfContextPosition(d){
  var q=d&&d.structureLevels,price=finite(d&&d.bid)?Number(d.bid):finite(d&&d.ask)?Number(d.ask):null,hi=null,lo=null;
  if(q&&finite(q.support)&&finite(q.resistance)){hi=Number(q.resistance);lo=Number(q.support)}
  else if(d?.mode==="ai"&&finite(d?.marketBrain?.selected?.structure?.lastHigh?.price)&&finite(d?.marketBrain?.selected?.structure?.lastLow?.price)){
    hi=Number(d.marketBrain.selected.structure.lastHigh.price);lo=Number(d.marketBrain.selected.structure.lastLow.price);
  }
  if(!finite(hi)||!finite(lo)||price===null||hi<=lo)return null;
  var eq=(hi+lo)/2;
  return {high:hi,low:lo,eq:eq,position:price>eq?"PREMIUM":price<eq?"DISCOUNT":"EQUILIBRIUM"};
}
function renderNewsWhy(d){
  var card=$("newsWhyCard");if(!card)return;
  if(d?.mode!=="news"){card.hidden=true;return}
  card.hidden=false;
  var w=d.newsDecision||{},decision=String(w.decision||"WAIT"),technical=Array.isArray(w.technicalReasons)?w.technicalReasons:[],macro=Array.isArray(w.macroReasons)?w.macroReasons:[];
  $("newsWhyHeadline").textContent=w.headline||"WHY WAIT • NEWS IMPACT";
  $("newsWhySummary").textContent=w.summary||d.reason||"Waiting for verified News Impact reasoning.";
  $("newsWhyTechnical").textContent=technical.length?technical.map(x=>"• "+x).join("\n"):"• No verified technical direction yet.";
  $("newsWhyMacro").textContent=macro.length?macro.map(x=>"• "+x).join("\n"):"• Macro/news context unavailable or mixed.";
  $("newsWhyDisclaimer").textContent=w.disclaimer||"Macro context is derived from official observations; it is not a guaranteed price direction.";
  var b=$("newsWhyBadge"),dir=String(w.technicalSide||"");
  b.textContent=decision.replaceAll("_"," ");
  b.className="tag "+(decision.includes("READY")?(dir==="BUY"?"g":"r"):decision.includes("CONFLICT")||decision.includes("WAIT")?"y":"");
}
function renderGFDashboard(d,requestedSymbol,requestedTF,requestedIndicator){
  var dir=gfDir(d),p=d&&d.confirmation,zones=gfZones(d),price=finite(d&&d.bid)?Number(d.bid):finite(d&&d.ask)?Number(d.ask):null;
  var quoteFresh=finite(d&&d.bid)&&finite(d&&d.ask)&&finite(d&&d.quoteAgeSeconds)&&Number(d.quoteAgeSeconds)>=-20&&Number(d.quoteAgeSeconds)<=35;
  lastLiveTick=quoteFresh?{bid:Number(d.bid),ask:Number(d.ask),seenAtMs:Date.now()}:null;
  lastAnalysis={ready:!!d.ok,gfStudy:true,studyData:d,requested:requestedSymbol,selectedTF:requestedTF,indicatorMode:requestedIndicator,
    symbol:d.symbol||requestedSymbol,triggerTF:requestedTF,setupTF:"H1",biasTF:"H4",chartBars:Array.isArray(d.chartBars)?d.chartBars:[],
    price,marketState:quoteFresh?"MT5 LIVE":"QUOTE UNVERIFIED",indicator:{activeZones:zones,history:[],stats:{total:0,wins:0,losses:0,pending:0}}};
  var eng=indicatorName(requestedIndicator);
  renderNewsWhy(d);
  chip("bridgeChip","good","● VANTAGE MT5");chip("engineChip",d.ok?"good":"warn","● "+eng);chip("marketChip",quoteFresh?"good":"warn",quoteFresh?"MT5 LIVE":"QUOTE CHECK");
  $("connectionNotice").className="notice "+(d.ok?"good":"bad");
  $("connectionNotice").innerHTML="<b>"+(d.symbol||requestedSymbol)+"</b> • "+eng+" • "+requestedTF+" • direct Vantage MT5 closed candles • "+(d.modelType||"RULE-BASED");
  $("price").textContent=finite(price)?px(price):"—";$("spread").textContent=finite(d.bid)&&finite(d.ask)?"Spread "+px(Number(d.ask)-Number(d.bid)):"—";
  $("source").textContent="Vantage • "+(d.symbol||requestedSymbol)+" • MT5_BRIDGE";
  $("signal").textContent=gfStatusLabel(d.status);$("signal").className=clsDir(dir);
  $("signalScore").textContent=p&&finite(p.score)?fmt(p.score,0)+"/100":d.mode==="ai"&&finite(d.analysis?.directionScore)?fmt(d.analysis.directionScore,0)+"/100":"RULE-BASED";$("signalStatus").textContent=d.canEnter?"ENTRY CONDITIONS MET":String(d.status||"WAIT");
  var h1=Number(d.h1Trend)||0,h4=Number(d.h4Trend)||0,cons=d.mode==="ai"?d.analysis?.allTfConsensus:null,bias=cons?Number(cons.direction)||0:(h1&&h1===h4?h1:0);
  $("biasState").textContent=bias?stateText(bias):(cons?"BALANCED":h1===0&&h4===0?"NEUTRAL":"MIXED");$("biasState").className=clsDir(bias);
  $("biasStrength").textContent=cons?("M1→D1 • BUY "+fmt(cons.buy,0)+" / SELL "+fmt(cons.sell,0)+" • Gap "+fmt(cons.gap,0)):("H1 "+stateText(h1)+" • H4 "+stateText(h4));
  $("biasEvent").textContent=d.mode==="ai"?(d.reasoning?("PRIMARY "+d.reasoning.primaryScenario+" • ALT "+d.reasoning.alternativeScenario+" • TF "+(d.analysis?.tfCoverage?.available??"—")+"/"+(d.analysis?.tfCoverage?.total??7)):(cons?("TF coverage "+(d.analysis?.tfCoverage?.available??"—")+"/"+(d.analysis?.tfCoverage?.total??7)+" • "+(d.researchScope||"ALL TF")):(d.researchScope||d.macroBias||"AI CONTEXT"))):d.mode==="news"?(d.macroBias||"NEWS CONTEXT"):"STRUCTURE ONLY";
  $("setupState").textContent=dir?stateText(dir):"WAIT";$("setupState").className=clsDir(dir);$("setupStrength").textContent=d.canEnter?"ENTRY READY":d.mode==="ai"&&/AI_(BUY|SELL)_WATCH/.test(String(d.status||""))?"WATCH":"WAIT";
  $("setupEvent").textContent=d.mode==="ai"?(p?.confirmationType||d.analysis?.trigger?.type||d.reasoning?.primaryScenario||d.analysis?.thesis?.type||"MARKET BRAIN WATCH"):(d.structureFlip?.type?(d.structureFlip.type+" • "+d.structureFlip.stage):d.structureFlipWatch?.type?(d.structureFlipWatch.type+" WATCH"):p?.confirmationType||"NO CLOSED TRIGGER");
  $("profile").textContent=d.mode==="ai"?("REASONING v1.30 • M1→D1 • Entry "+requestedTF):(requestedTF+" • H1 • H4");$("lastAge").textContent=finite(d.quoteAgeSeconds)?"Tick "+fmt(d.quoteAgeSeconds,0)+" s":"Tick N/A";$("resolvedSymbol").textContent=d.symbol||requestedSymbol;
  var aip=d.mode==="ai"?(p||d.candidatePlan):null;
  var entryLo=aip&&finite(aip.entryLow)?Number(aip.entryLow):p&&finite(p.entryLow)?Number(p.entryLow):d.mode==="study"&&finite(d.structureLevels?.reactionZoneLow)?Number(d.structureLevels.reactionZoneLow):null;
  var entryHi=aip&&finite(aip.entryHigh)?Number(aip.entryHigh):p&&finite(p.entryHigh)?Number(p.entryHigh):d.mode==="study"&&finite(d.structureLevels?.reactionZoneHigh)?Number(d.structureLevels.reactionZoneHigh):null;
  $("entry").textContent=finite(entryLo)&&finite(entryHi)?px(entryLo)+" — "+px(entryHi):"—";
  $("sl").textContent=aip&&finite(aip.invalidation)?px(aip.invalidation)+(p?"":" (WATCH)"):p&&finite(p.invalidation)?px(p.invalidation):d.mode==="study"&&finite(d.structureLevels?.invalidationLevel)?px(d.structureLevels.invalidationLevel):"—";
  var t1=aip&&finite(aip.tp1)?aip.tp1:p&&finite(p.tp1)?p.tp1:d.projectedTargets?.[0],t2=aip&&finite(aip.tp2)?aip.tp2:p&&finite(p.tp2)?p.tp2:d.projectedTargets?.[1];
  $("tp1").textContent=finite(t1)?px(t1):"—";$("tp2").textContent=finite(t2)?px(t2):"—";
  $("planBadge").textContent=d.canEnter?(dir>0?"BUY READY":"SELL READY"):d.mode==="ai"&&/AI_(BUY|SELL)_WATCH/.test(String(d.status||""))?(dir>0?"BUY WATCH":"SELL WATCH"):"WAIT";$("planBadge").className="tag "+clsDir(d.canEnter?dir:(d.mode==="ai"&&/AI_(BUY|SELL)_WATCH/.test(String(d.status||""))?dir:0));$("reasons").textContent=d.mode==="news"&&d.newsDecision?.summary?d.newsDecision.summary:(d.reason||"Wait for verified mode-specific confirmation.");
  var ctx=gfContextPosition(d);if($("pdTitle"))$("pdTitle").textContent=d.mode==="study"?"STRUCTURE RANGE":"ENTRY / CONTEXT";
  if(ctx){$("pdHigh").textContent=px(ctx.high);$("pdEq").textContent=px(ctx.eq);$("pdLow").textContent=px(ctx.low);$("pdPos").textContent=ctx.position}
  else if(p){$("pdHigh").textContent=px(p.entryHigh);$("pdEq").textContent=px((Number(p.entryLow)+Number(p.entryHigh))/2);$("pdLow").textContent=px(p.entryLow);$("pdPos").textContent=d.canEnter?"IN ENTRY ZONE":"OUTSIDE ENTRY ZONE"}
  else{$("pdHigh").textContent=$("pdEq").textContent=$("pdLow").textContent=$("pdPos").textContent="—"}
  $("watch").textContent=d.mode==="news"&&d.newsDecision?.headline?d.newsDecision.headline:(d.structureFlipWatch?.type?(d.structureFlipWatch.type+" WATCH @ "+px(d.structureFlipWatch.level)+" • "+d.structureFlipWatch.meaning):
    d.structureFlip?.type?(d.structureFlip.type+" "+d.structureFlip.stage+" @ "+px(d.structureFlip.level)):d.mode==="ai"?("PRIMARY "+(d.reasoning?.primaryScenario|| (dir>0?"BUY":dir<0?"SELL":"NO TRADE"))+" • "+(finite(d.analysis?.directionScore)?fmt(d.analysis.directionScore,0)+"/100 • ":"")+(d.reasoning?.decisionSummary?.whyPrimary||d.analysis?.thesis?.type||d.reason||"Reasoning market watch")):d.reason||"No active mode-specific zone.");
  renderZones(zones,lastLiveTick);renderStats({total:0,wins:0,losses:0,pending:0});
  if($("statsNote"))$("statsNote").textContent="GF LIVE STUDY • Current-state research only. Historical/forward performance is not inherited from legacy indicators.";
  $("vantageLink").href="https://secure.vantagemarketsea.com/web-trade/trade/"+encodeURIComponent(rootSymbol(requestedSymbol));
  $("chartTitle").textContent=(d.symbol||requestedSymbol)+" • "+eng+" • VANTAGE MT5";$("chartTag").textContent=requestedTF;
  if($("chartPage").classList.contains("on"))drawChart();
}
async function loadGFAnalysis(){
  var requestedSymbol=selectedSymbol,requestedTF=selectedTF,requestedIndicator=selectedIndicator,mode=gfMode();if(!mode)return;
  try{
    var d=await getJson("/api/study?symbol="+encodeURIComponent(requestedSymbol)+"&tf="+encodeURIComponent(requestedTF)+"&mode="+encodeURIComponent(mode));
    if(requestedSymbol!==selectedSymbol||requestedTF!==selectedTF||requestedIndicator!==selectedIndicator){setTimeout(loadAnalysis,0);return}
    renderGFDashboard(d,requestedSymbol,requestedTF,requestedIndicator);
  }catch(e){
    lastAnalysis=null;lastLiveTick=null;focusedZone=null;resetDashboard();renderZones({buy:[],sell:[]},null);renderStats({});
    if($("statsNote"))$("statsNote").textContent="GF LIVE STUDY • Data unavailable; no legacy result is substituted.";
    chip("engineChip","bad","GF STUDY ERROR");$("connectionNotice").className="notice bad";$("connectionNotice").textContent=e.message;clearChart();
  }
}
async function loadAnalysis(){
  if(!selectedSymbol||loading)return;
  if(/^gf-/.test(selectedIndicator)){
    loading=true;try{await loadGFAnalysis()}finally{loading=false}
    if($("gfStudyPage").classList.contains("on")&&window.GFStudy)window.GFStudy.load();
    return;
  }
  loading=true;
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
function zoneTradeEligible(x,d){
  var event=String(x&&x.sourceEvent||"").toUpperCase();
  if(x&&x.gfStudy)return x.gfEligible===true;
  if(/\bWATCH\b/.test(event))return false;
  if(selectedIndicator==="fund104"){
    var sig=lastAnalysis&&lastAnalysis.indicator&&lastAnalysis.indicator.latestSignal;
    return !!(sig&&sig.confirmed&&Number(sig.direction)===Number(d));
  }
  return true;
}
function zoneEntryState(x,d,tick){
  var lo=Number(x&&x.low),hi=Number(x&&x.high),q=quoteForZone(d,tick);
  var side=Number(d)>0?"ASK":"BID";
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||q===null)return {label:"QUOTE OFFLINE",live:false,inZone:false,eligible:false,quote:null,side:side,ready:false};
  var inZone=q>=Math.min(lo,hi)&&q<=Math.max(lo,hi),eligible=zoneTradeEligible(x,d),live=inZone&&eligible;
  return{label:live?"LIVE ENTRY":inZone?"IN ZONE • WATCH":"PENDING",live:live,inZone:inZone,eligible:eligible,quote:q,side:side,ready:true};
}
function renderZones(z,tick){
  var buy=z.buy||[],sell=z.sell||[];
  $("buyCount").textContent=buy.length;$("sellCount").textContent=sell.length;
  function html(a,d){return a.length?a.map(function(x,i){
    var st=zoneEntryState(x,d,tick),side=d>0?"buy":"sell";
    var action=st.live?'<button class="zoneAction" type="button" data-side="'+side+'" data-index="'+i+'" aria-label="View live entry setup on broker chart">LIVE TRADE • VIEW CHART ↗</button>':"";
    var retest=finite(x.currentRetests)?'<span class="sub">Retest '+x.currentRetests+'</span>':"";var score=finite(x.baseScore)?'<div class="sub">Score '+fmt(x.baseScore,0)+'%</div>':"";
    return '<div class="zone '+(st.live?("zoneLive "+side):"")+'"><div class="zoneTop"><b class="'+(d>0?"g":"r")+'">'+(d>0?"BUY":"SELL")+(x.swapped?" SWAP":"")+' • '+x.sourceEvent+'</b><span class="zoneStatus '+(st.live?("live "+side):st.inZone?"watch":st.ready?"pending":"offline")+'">'+(st.live?"● ":"")+st.label+'</span></div><div class="zonePrice">'+px(x.low)+" — "+px(x.high)+'</div><div class="zoneLiveLine"><span class="sub">LIVE '+st.side+' '+(finite(st.quote)?px(st.quote):"—")+'</span>'+retest+'</div>'+action+score+'</div>';
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
function mountBrokerChartTools(){
  if(!window.GFChartTools||!$("brokerChartTools"))return;
  GFChartTools.render("broker",$("brokerChartTools"),{
    timeframes:["M1","M5","M15","M30","H1","H4","D1"],currentTF:selectedTF,redraw:drawChart,
    onTF:function(tf){
      if(tf===selectedTF)return;
      selectedTF=tf;localStorage.setItem("gf_tf",selectedTF);$("tfSelect").value=selectedTF;
      focusedZone=null;lastLiveTick=null;window.GFStudy?.invalidate?.();loadAnalysis();
    }
  });
}
function drawChart(){
  clearChart();if(!lastAnalysis||!lastAnalysis.ready||!(lastAnalysis.chartBars||[]).length){$("chartInfo").textContent="No broker bars.";return}
  var bars=lastAnalysis.chartBars,ind=lastAnalysis.indicator||{};
  mountBrokerChartTools();
  chart=LightweightCharts.createChart($("chart"),{layout:{background:{color:"#07131c"},textColor:"#aab9c3"},grid:{vertLines:{color:"#10222e"},horzLines:{color:"#10222e"}},rightPriceScale:{borderColor:"#24404e"},timeScale:{borderColor:"#24404e",timeVisible:true,secondsVisible:false}});
  candleSeries=window.GFChartTools?GFChartTools.createMainSeries("broker",chart,bars):chart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",borderVisible:false,wickUpColor:"#31d6a4",wickDownColor:"#ff6079"});
  if(!window.GFChartTools)candleSeries.setData(bars.map(function(b){return {time:b.t,open:b.o,high:b.h,low:b.l,close:b.c}}));
  if(lastAnalysis.gfStudy){
    var d=lastAnalysis.studyData||{},p=d.confirmation||null,dir=gfDir(d),current=finite(lastAnalysis.price)?Number(lastAnalysis.price):bars[bars.length-1].c,lv=[];
    function addGFLevel(price,short,color,style){if(finite(price))lv.push({price:Number(price),short:short,color:color,style:style==null?2:style})}
    if(p){
      var col=dir>0?"#31d6a4":"#ff6079",prefix=d.mode==="ai"?"AI":d.mode==="news"?"NEWS":d.structureFlip?.type||"ENTRY";
      addGFLevel(p.entryLow,prefix+" L",col,2);addGFLevel(p.entryHigh,prefix+" H",col,2);addGFLevel(p.invalidation,"SL","#f2c75b",0);
      addGFLevel(p.tp1,"TP1","#71c3fa",2);addGFLevel(p.tp2,"TP2","#71c3fa",2);addGFLevel(p.tp3,"TP3","#71c3fa",2);
    }else if(d.mode==="study"&&d.structureLevels){
      var q=d.structureLevels,flip=d.structureFlipWatch?.type||"FLIP";
      addGFLevel(q.support,"SUP","#31d6a4",2);addGFLevel(q.resistance,"RES","#ff6079",2);addGFLevel(q.reactionZoneLow,"RX L","#e2c165",2);addGFLevel(q.reactionZoneHigh,"RX H","#e2c165",2);
      addGFLevel(q.breakoutLevel,flip+" WATCH","#71c3fa",2);addGFLevel(q.invalidationLevel,"INV","#f2c75b",0);(d.projectedTargets||[]).forEach(function(x,i){addGFLevel(x,"TP"+(i+1),"#71c3fa",2)});
    }
    var ranked=lv.slice().sort(function(a,b){return Math.abs(a.price-current)-Math.abs(b.price-current)});
    lv.forEach(function(x){var rank=ranked.indexOf(x),show=chartLabelMode==="all"||(chartLabelMode==="nearest"&&rank<2);candleSeries.createPriceLine({price:x.price,color:x.color,lineWidth:1,lineStyle:x.style,axisLabelVisible:show,title:show?x.short:""})});
    var markers=[];if(p&&finite(p.signalCandleTime)){var mt=Number(p.signalCandleTime)-Number(d.brokerUtcOffsetSeconds||0);if(bars.some(function(b){return Number(b.t)===mt}))markers.push({time:mt,position:dir>0?"belowBar":"aboveBar",color:dir>0?"#31d6a4":"#ff6079",shape:dir>0?"arrowUp":"arrowDown",text:d.structureFlip?.type?d.structureFlip.type+" BREAK":dir>0?"BUY CONFIRMED":"SELL CONFIRMED"})}
    if(candleSeries.setMarkers)candleSeries.setMarkers(markers);chart.timeScale().fitContent();
    if(window.GFChartTools)GFChartTools.register("broker",{chart:chart,main:candleSeries,bars:bars,tf:selectedTF,contextKey:(lastAnalysis.symbol||selectedSymbol)+"|"+selectedTF});
    $("chartInfo").textContent=(d.symbol||selectedSymbol)+" • "+d.tf+" • "+indicatorName(selectedIndicator)+" • Vantage MT5 • "+String(d.status||"WAIT").replaceAll("_"," ")+" • all lines retained; nearest labels only";
    return;
  }
  var allZones=[].concat((ind.activeZones&&ind.activeZones.buy)||[],(ind.activeZones&&ind.activeZones.sell)||[]);
  var sortedZones=allZones.slice().sort(function(a,b){var p=Number(lastAnalysis.price);return Math.abs((a.low+a.high)/2-p)-Math.abs((b.low+b.high)/2-p)});
  var zones=focusedZone?[focusedZone]:sortedZones.slice(0,10);
  zones.forEach(function(z,i){
    var d=z.currentDirection||z.direction||1,st=zoneEntryState(z,d,lastLiveTick),col=d>0?"#31d6a4":"#ff6079";
    // Default: label only the two nearest zones, using short B/S L/H titles so the live price stays readable.
    var showLabel=!!focusedZone||chartLabelMode==="all"||(chartLabelMode==="nearest"&&i<2);
    var side=d>0?"B":"S",live=st.live?"LIVE ":"";
    candleSeries.createPriceLine({price:Number(z.low),color:col,lineWidth:focusedZone?2:1,lineStyle:st.live?0:2,axisLabelVisible:showLabel,title:showLabel?live+side+" L":""});
    candleSeries.createPriceLine({price:Number(z.high),color:col,lineWidth:focusedZone?2:1,lineStyle:st.live?0:2,axisLabelVisible:showLabel,title:showLabel?live+side+" H":""});
  });
  var barTimes=new Set(bars.map(function(b){return b.t}));
  var markers=(ind.history||[]).filter(function(x){return barTimes.has(x.time)}).slice(-80).map(function(x){return {time:x.time,position:x.direction>0?"belowBar":"aboveBar",color:x.direction>0?"#f2c75b":"#ff6079",shape:x.direction>0?"arrowUp":"arrowDown",text:x.code+" "+Math.round(x.score)+"%"}});
  if(focusedZone && zoneEntryState(focusedZone,focusedZone.currentDirection,lastLiveTick).live && bars.length){
    markers.push({time:bars[bars.length-1].t,position:focusedZone.currentDirection>0?"belowBar":"aboveBar",color:focusedZone.currentDirection>0?"#31d6a4":"#ff6079",shape:"circle",text:"LIVE ENTRY • PRICE IN ZONE (NOT EXECUTED)"});
  }
  if(candleSeries.setMarkers)candleSeries.setMarkers(markers.sort(function(a,b){return a.time-b.time}));
  chart.timeScale().fitContent();if(window.GFChartTools)GFChartTools.register("broker",{chart:chart,main:candleSeries,bars:bars,tf:selectedTF,contextKey:(lastAnalysis.symbol||selectedSymbol)+"|"+selectedTF});$("chartInfo").textContent=(lastAnalysis.symbol||selectedSymbol)+" • "+lastAnalysis.triggerTF+" • Vantage MT5 • "+(lastAnalysis.marketState||"")+" • PENDING = entry area; LIVE = current quote within area, NOT broker order";
}
async function init(){
  await checkBridge();await loadSymbols(false);
  setInterval(checkBridge,30000);
  setInterval(refreshLiveZoneEntry,5000);
  document.addEventListener("visibilitychange",function(){if(!document.hidden)refreshLiveZoneEntry()});
  setInterval(function(){
    // V8 has lazy broker requests with CDN caching; do not poll an extra V7 dashboard while V8 analytics/news is in view.
    var v8Active=document.querySelector("#v8History.on,#v8Performance.on,#v8Evidence.on,#v8News.on,#gfStudyPage.on");
    if(selectedSymbol&&!v8Active)loadAnalysis();
  },30000);
}
init();

function tvSymbol(s){
  var r=rootSymbol(s).toUpperCase();
  if(r==="XAUUSD247")return "THINKMARKETS:XAUUSD247"; // TradingView independent ThinkMarkets reference requested by user; NOT the Vantage signal feed.
  if(r==="XAUUSD")return "OANDA:XAUUSD";
  if(r==="XAGUSD")return "OANDA:XAGUSD";
  if(/^(BTC|ETH|SOL|XRP|LTC|BCH)USD$/.test(r))return "COINBASE:"+r;
  if(/^[A-Z]{6}$/.test(r))return "FX:"+r;
  return r;
}
function tvInterval(tf){
  return ({M1:"1",M5:"5",M15:"15",M30:"30",H1:"60",H4:"240",D1:"D"})[tf]||"5";
}
var tvNativeChart=null,tvReqSeq=0;
async function renderTradingView(tfOverride){
  var el=$("tvWrap");if(!el||!selectedSymbol||!$("tvPage")?.classList.contains("on"))return;
  var tf=tfOverride||localStorage.getItem("gf_tv_chart_tf")||selectedTF;if(!["M1","M5","M15","M30","H1","H4","D1","W1","MN1"].includes(tf))tf=selectedTF;localStorage.setItem("gf_tv_chart_tf",tf);
  var token=++tvReqSeq,symbol=selectedSymbol,sym=tvSymbol(symbol),interval=tvInterval(tf);
  if(tvNativeChart){try{tvNativeChart.remove()}catch(e){}tvNativeChart=null}
  // Official third-party iframe may be blocked by browser CSP, extensions or
  // provider policies. ALWAYS display independently fetched Vantage broker chart.
  var external="https://www.tradingview.com/chart/?symbol="+encodeURIComponent(sym);
  el.innerHTML='<div class="tvBar"><b>VANTAGE BROKER CHART • '+symbol.replace(/</g,"&lt;")+' • '+tf+'</b>'+
    '<a class="primary mini" href="'+external+'" target="_blank" rel="noopener noreferrer">OPEN TRADINGVIEW ↗</a></div>'+
    '<div id="tvChartTools"></div>'+
    '<p class="sub" id="tvBrokerNote">Loading direct broker candles. TradingView prices may differ from Vantage.</p>'+
    '<div class="tvBrokerChart" id="tvBrokerChart" role="img" aria-label="Vantage verified OHLC candlestick chart"></div>'+
    '<div class="notice info tvExternalNotice"><b>TradingView reference: '+sym.replace(/</g,"&lt;")+'</b> • For XAUUSD247 this is ThinkMarkets Spot Gold Continuous. The embedded TradingView iframe is intentionally not shown because browser/provider policy can render it as a blank box. OPEN TRADINGVIEW uses the same reference symbol. GoldFlow calculations and signals continue to use Vantage MT5 only.</div>';
  var chartNode=$("tvBrokerChart");
  if(window.GFChartTools&&$("tvChartTools"))GFChartTools.render("tv",$("tvChartTools"),{timeframes:["M1","M5","M15","M30","H1","H4","D1","W1","MN1"],currentTF:tf,redraw:function(){renderTradingView(tf)},onTF:function(nextTf){renderTradingView(nextTf)}});
  try{
   var feed=await getJson("/api/bars?symbol="+encodeURIComponent(symbol)+"&tf="+encodeURIComponent(tf)+"&limit=1500");
   if(token!==tvReqSeq||symbol!==selectedSymbol||tf!==(localStorage.getItem("gf_tv_chart_tf")||selectedTF)||!$("tvPage")?.classList.contains("on"))return;
   if(!feed.ok||!Array.isArray(feed.bars)||feed.bars.length<20)throw Error(feed.error||"Insufficient broker candles");
   var offset=Number(feed.brokerUtcOffsetSeconds);
   if(!Number.isFinite(offset))throw Error("Broker time offset unavailable");
   var bars=feed.bars.map(function(b){return {time:Number(b.t)-offset,open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c)}})
     .filter(function(b){return Number.isFinite(b.time)&&[b.open,b.high,b.low,b.close].every(Number.isFinite)})
     .sort(function(a,b){return a.time-b.time});
   if(bars.length<20)throw Error("Insufficient valid broker OHLC");
   $("tvBrokerNote").textContent="SOURCE: Vantage MT5 • "+(feed.symbol||symbol)+" • "+tf+
     " • "+bars.length+" candles • direct broker data (not TradingView feed).";
   if(typeof LightweightCharts==="undefined"){
    if(window.GFOHLC?.render(chartNode,bars))$("tvBrokerNote").textContent+=" • First-party SVG OHLC fallback (external chart library blocked).";
    else chartNode.textContent="Broker candles are available, but local chart rendering failed. Latest close: "+bars.at(-1).close;
    return;
   }
   tvNativeChart=LightweightCharts.createChart(chartNode,{height:350,width:Math.max(280,chartNode.clientWidth),
     layout:{background:{color:"#07131c"},textColor:"#b6cbd7"},
     grid:{vertLines:{color:"#10222e"},horzLines:{color:"#10222e"}},
     rightPriceScale:{borderColor:"#24404e"},timeScale:{borderColor:"#24404e",timeVisible:true}});
   var series=window.GFChartTools?GFChartTools.createMainSeries("tv",tvNativeChart,bars):tvNativeChart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",borderVisible:false,
     wickUpColor:"#31d6a4",wickDownColor:"#ff6079"});
   if(!window.GFChartTools)series.setData(bars);tvNativeChart.timeScale().fitContent();
   if(window.GFChartTools)GFChartTools.register("tv",{chart:tvNativeChart,main:series,bars:bars,tf:tf,contextKey:symbol+"|"+tf});
  }catch(e){
   if(token===tvReqSeq){$("tvBrokerNote").textContent="Broker chart unavailable: "+String(e.message||e)+
     ". TradingView can still open in a separate tab.";if(chartNode)chartNode.textContent="Unable to load authenticated Vantage OHLC."}
  }
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
  if(card.status==="SECONDARY_MIRROR")return '<span class="y">BLS DATA VIA FRED MIRROR</span>';
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
    var primaryReady=j.quality?.strictPrimaryReady!==undefined?j.quality.strictPrimaryReady:(j.quality?.fresh===j.quality?.total&&!(j.quality?.errors||[]).length);
    $("macroQuality").textContent=(j.quality?.available||0)+"/"+(j.quality?.total||0)+" AVAILABLE • "+(j.quality?.fresh||0)+" FRESH"+(primaryReady?" • PRIMARY OK":" • PRIMARY DEGRADED");
    $("macroQuality").className="tag "+(primaryReady?"g":"y");
    var issues=[...(j.quality?.errors||[]),...(j.quality?.notes||[])];
    if(j.quality?.secondaryMirror?.length)issues.unshift("SECONDARY MIRROR: "+j.quality.secondaryMirror.join(", ")+" supplied through FRED (BLS-origin data; DIRECT BLS REMAINS BLOCKED). Not primary-source verified.");
    if(j.quality?.unavailable?.length)issues.push("Unavailable: "+j.quality.unavailable.join(", "));
    if(j.quality?.stale?.length)issues.push("Stale / date unavailable: "+j.quality.stale.join(", "));
    $("macroNotice").className=issues.length?"notice info":"notice good";
    $("macroNotice").textContent=(primaryReady?(j.quality?.primarySourceHealth==="RECOVERED_OFFICIAL_VIA_LOCAL_BRIDGE"?"OFFICIAL BLS RECOVERED VIA LOCAL PC • ":"OFFICIAL DATA VERIFIED • "):"PARTIAL / PRIMARY DEGRADED • ")+
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
