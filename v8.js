"use strict";
(function(){
  var state={history:null,performance:null,evidence:null,news:null,locale:"en",en:{},dict:{},voices:[],speech:null,lastSpeechText:"",tvReady:false,evidenceChart:null,lastFocus:"history",historyIndicator:null,historyAnalytics:null,historyAnalyticsToken:0};
  var SUPPORTED=["ms","en","id","zh-CN","zh-TW","ar","hi","es","fr","de","pt","ru","ja","ko","tr","th","vi","fil","ur","bn","ta","it"];
  var NAMES={"ms":"Bahasa Melayu","en":"English","id":"Bahasa Indonesia","zh-CN":"简体中文","zh-TW":"繁體中文","ar":"العربية","hi":"हिन्दी","es":"Español","fr":"Français","de":"Deutsch","pt":"Português","ru":"Русский","ja":"日本語","ko":"한국어","tr":"Türkçe","th":"ไทย","vi":"Tiếng Việt","fil":"Filipino","ur":"اردو","bn":"বাংলা","ta":"தமிழ்","it":"Italiano"};
  var HISTORY_CATALOG=[
    {id:"105",label:"MTF Research v1.05",historical:true},
    {id:"103",label:"MTF Research v1.03",historical:true},
    {id:"pvt",label:"PVT v1.02",historical:true},
    {id:"pvtchart101",label:"PVT Chart Confluence XAU v1.01 • MQ5 Source",historical:true},
    {id:"pattern132",label:"Pattern Zone Tutor v1.32 • MQ5 Verified",historical:true},
    {id:"snd107",label:"SND / SNR / SBR / RBS v1.07",historical:true},
    {id:"owl101",label:"OWL Style Research v1.01",historical:true},
    {id:"fund104",label:"Fund Structure A v1.04 — Web Study",historical:true,validationOnly:true},
    {id:"gf-ai",label:"GF-AI Live Analyst v1.60",historical:true,note:"Own-engine closed-candle replay"},
    {id:"gf-news",label:"GF-News Impact Pro",historical:true,forwardOnly:true,note:"Forward archive only; historical macro/news is not backfilled"},
    {id:"gf-study",label:"GF-Market Study Pro",historical:true,note:"Own-engine closed-candle replay"}
  ];
  var HISTORY_IDS=HISTORY_CATALOG.filter(function(x){return x.historical}).map(function(x){return x.id});
  function historyMeta(id){return HISTORY_CATALOG.find(function(x){return x.id===String(id||"").toLowerCase()})||{id:String(id||""),label:String(id||"UNKNOWN"),historical:false}}
  function setHistoryIndicator(id){
    var x=String(id||"").toLowerCase();if(!HISTORY_IDS.includes(x))x="105";
    state.historyIndicator=x;
    ["v8HistoryIndicator","v8PerformanceIndicator"].forEach(function(k){if($(k)&&$(k).value!==x)$(k).value=x});
    return x;
  }
  var $=function(id){return document.getElementById(id)};
  function safe(v){return String(v==null?"":v).replace(/[&<>"']/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]})}
  function finite(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))}
  function t(k){return state.dict[k]||state.en[k]||k}
  function number(v,d){return finite(v)?Number(v).toLocaleString(state.locale,{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d}):"N/A"}
  function signed(v,d){if(!finite(v))return "N/A";return (Number(v)>0?"+":"")+number(v,d==null?2:d)}
  function money(v){return finite(v)?signed(v,2)+" USD":"N/A"}
  function dt(v){if(!v)return "N/A";var x=new Date(v);return Number.isNaN(x.getTime())?"N/A":new Intl.DateTimeFormat(state.locale,{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(x)+" MYT"}
  function historyIndicator(){
    if(HISTORY_IDS.includes(String(state.historyIndicator||"").toLowerCase()))return String(state.historyIndicator).toLowerCase();
    var sel=String(window.selectedIndicator||"105").toLowerCase();
    return setHistoryIndicator(HISTORY_IDS.includes(sel)?sel:"105");
  }
  function historyContext(){
    return [window.selectedSymbol||$("symbolSelect")?.value||"XAUUSD",window.selectedTF||"M5",historyIndicator()].join("|");
  }
  function uriForIndicator(indicator,params){
    return "symbol="+encodeURIComponent(window.selectedSymbol||document.getElementById("symbolSelect")?.value||"XAUUSD")+
      "&tf="+encodeURIComponent(window.selectedTF||"M5")+"&indicator="+encodeURIComponent(indicator)+(params||"");
  }
  function uri(params){return uriForIndicator(historyIndicator(),params)}
  async function json(url){var r=await fetch(url,{cache:"no-store"}),j=await r.json();if(!r.ok||j.ok===false)throw Error(j.error||("HTTP "+r.status));return j}
  function notice(id,msg,bad){if($(id)){$(id).className=bad?"notice bad":"notice info";$(id).textContent=msg}}
  function stat(label,value,detail){
    return '<div class="v8Metric"><small>'+safe(label)+'</small><strong>'+safe(value)+'</strong>'+(detail?'<span>'+safe(detail)+'</span>':"")+'</div>';
  }
  function outcomeStyle(o){return ["TP1","TP2","TP3","BE_POSITIVE","TRAILING"].includes(o)?"g":o==="SL"?"r":"y"}
  function unitText(r){return /XAU|XAG/.test(r.symbolResolved||"")?"USD/oz (quote move)":(r.currencyProfit||"symbol quote")+" price move"}
  function metricTotal(st,key,symbol){
    var obj=st?.[key]||{},sym=String(symbol||"");
    if(sym&&obj[sym]&&finite(obj[sym].total))return Number(obj[sym].total);
    var vals=Object.keys(obj).map(function(k){return obj[k]}).filter(function(x){return finite(x?.total)});
    return vals.length===1?Number(vals[0].total):null;
  }
  function metricPart(st,key,symbol,part){
    var obj=st?.[key]||{},sym=String(symbol||""),row=sym?obj[sym]:null;
    if(!row){var vals=Object.values(obj);if(vals.length===1)row=vals[0]}
    return row&&finite(row[part])?Number(row[part]):null;
  }
  function netClass(v){return !finite(v)?"y":Number(v)>0?"g":Number(v)<0?"r":"y"}
  function dayStatus(st,symbol){
    var p=metricTotal(st,"pipsBySymbol",symbol);
    if(!finite(p))return "N/A";
    return Number(p)>0?"PROFIT DAY":Number(p)<0?"LOSS DAY":"FLAT DAY";
  }
  function tpTrailCount(st){return Number(st?.outcomes?.TP1||0)+Number(st?.outcomes?.TP2||0)+Number(st?.outcomes?.TP3||0)+Number(st?.outcomes?.TRAILING||0)}
  function wrClass(st){
    if(!finite(st?.strictWinRate))return "y";
    var n=Number(st?.strictDenominator||0),w=Number(st.strictWinRate);
    if(n<5)return "y";
    return w>=70?"g":w<50?"r":"y";
  }
  function resultStats(st,symbol){
    if(!st)return "";
    var winP=metricPart(st,"pipsBySymbol",symbol,"winTotal"),lossP=metricPart(st,"pipsBySymbol",symbol,"lossTotal"),netP=metricTotal(st,"pipsBySymbol",symbol);
    return stat(t("strictWR"),finite(st.strictWinRate)?number(st.strictWinRate,1)+"%":"N/A",t("strictFormula"))+
      stat(t("positive"),number(st.positive,0),t("tpTrailingBePositive"))+
      stat(t("negative"),number(st.negative,0),"SL")+
      stat("WIN PIP",signed(winP,1),"jumlah semua TP / trailing / BE+")+
      stat("SL PIP",signed(lossP,1),"jumlah kerugian SL")+
      stat("NET PIP",signed(netP,1),finite(netP)?(Number(netP)>0?"PROFIT":"LOSS / FLAT"):"N/A")+
      stat("NET POINT",signed(metricTotal(st,"pointsBySymbol",symbol),0),"selected symbol only")+
      stat(t("totalR"),signed(st.totalR,2),"WIN R "+signed(st.winR,2)+" • LOSS R "+signed(st.lossR,2))+
      stat(t("beZero"),number(st.beZero,0),t("excludedWR"))+
      stat(t("ambiguous"),number(st.ambiguous,0),t("intrabarUnknown"))+
      stat(t("grossPL"),money(st.grossPLUSD),"0.01 lot estimate when broker metadata supports it")+
      stat(t("legacyWR"),finite(st.legacyWinRate)?number(st.legacyWinRate,1)+"%":"N/A","includes BE0");
  }
  function analyticsQuery(direction,from,to){
    var q="&period=day&direction="+encodeURIComponent(direction||"ALL");
    if(from)q+="&from="+encodeURIComponent(from);
    if(to)q+="&to="+encodeURIComponent(to);
    return q;
  }
  async function mapLimit(items,limit,worker){
    var out=new Array(items.length),next=0;
    async function run(){while(true){var i=next++;if(i>=items.length)return;out[i]=await worker(items[i],i)}}
    await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return out;
  }
  function analyticsRow(meta,st,symbol,error,data){
    if(error)return '<tr><td><b>'+safe(meta.label)+'</b></td><td colspan="14" class="r">UNAVAILABLE • '+safe(error)+'</td></tr>';
    if(meta.forwardOnly&&String(data?.historyMode||"").indexOf("FORWARD")>=0&&!Number(st?.totalSignals||0)){
      return '<tr><td><b>'+safe(meta.label)+'</b><br><small>OWN ENTRY / SL / TP1 / TP2 / TP3</small></td>'+
        '<td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td><td>0</td>'+
        '<td class="y"><b>WAIT ARCHIVE</b><br><small>n=0</small></td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td><td>—</td></tr>';
    }
    var tp=tpTrailCount(st),be=Number(st?.outcomes?.BE_POSITIVE||0),den=Number(st?.strictDenominator||0),
      winP=metricPart(st,"pipsBySymbol",symbol,"winTotal"),lossP=metricPart(st,"pipsBySymbol",symbol,"lossTotal"),netP=metricTotal(st,"pipsBySymbol",symbol);
    return '<tr><td><b>'+safe(meta.label)+'</b>'+(meta.validationOnly?'<br><small>NATIVE VALIDATION • NORMALIZED TRADE PLAN</small>':'')+'</td>'+
      '<td>'+number(st?.totalSignals,0)+'</td><td class="g">'+number(st?.positive,0)+'</td><td>'+number(tp,0)+'</td><td>'+number(be,0)+'</td>'+
      '<td class="r">'+number(st?.negative,0)+'</td><td>'+number(st?.beZero,0)+'</td><td>'+number(st?.ambiguous,0)+'</td>'+
      '<td class="'+wrClass(st)+'"><b>'+(finite(st?.strictWinRate)?number(st.strictWinRate,1)+"%":"N/A")+'</b><br><small>n='+number(den,0)+'</small></td>'+
      '<td class="g">'+signed(winP,1)+'</td><td class="r">'+signed(lossP,1)+'</td><td class="'+netClass(netP)+'"><b>'+signed(netP,1)+'</b></td>'+
      '<td class="'+netClass(metricTotal(st,"pointsBySymbol",symbol))+'">'+signed(metricTotal(st,"pointsBySymbol",symbol),0)+'</td>'+
      '<td>'+signed(st?.totalR,2)+'</td><td>'+money(st?.grossPLUSD)+'</td></tr>';
  }
  function renderIndicatorComparison(results,symbol){
    if(!$("v8IndicatorComparison"))return;
    var rows=(results||[]).map(function(x){return analyticsRow(historyMeta(x.id),x.data?.summary,symbol,x.error,x.data)});
    $("v8IndicatorComparison").innerHTML='<table class="v8Table v8WideTable"><thead><tr><th>INDICATOR</th><th>SIGNAL</th><th>WIN</th><th>TP/TR</th><th>BE+</th><th>SL</th><th>BE0</th><th>AMBIG</th><th>STRICT WR</th><th>WIN PIP</th><th>SL PIP</th><th>NET PIP</th><th>NET POINT</th><th>ΣR</th><th>GROSS USD*</th></tr></thead><tbody>'+rows.join("")+'</tbody></table>'+
      '<p class="v8Footnote">Semua signal directional mesti ada ENTRY + SL + TP1 + TP2 + TP3. GF-AI dan GF-Market Study menggunakan plan native engine masing-masing semasa replay; GF-News tidak backfill macro/news lama dan menunggu forward archive. WIN PIP + SL PIP = NET PIP. Strict WR tidak termasuk BE0 dan AMBIGUOUS.</p>';
  }
  function renderDailySummary(data){
    if(!$("v8DailySummary"))return;
    var meta=historyMeta(historyIndicator()),symbol=data?.symbol||state.history?.symbolResolved||"";
    if($("v8DailyIndicatorLabel"))$("v8DailyIndicatorLabel").textContent=meta.label+" • "+symbol+" • "+(data?.tf||window.selectedTF||"");
    var arr=(data?.groups||[]).slice().reverse();
    $("v8DailySummary").innerHTML=arr.length?'<table class="v8Table v8WideTable"><thead><tr><th>DATE (MYT)</th><th>DAY RESULT</th><th>SIGNAL</th><th>WIN</th><th>TP/TR</th><th>BE+</th><th>SL</th><th>BE0</th><th>AMBIG</th><th>STRICT WR</th><th>WIN PIP</th><th>SL PIP</th><th>NET PIP</th><th>NET POINT</th><th>ΣR</th><th>GROSS USD*</th></tr></thead><tbody>'+
      arr.map(function(st){var netP=metricTotal(st,"pipsBySymbol",symbol),day=dayStatus(st,symbol);return '<tr><td><b>'+safe(st.period)+'</b></td><td class="'+netClass(netP)+'"><b>'+day+'</b></td><td>'+number(st.totalSignals,0)+'</td><td class="g">'+number(st.positive,0)+'</td>'+
        '<td>'+number(tpTrailCount(st),0)+'</td><td>'+number(st.outcomes?.BE_POSITIVE||0,0)+'</td><td class="r">'+number(st.negative,0)+'</td><td>'+number(st.beZero,0)+'</td><td>'+number(st.ambiguous,0)+'</td>'+
        '<td class="'+wrClass(st)+'"><b>'+(finite(st.strictWinRate)?number(st.strictWinRate,1)+"%":"N/A")+'</b><br><small>n='+number(st.strictDenominator||0,0)+'</small></td>'+
        '<td class="g">'+signed(metricPart(st,"pipsBySymbol",symbol,"winTotal"),1)+'</td><td class="r">'+signed(metricPart(st,"pipsBySymbol",symbol,"lossTotal"),1)+'</td>'+
        '<td class="'+netClass(netP)+'"><b>'+signed(netP,1)+'</b></td><td class="'+netClass(metricTotal(st,"pointsBySymbol",symbol))+'">'+signed(metricTotal(st,"pointsBySymbol",symbol),0)+'</td>'+
        '<td>'+signed(st.totalR,2)+'</td><td>'+money(st.grossPLUSD)+'</td></tr>'}).join("")+'</tbody></table>':
      '<p>'+t("noSignalsInWindow")+'</p>';
  }
  async function loadHistoryAnalytics(filters){
    var token=++state.historyAnalyticsToken,selected=historyIndicator(),symbol=window.selectedSymbol||$("symbolSelect")?.value||"XAUUSD";
    if($("v8IndicatorComparison"))$("v8IndicatorComparison").innerHTML='<p class="sub">Mengira win rate setiap indicator daripada broker candle window yang sama…</p>';
    if($("v8DailySummary"))$("v8DailySummary").innerHTML='<p class="sub">Mengira jumlah TP/SL, R, pip dan point setiap hari…</p>';
    var extra=analyticsQuery(filters?.direction,filters?.from,filters?.to);
    var results=await mapLimit(HISTORY_IDS,1,async function(id){
      try{return {id,data:await json("/api/performance?"+uriForIndicator(id,extra))}}
      catch(e){return {id,error:String(e.message||e)}}
    });
    if(token!==state.historyAnalyticsToken)return;
    state.historyAnalytics=results;renderIndicatorComparison(results,symbol);
    var pick=results.find(function(x){return x.id===selected&&x.data});
    if(pick)renderDailySummary(pick.data);
    else if($("v8DailySummary"))$("v8DailySummary").innerHTML='<p class="r">Daily summary unavailable for '+safe(historyMeta(selected).label)+'.</p>';
  }
  function key(r){return r?.signalId||""}
  function explainText(r){
    if(!r)return t("noSelection");
    var dir=r.direction>0?t("buy"):t("sell");
    return [
      t("researchOnly"),
      t("explainIntro")+" "+dir+" "+r.symbolResolved+" "+r.tf+".",
      t("entry")+" "+r.entry+". SL "+r.originalSL+". TP1 "+r.tp1+".",
      t("technicalReasons")+" "+(r.reasons||[]).join(", ")+".",
      t("replayOutcome")+" "+r.outcome+". "+t("priceMove")+" "+signed(r.priceMove,4)+".",
      t("historicalWarning"),
      t("disclaimer")
    ].join(" ");
  }
  function speechStop(){if("speechSynthesis" in window)window.speechSynthesis.cancel();state.speech=null}
  function speechPlay(txt){
    if(!("speechSynthesis" in window)||typeof SpeechSynthesisUtterance==="undefined"){window.alert(t("voiceUnavailable"));return}
    var spoken=String(txt||"");if(!spoken)return;state.lastSpeechText=spoken;
    speechStop();var u=new SpeechSynthesisUtterance(spoken);u.lang=state.locale;
    u.rate=Number($("gfSpeechRate")?.value||1);
    var vs=window.speechSynthesis.getVoices()||[];
    var exact=vs.find(function(v){return v.lang.toLowerCase()===state.locale.toLowerCase()});
    var near=vs.find(function(v){return v.lang.toLowerCase().split("-")[0]===state.locale.toLowerCase().split("-")[0]});
    if(exact||near){u.voice=exact||near;u.lang=u.voice.lang}
    else if(vs.length){var fallback=vs.find(function(v){return v.lang.toLowerCase().startsWith("en")})||vs[0];u.voice=fallback;u.lang=fallback.lang;
      if($("v8HistoryStatus"))$("v8HistoryStatus").textContent=t("voiceFallback")+" "+fallback.lang;
    }
    state.speech=u;window.speechSynthesis.speak(u);
  }
  async function applyLocale(id){
    var code=SUPPORTED.includes(id)?id:"en";
    state.locale=code;
    try{var r=await fetch("/locales/"+encodeURIComponent(code)+".json",{cache:"force-cache"});state.dict=r.ok?(await r.json()).strings||{}:{}}
    catch(e){state.dict={}}
    document.documentElement.lang=code;
    document.documentElement.dir=["ar","ur"].includes(code)?"rtl":"ltr";
    try{localStorage.setItem("gf_v8_locale",code)}catch(e){}
    document.querySelectorAll("[data-i18n]").forEach(function(el){el.textContent=t(el.dataset.i18n)});
    if(state.history)renderHistory(state.history);
    if(state.historyAnalytics){renderIndicatorComparison(state.historyAnalytics,window.selectedSymbol||$("symbolSelect")?.value||"");var hp=state.historyAnalytics.find(function(x){return x.id===historyIndicator()&&x.data});if(hp)renderDailySummary(hp.data)}
    if(state.performance)renderPerformance(state.performance);
    if(state.news)renderNews(state.news);
    if(liveNewsCache)renderWorldNews(liveNewsCache);
    if(blogCache)renderBlog();
    if(state.evidence)renderEvidence(state.evidence);
  }
  async function initLocale(){
    try{var r=await fetch("/locales/en.json");if(r.ok)state.en=(await r.json()).strings||{}}catch(e){}
    var saved="";try{saved=localStorage.getItem("gf_v8_locale")||""}catch(e){}
    var want=saved||navigator.language||"en";if(!SUPPORTED.includes(want))want=SUPPORTED.find(function(x){return x.split("-")[0]===want.split("-")[0]})||"en";
    $("gfLocale").innerHTML=SUPPORTED.map(function(x){return '<option value="'+safe(x)+'">'+safe(NAMES[x])+"</option>"}).join("");
    $("gfLocale").value=want;await applyLocale(want);
  }
  async function loadHistory(force){
    var status=$("v8HistoryStatus"),rows=$("v8Rows");
    if(!status||!rows)return;
    setHistoryIndicator($("v8HistoryIndicator")?.value||historyIndicator());
    notice("v8HistoryStatus",t("loadingBroker"));
    try{
      var filters={from:$("v8Start")?.value||"",to:$("v8End")?.value||"",direction:$("v8Direction")?.value||"ALL"};
      var params="&limit=160";
      if(filters.from)params+="&from="+encodeURIComponent(filters.from);
      if(filters.to)params+="&to="+encodeURIComponent(filters.to);
      params+="&direction="+encodeURIComponent(filters.direction);
      var data=await json("/api/history?"+uri(params));
      state.history=data;state.historyContext=historyContext();renderHistory(data);
      fillEvidenceChoices(data.rows||[]);
      loadHistoryAnalytics(filters).catch(function(e){
        if($("v8IndicatorComparison"))$("v8IndicatorComparison").innerHTML='<p class="r">Indicator comparison failed: '+safe(e.message||e)+'</p>';
        if($("v8DailySummary"))$("v8DailySummary").innerHTML='<p class="r">Daily summary failed: '+safe(e.message||e)+'</p>';
      });
    }catch(e){
      state.history=null;rows.innerHTML="";$("v8Summary").innerHTML="";
      if($("v8IndicatorComparison"))$("v8IndicatorComparison").innerHTML="";
      if($("v8DailySummary"))$("v8DailySummary").innerHTML="";
      notice("v8HistoryStatus",e.message,true);
    }
  }
  function historyRow(r){
    var direct=r.direction>0?t("buy"):t("sell"),out=r.outcome||"PENDING",valid=r.outcome!=="VALID_ONLY";
    var pl=r.grossPLUSD==null?t("notAvailable"):money(r.grossPLUSD);
    return '<details class="v8Record" data-id="'+safe(key(r))+'"><summary class="v8RecordTop">'+
      '<span><b>'+safe(dt(r.signalCandleCloseUTC))+'</b><small>'+safe(r.symbolResolved)+" • "+safe(r.tf)+" • "+safe(r.indicatorId)+'</small></span>'+
      '<span class="'+(r.direction>0?"g":"r")+'"><b>'+safe(direct)+'</b><small>'+safe(r.code)+" • "+number(r.score,0)+"%</small></span>"+
      '<span><b class="'+outcomeStyle(out)+'">'+safe(out)+'</b><small>'+t("simulatedOutcome")+'</small></span>'+
      '<span><b class="'+(finite(r.priceMove)?Number(r.priceMove)>=0?"g":"r":"y")+'">'+signed(r.priceMove,4)+'</b><small>'+safe(unitText(r))+'</small></span>'+
      '<span><b>'+signed(r.signedPips,1)+'</b><small>'+t("pips")+'</small></span>'+
      '<span><b>'+signed(r.signedPoints,0)+'</b><small>'+t("points")+'</small></span>'+
      '</summary><div class="v8RecordDetails"><div class="v8Plan">'+
      stat(t("entry"),number(r.entry,5))+stat("SL",number(r.originalSL,5))+stat("TP1",number(r.tp1,5))+stat("TP2",number(r.tp2,5))+
      stat("TP3",number(r.tp3,5))+stat("BE RULE",r.managementPlan&&finite(r.managementPlan.beTriggerR)?"Trigger +"+number(r.managementPlan.beTriggerR,2)+"R":"N/A",r.managementPlan&&finite(r.managementPlan.beLockR)?"Lock +"+number(r.managementPlan.beLockR,2)+"R":"")+
      stat("TRAIL RULE",r.managementPlan&&finite(r.managementPlan.trailTriggerR)?"Start +"+number(r.managementPlan.trailTriggerR,2)+"R":"N/A",r.managementPlan&&finite(r.managementPlan.trailDistanceR)?"Distance "+number(r.managementPlan.trailDistanceR,2)+"R"+(finite(r.managementPlan.trailStepR)?" • Step "+number(r.managementPlan.trailStepR,2)+"R":""):"")+
      stat("PLAN SOURCE",String(r.planOrigin||"").indexOf("PVT_CHART_CONFLUENCE")===0?"NATIVE PVT v1.01 PLAN":r.nativeTargetDefined?"NATIVE TP + HISTORY MGMT":"NORMALIZED 1R/2R/3R",r.planOrigin||"")+
      stat(t("exit"),number(r.exitPrice,5))+stat(t("riskToSL"),signed(r.riskPoints,0)+" points")+
      stat(t("grossPL"),pl,"0.01 lot • excludes costs")+stat(t("totalR"),signed(r.rMultiple,2))+
      '</div><p><b>'+t("technicalReasons")+':</b> '+safe((r.reasons||[]).join(" • ")||"N/A")+'</p>'+
      '<p class="sub">'+t("replayRule")+": "+safe(r.exitRule||"N/A")+". "+safe((r.dataQuality||[]).join(", "))+'</p>'+
      '<div class="v8RowActions"><button type="button" class="v8ProofBtn" data-id="'+safe(key(r))+'">'+t("viewEvidence")+'</button>'+
      '<button type="button" class="v8SpeakBtn" data-id="'+safe(key(r))+'">🔊 '+t("readExplanation")+'</button></div>'+
      '<p class="v8Footnote">'+t("historicalWarning")+'</p></div></details>';
  }
  function renderHistory(data){
    if(!data)return;
    $("v8HistoryStatus").textContent=data.symbolResolved+" • "+data.tf+" • "+historyMeta(historyIndicator()).label+" • "+data.availableSignals+" "+t("availableSignals")+" • "+t("brokerWindow")+" "+dt(data.dataWindow?.startUTC)+" – "+dt(data.dataWindow?.endUTC);
    $("v8Summary").innerHTML=resultStats(data.stats,data.symbolResolved);
    $("v8Rows").innerHTML=data.rows?.length?data.rows.map(historyRow).join(""):"<p>"+t("noSignalsInWindow")+"</p>";
    $("v8Rows").querySelectorAll(".v8ProofBtn").forEach(function(btn){btn.onclick=function(){
      $("v8EvidenceSelect").value=btn.dataset.id;state.lastFocus="history";
      document.querySelector('[data-page="v8Evidence"]').click();loadEvidence(btn.dataset.id);
    }});
    $("v8Rows").querySelectorAll(".v8SpeakBtn").forEach(function(btn){btn.onclick=function(){
      var rec=data.rows.find(x=>x.signalId===btn.dataset.id);speechPlay(explainText(rec));
    }});
  }
  function fillEvidenceChoices(rows){
    if(!$("v8EvidenceSelect"))return;
    $("v8EvidenceSelect").innerHTML=rows.map(function(r){return '<option value="'+safe(r.signalId)+'">'+safe(dt(r.signalCandleCloseUTC)+" "+r.symbolResolved+" "+(r.direction>0?"BUY":"SELL")+" "+r.outcome)+"</option>"}).join("")||'<option value="">'+t("noSignalsInWindow")+'</option>';
  }
  function renderComparison(obj){
    var rows=[obj?.previous,obj?.previousMatched,obj?.current].filter(Boolean);
    return '<table class="v8Table"><thead><tr><th>'+t("period")+'</th><th>'+t("completed")+'</th><th>TP/TR</th><th>BE+</th><th>BE0</th><th>SL</th><th>'+t("strictWR")+'</th><th>'+t("totalR")+'</th><th>'+t("grossPL")+'</th></tr></thead><tbody>'+
      rows.map(function(s){return '<tr><td><b>'+safe(s.period)+'</b><br><small>'+safe(s.label||"")+'</small></td>'+
        '<td>'+number(s.completed,0)+'</td><td>'+number((s.outcomes?.TP1||0)+(s.outcomes?.TP2||0)+(s.outcomes?.TP3||0)+(s.outcomes?.TRAILING||0),0)+'</td>'+
        '<td>'+number(s.outcomes?.BE_POSITIVE||0,0)+'</td><td>'+number(s.beZero,0)+'</td><td>'+number(s.negative,0)+'</td>'+
        '<td>'+ (finite(s.strictWinRate)?number(s.strictWinRate,1)+"%":"N/A")+'</td><td>'+signed(s.totalR,2)+'</td><td>'+money(s.grossPLUSD)+'</td></tr>'}).join("")+'</tbody></table>';
  }
  function renderPerformance(data){
    if(!data)return;
    var perfMsg=safe(data.symbol)+" • "+data.indicator+" • "+data.tf+" • "+t("brokerWindow")+" "+dt(data.dataWindow?.startUTC)+" – "+dt(data.dataWindow?.endUTC)+" • History performance uses Entry+SL and a transparent normalized 1R/2R/3R plan when the native indicator has no TP.";notice("v8PerformanceStatus",perfMsg);
    $("v8PerformanceSummary").innerHTML=resultStats(data.summary,data.symbol);
    $("v8MonthComparison").innerHTML=renderComparison(data.comparison);
    var arr=data.groups||[];
    $("v8PeriodTable").innerHTML=arr.length?'<table class="v8Table v8WideTable"><thead><tr><th>'+t("period")+'</th><th>'+t("totalSignals")+'</th><th>'+t("completed")+'</th><th>'+t("positive")+'</th><th>'+t("negative")+'</th><th>'+t("beZero")+'</th><th>'+t("ambiguous")+'</th><th>'+t("strictWR")+'</th><th>WIN PIP</th><th>SL PIP</th><th>NET PIP</th><th>NET POINT</th><th>'+t("totalR")+'</th><th>'+t("grossPL")+'</th></tr></thead><tbody>'+
      arr.map(function(s){var net=metricTotal(s,"pipsBySymbol",data.symbol);return '<tr><td><b>'+safe(s.period)+'</b></td><td>'+number(s.totalSignals,0)+'</td><td>'+number(s.completed,0)+'</td><td class="g">'+number(s.positive,0)+'</td><td class="r">'+number(s.negative,0)+'</td><td>'+number(s.beZero,0)+'</td><td>'+number(s.ambiguous,0)+'</td><td class="'+wrClass(s)+'">'+(finite(s.strictWinRate)?number(s.strictWinRate,1)+"%":"N/A")+'</td><td class="g">'+signed(metricPart(s,"pipsBySymbol",data.symbol,"winTotal"),1)+'</td><td class="r">'+signed(metricPart(s,"pipsBySymbol",data.symbol,"lossTotal"),1)+'</td><td class="'+netClass(net)+'">'+signed(net,1)+'</td><td>'+signed(metricTotal(s,"pointsBySymbol",data.symbol),0)+'</td><td>'+signed(s.totalR,2)+'</td><td>'+money(s.grossPLUSD)+'</td></tr>'}).join("")+'</tbody></table>':'<p>'+t("noSignalsInWindow")+'</p>';
  }
  async function loadPerformance(){
    setHistoryIndicator($("v8PerformanceIndicator")?.value||historyIndicator());
    notice("v8PerformanceStatus",t("loadingBroker"));
    try{state.performance=await json("/api/performance?"+uri("&period="+encodeURIComponent($("v8Period").value)+"&direction="+encodeURIComponent($("v8PerformanceDirection").value)));renderPerformance(state.performance)}
    catch(e){state.performance=null;notice("v8PerformanceStatus",e.message,true);$("v8PerformanceSummary").innerHTML="";$("v8MonthComparison").innerHTML="";$("v8PeriodTable").innerHTML=""}
  }
  function evidenceURL(id,format){
    return "/api/evidence?"+uri("&id="+encodeURIComponent(id)+(format?"&format="+encodeURIComponent(format):""));
  }
  function downloadJSON(value,filename){
    var url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"}));
    var a=document.createElement("a");a.href=url;a.download=filename;a.click();setTimeout(function(){URL.revokeObjectURL(url)},1000);
  }
  async function loadEvidence(id){
    if(!id)id=$("v8EvidenceSelect")?.value;
    if(!id){$("v8EvidenceSummary").textContent="No validated historical signal in the current broker candle window. Select another symbol, timeframe or original research indicator in History Pro.";
      $("v8EvidenceChart").textContent="No evidence reconstruction is available for this selection.";
      $("v8EvidenceDetails").textContent="Forward publication and broker fill proof are not configured for GF-AI.";
      ["v8EvidenceRead","v8EvidencePng","v8EvidenceJson","v8EvidenceCsv"].forEach(function(x){$(x).disabled=true});return}
    state.evidence=null;
    $("v8EvidenceSummary").textContent=t("loadingBroker");
    $("v8EvidenceChart").textContent="Fetching historical Vantage candle reconstruction...";
    $("v8EvidenceDetails").textContent="";
    ["v8EvidenceRead","v8EvidencePng","v8EvidenceJson","v8EvidenceCsv"].forEach(function(x){$(x).disabled=true});
    try{
      var data=await json(evidenceURL(id));state.evidence=data;renderEvidence(data);
      $("v8EvidenceRead").disabled=false;$("v8EvidenceJson").disabled=false;$("v8EvidenceCsv").disabled=false;
      $("v8EvidencePng").disabled=!(state.evidenceChart&&typeof state.evidenceChart.takeScreenshot==="function")&&!$("v8EvidenceChart")?.querySelector("svg");
    }catch(e){state.evidence=null;$("v8EvidenceSummary").textContent="Evidence unavailable: "+e.message+
      ". A reconstructed signal must still be present in the current broker history window; this is not proof of a forward-published trade.";
      $("v8EvidenceChart").textContent="Broker reconstruction could not be verified for this signal.";
      $("v8EvidenceDetails").textContent="Refresh History Pro to obtain a valid signal ID; no image or execution record is invented.";
      ["v8EvidenceRead","v8EvidencePng","v8EvidenceJson","v8EvidenceCsv"].forEach(function(x){$(x).disabled=true})}
  }
  function renderEvidence(data){
    if(!data)return;
    var s=data.signal||{},x=data.explanation||{};
    $("v8EvidenceStatus").textContent=t("reconstructedNotProof");
    $("v8EvidenceSummary").innerHTML='<div class="v8ProofSummary">'+
      stat(t("signalId"),s.signalId?.slice(0,16)+"…")+stat(t("entry"),number(s.entry,5))+stat("SL",number(s.originalSL,5))+stat("TP1",number(s.tp1,5))+
      stat(t("exit"),number(s.exitPrice,5))+stat(t("simulatedOutcome"),safe(s.outcome))+stat(t("priceMove"),signed(s.priceMove,4))+stat(t("grossPL"),money(s.grossPLUSD))+'</div>';
    $("v8EvidenceDetails").innerHTML='<h3>'+t("entryExplanation")+'</h3>'+
      (x.sections||[]).map(function(sec){return '<p><b>'+safe(sec.label)+'</b><br>'+safe(sec.text)+'</p>'}).join("")+
      '<p class="v8Footnote">'+safe(x.newsContext||"")+'</p>'+
      '<p class="v8Footnote">SHA-256 '+safe(data.evidenceHash)+" • "+safe(data.hashScope)+'</p>'+
      '<p class="v8Footnote">'+safe(data.disclaimer||"")+'</p>';
    drawProof(data);
  }
  function downloadEvidencePng(){
    function save(canvas){
      var a=document.createElement("a");a.href=canvas.toDataURL("image/png");
      a.download="goldflow-v8-"+(state.evidence?.signalId||"evidence")+"-reconstructed-chart.png";a.click();
    }
    try{
      if(state.evidenceChart&&typeof state.evidenceChart.takeScreenshot==="function"){
       save(state.evidenceChart.takeScreenshot());return;
      }
      // No CDN dependency: export the OWN reconstructed SVG through a local canvas.
      var svg=$("v8EvidenceChart")?.querySelector("svg");
      if(!svg)throw Error("No verified broker chart to export");
      var xml=new XMLSerializer().serializeToString(svg),url=URL.createObjectURL(new Blob([xml],{type:"image/svg+xml;charset=utf-8"}));
      var image=new Image();
      image.onload=function(){
       try{var cn=document.createElement("canvas");cn.width=1440;cn.height=503;
        cn.getContext("2d").drawImage(image,0,0,cn.width,cn.height);save(cn)}
       catch(e){$("v8EvidenceCaption").textContent="Browser cannot export the local SVG to PNG; visual reconstruction remains available."}
       finally{URL.revokeObjectURL(url)}
      };
      image.onerror=function(){URL.revokeObjectURL(url);$("v8EvidenceCaption").textContent="PNG conversion blocked; Evidence visual remains available."};
      image.src=url;
    }catch(e){$("v8EvidenceCaption").textContent=String(e.message||e)}
  }
  function drawProof(data){
    var el=$("v8EvidenceChart");if(!el)return;el.innerHTML="";
    if(state.evidenceChart){try{state.evidenceChart.remove()}catch(e){}state.evidenceChart=null}
    var rows=(data.ohlc||[]).filter(function(b){return finite(b.t)&&finite(b.o)&&finite(b.h)&&finite(b.l)&&finite(b.c)}).sort(function(a,b){return a.t-b.t});
    if(!rows.length){el.textContent=t("noArchivedCandles");return}
    if(typeof LightweightCharts==="undefined"){
      var s=data.signal||{},lvl=[{p:s.entry,name:"ENTRY SIM"},{p:s.originalSL,name:"SL SIM"},{p:s.tp1,name:"TP1 SIM"},{p:s.exitPrice,name:"EXIT SIM"}];
      if(window.GFOHLC?.render(el,rows,lvl)){
        $("v8EvidenceCaption").textContent="First-party broker candlestick SVG reconstruction. Source: current Vantage OHLC; NO forward publication or broker fill proof.";
      }else el.textContent="Broker evidence candles exist but chart fallback failed.";
      return;
    }
    var chart=LightweightCharts.createChart(el,{layout:{background:{color:"#07131c"},textColor:"#aab9c3"},grid:{vertLines:{color:"#10222e"},horzLines:{color:"#10222e"}},rightPriceScale:{borderColor:"#24404e"},timeScale:{borderColor:"#24404e",timeVisible:true,secondsVisible:false},height:360});
    var candles=chart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",wickUpColor:"#31d6a4",wickDownColor:"#ff6079",borderVisible:false});
    candles.setData(rows.map(function(b){return {time:b.t,open:b.o,high:b.h,low:b.l,close:b.c}}));
    var s=data.signal||{};
    [{p:s.entry,c:"#5ab0ff",title:"ENTRY"},{p:s.originalSL,c:"#ff6079",title:"SL"},{p:s.tp1,c:"#31d6a4",title:"TP1"},{p:s.exitPrice,c:"#f2c75b",title:"EXIT"}].forEach(function(x){if(finite(x.p))candles.createPriceLine({price:Number(x.p),color:x.c,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:x.title})});
    var secs={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
    var signalOpen=Date.parse(s.signalCandleCloseUTC)/1000-(secs[s.tf]||300);
    var signalBar=rows.find(function(b){return b.t===signalOpen})||rows.find(function(b){return b.t>=signalOpen})||rows[Math.floor(rows.length/2)];
    var marker={time:signalBar.t,position:s.direction>0?"belowBar":"aboveBar",color:s.direction>0?"#31d6a4":"#ff6079",shape:s.direction>0?"arrowUp":"arrowDown",text:(s.direction>0?"B":"S")+" SIM"};
    if(candles.setMarkers)candles.setMarkers([marker]);
    chart.timeScale().fitContent();state.evidenceChart=chart;
  }
  // World news is independent from /api/news-context (economic observations).
  // Only authenticated broker data can validate actual Gold price, never a headline.
  var liveNewsCache=null,liveNewsAt=0,liveNewsPromise=null,worldNewIds=new Set();
  var SEEN_KEY="gf_world_news_seen_v1";
  function newsIsMS(){return ["ms","id"].includes(state.locale)}
  function safeNewsLink(url){
    try{var x=new URL(String(url));return x.protocol==="https:"&&!x.username&&!x.password?safe(x.href):"#"}
    catch(e){return "#"}
  }
  function liveTime(x){
    if(x.publishedAtUTC)return dt(x.publishedAtUTC)+" • RSS feed time, not release verification";
    return safe(x.publishedOn||"N/A")+" • SOURCE DATE ONLY";
  }
  function newsNarrative(x){
    var ms=newsIsMS();
    return {title:ms?x.title:x.titleEN||x.title,
      reported:ms?x.reported:x.reportedEN||x.reported,
      pathway:ms?x.pathway:x.pathwayEN||x.pathway,
      opposing:ms?x.opposing:x.opposingEN||x.opposing};
  }
  function newStoryCount(){
    var tab=document.querySelector('nav [data-page="v8News"]');
    if(tab)tab.textContent=t("newsStudy")+(worldNewIds.size?" • "+worldNewIds.size+" NEW":"");
  }
  function recordWorldSeen(){
    if(!liveNewsCache?.items)return;
    try{
      var previous=JSON.parse(localStorage.getItem(SEEN_KEY)||"[]");
      if(!Array.isArray(previous))previous=[];
      localStorage.setItem(SEEN_KEY,JSON.stringify(Array.from(new Set([...liveNewsCache.items.map(function(x){return x.id}),...previous])).slice(0,250)));
      worldNewIds.clear();newStoryCount();
    }catch(e){}
  }
  function worldCard(item,compact){
    var p=newsNarrative(item),time=liveTime(item),newFlag=worldNewIds.has(item.id);
    var sourceStatus=item.headlineOnly?"HEADLINE ONLY • CHECK ARTICLE":"SOURCE-ATTRIBUTED REPORT";
    return '<article class="gfWorldStory impact-'+safe(item.impact||"LOW")+'">'+
      '<div class="gfWorldMeta"><span class="gfWorldImpact">'+safe(item.impact)+" POTENTIAL • "+safe(item.category)+'</span>'+
      (newFlag?'<span class="gfWorldNew">NEW</span>':"")+'</div>'+
      '<h4>'+safe(p.title)+'</h4><div class="gfWorldSource">'+safe(item.publisher)+" • "+time+" • "+safe(sourceStatus)+'</div>'+
      (compact?'<p>'+safe(p.reported)+'</p>':
        '<p class="gfWorldFact">'+safe(p.reported)+'</p>'+
        '<p><b>GOLD • CONDITIONAL SUPPORT:</b> '+safe(p.pathway)+'</p>'+
        '<p><b>COUNTER-RISK / WHIPSAW:</b> '+safe(p.opposing)+'</p>'+
        '<small>'+safe(newsIsMS()?(item.limitation||"Laporan penerbit, belum disahkan secara bebas."):(item.limitationEN||"Source reporting only; article details, exact time and independent attribution remain unverified."))+'</small>')+
      '<a href="'+safeNewsLink(item.sourceUrl)+'" target="_blank" rel="noopener noreferrer">SOURCE • '+safe(item.publisher)+' ↗</a>'+
      '</article>';
  }
  function renderOpeningRisk(data){
    var el=$("gfWorldBias");if(!el)return;
    var research=data?.openingRisk||{},up=research.status==="SAFE_HAVEN_UPSIDE_GAP_RISK_UNCONFIRMED";
    var m=state.news?.macro,q=m?.quality,now=Date.parse(data?.updatedAtUTC)||Date.now(),
      fetched=Date.parse(m?.fetchedAtUTC||"");
    var macroGood=!!(q&&Number(q.available)>0&&Number(q.available)===Number(q.total)&&
      !(q.errors||[]).length&&!(q.stale||[]).length&&Number.isFinite(fetched)&&now-fetched>=-60000&&now-fetched<=3600000);
    var macroBias=macroGood?String(m?.gold?.bias||"UNAVAILABLE"):"UNVERIFIED";
    var contradiction=up&&macroBias==="PRESSURE",ms=newsIsMS();
    el.className="gfWorldBias"+(contradiction?" conflict":up?" watch":"");
    var outcome=contradiction?
      (ms?"KONFLIK: berita geopolitik berpotensi gap naik, tetapi Macro Regime Gold menunjukkan PRESSURE. Tunggu pembukaan sebenar.":"CONFLICT: geopolitical news creates upside-gap risk while verified Gold Macro shows PRESSURE. Wait for actual market opening."):
      up?(ms?"RISIKO SELAMAT: potensi safe-haven, tetapi bukan BUY sebelum tick segar dan candle M15 tutup.":"WATCH: potential safe-haven upside risk, but NOT a BUY before fresh ticks and a CLOSED M15 candle."):
      (ms?"Berita masih bersifat dua hala atau tiada arah yang dapat disahkan.":"News impact remains two-sided or has no verified directional conclusion.");
    el.innerHTML='<small>NEWS-ONLY PRE-OPEN SCENARIO • NO AUTO ENTRY / NO WIN PROBABILITY</small>'+
      '<h3>'+safe((ms?research.labelMS:research.labelEN)||"WAIT • EVIDENCE INCOMPLETE")+'</h3>'+
      '<p>'+safe(outcome)+'</p>'+
      '<p class="gfWorldMacroContrast">Macro Gold: '+safe(macroBias)+
      (macroGood?" • current source-quality gate passed":" • current synchronized macro quality not verified")+
      ' • XAUUSD fresh quote/M15: NOT ESTABLISHED BY NEWS</p>';
  }
  function renderWorldNews(data){
    if(!data||!data.ok)return;
    var all=data.items||[],asOf=Date.parse(data.updatedAtUTC)||Date.now(),
      high=all.find(function(x){var t=Date.parse(x.publishedAtUTC||((x.publishedOn||"")+"T12:00:00Z"));
        return x.impact==="HIGH"&&Number.isFinite(t)&&asOf-t>=0&&asOf-t<=36*3600000
      }),lead=high||all[0];
    var healthy=(data.sourceChecks||[]).filter(function(x){return x.status==="FETCHED"}).length,total=(data.sourceChecks||[]).length;
    if($("gfWorldHealth"))$("gfWorldHealth").textContent="CHECKED "+dt(data.updatedAtUTC)+" • FEEDS "+healthy+"/"+total;
    var status="External sources: "+safe(data.sourceStatus)+" • "+data.fetchedLiveHeadlines+" publisher headlines / "+
      data.curatedCandidates+" dated source-attributed reports. "+data.fallbackNote;
    if($("gfWorldNotice")){ $("gfWorldNotice").className="notice "+(healthy?"info":"bad");
      $("gfWorldNotice").textContent=status; }
    renderOpeningRisk(data);
    if($("gfWorldFeature")){
      $("gfWorldFeature").innerHTML=lead?
       '<div class="gfFeatureEyebrow">IMPORTANT DEVELOPMENTS • SOURCE-ATTRIBUTED, NOT A TRADE SIGNAL</div>'+
       worldCard(lead,false)+
       '<p class="gfFeatureDisclaimer">No newly verified XAUUSD opening quote, gap, price target or causal move is inferred from this news item. Different news drivers can offset each other.</p>':
       '<p>No credible recent publisher headlines were obtained; never fabricate breaking news.</p>';
    }
    if($("gfWorldStories"))$("gfWorldStories").innerHTML=all.filter(function(x){return !lead||x.id!==lead.id})
      .slice(0,18).map(function(x){return worldCard(x,false)}).join("")||
      '<p class="sub">No additional qualifying developments. Recheck the external sources later.</p>';
    if($("gfWorldOpening"))$("gfWorldOpening").innerHTML=
      '<div class="gfOpeningNote">POSSIBLE OPENING GAP ≠ CONFIRMED BUY/SELL. OIL/INFLATION/YIELDS MAY OPPOSE SAFE-HAVEN FLOWS.</div>'+
      '<ol>'+((newsIsMS()?data.openingWatch:data.openingWatchEN)||data.openingWatch||[]).map(function(x){return "<li>"+safe(x)+"</li>"}).join("")+'</ol>';
    var blog=$("gfBlogLiveJournal");
    if(blog)blog.innerHTML=all.slice(0,8).map(function(x){return worldCard(x,true)}).join("")||
      '<p>Live world-news providers have no qualifying recent article at the moment. Dated editorial research remains below.</p>';
    if($("gfBlogLiveStatus"))$("gfBlogLiveStatus").textContent=
      "FEED "+safe(data.sourceStatus)+" • "+dt(data.updatedAtUTC);
    newStoryCount();
  }
  function computeWorldNew(data){
    try{
      var saved=JSON.parse(localStorage.getItem(SEEN_KEY)||"null");
      if(!Array.isArray(saved)){
        saved=(data.items||[]).map(function(x){return x.id});
        localStorage.setItem(SEEN_KEY,JSON.stringify(saved.slice(0,200)));
      }
      var seen=new Set(saved);
      worldNewIds=new Set((data.items||[]).filter(function(x){return !seen.has(x.id)}).map(function(x){return x.id}));
    }catch(e){worldNewIds=new Set()}
  }
  async function loadWorldNews(force){
    if(liveNewsPromise)return liveNewsPromise;
    if(!force&&liveNewsCache&&Date.now()-liveNewsAt<180000){renderWorldNews(liveNewsCache);return liveNewsCache}
    liveNewsPromise=(async function(){
      try{
        var d=await json("/api/news-live"+(force?"?force=1":""));
        if(!d||!d.ok)throw Error("NO_VERIFIABLE_WORLD_NEWS_DATA");
        liveNewsCache=d;liveNewsAt=Date.now();computeWorldNew(d);renderWorldNews(d);
        if($("v8News")?.classList.contains("on"))recordWorldSeen();
        return d;
      }catch(e){
        var msg="Live publisher feed unavailable: "+String(e.message||e);
        if($("gfWorldNotice")){$("gfWorldNotice").className="notice bad";$("gfWorldNotice").textContent=msg}
        if(!liveNewsCache){
          if($("gfWorldHealth"))$("gfWorldHealth").textContent="SOURCE UNAVAILABLE";
          if($("gfWorldFeature"))$("gfWorldFeature").textContent="No verified fresh report. Check the linked official/publication sources; no substitute headline has been invented.";
          if($("gfBlogLiveStatus"))$("gfBlogLiveStatus").textContent="EXTERNAL FEED UNAVAILABLE";
        }else{
          if($("gfWorldHealth"))$("gfWorldHealth").textContent="LAST CHECKED "+dt(liveNewsCache.updatedAtUTC)+" • STALE";
          if($("gfBlogLiveStatus"))$("gfBlogLiveStatus").textContent="LAST FETCH "+dt(liveNewsCache.updatedAtUTC)+" • STALE";
        }
        return null;
      }finally{liveNewsPromise=null}
    })();
    return liveNewsPromise;
  }
  async function loadNews(force){
    loadWorldNews(!!force);
    notice("v8NewsNotice",t("loadingOfficial"));
    try{state.news=await json("/api/news-context?"+(force?"v="+Date.now():""));renderNews(state.news)}
    catch(e){state.news=null;notice("v8NewsNotice",e.message,true);$("v8NewsRegime").innerHTML="";$("v8NewsList").innerHTML=""}
  }
  function renderNews(data){
    if(!data)return;
    notice("v8NewsNotice",t("officialNewsNote")+" "+t("consensusUnavailable"));
    var macro=data.macro||{};
    $("v8NewsRegime").innerHTML=stat("REGIME",macro.regime?.name||"N/A","DERIVED • "+(macro.regime?.confidence??"N/A")+"% input coverage")+
      stat("GOLD CONTEXT",macro.gold?.bias||"N/A","DERIVED • no guarantee")+
      stat(t("updated"),dt(macro.fetchedAtUTC),"FRED/BEA/BLS/Fed/Treasury • source verified");
    var impactOrder={HIGH:0,MEDIUM:1,LOW:2,CONTEXT:3};
    var orderImpact=function(a,b){return (impactOrder[a.impact]??9)-(impactOrder[b.impact]??9)};
    var releases=(data.verifiedReleases||data.latestOfficialEvents||[]).slice().sort(orderImpact),observations=(data.latestOfficialObservations||[]).slice().sort(orderImpact);
    function newsCard(ev,isRelease){
      return '<details class="v8NewsItem impact-'+safe(ev.impact||"LOW")+'"><summary><div class="gfNewsTitle"><b>'+safe(ev.title)+'</b><span class="gfImpactBadge">'+safe(ev.impact==="CONTEXT"?"MARKET CONTEXT":(ev.impact||"LOW")+" IMPACT")+(isRelease?"":" • OBSERVATION")+'</span></div><strong>'+safe(ev.display||"N/A")+'</strong><small>'+safe(ev.dataPeriod||"N/A")+" • "+safe(ev.source)+" • "+safe(isRelease?t("verifiedRelease"):t("macroObservation"))+'</small></summary><div class="v8NewsBody">'+
        '<div class="v8NewsMeta">'+stat(t("actual"),ev.display||"N/A")+stat(t("forecast"),finite(ev.forecast)?number(ev.forecast,2):"N/A",finite(ev.forecast)?"":t("consensusUnavailable"))+
        stat(t("previous"),finite(ev.previous)?number(ev.previous,2):"N/A",finite(ev.previous)?"":t("sourceNotVerified"))+
        stat(t("releaseTime"),isRelease?dt(ev.releasedAtUTC):"N/A",isRelease?"":t("releaseDateNotPeriod"))+'</div>'+
        '<p class="gfImpactCaveat">Impact category = typical potential of this event type; NOT a measured move, forecast or trade signal. Observations without a verified release timestamp are not presented as live news.</p><p><b>'+t("scenarioHigher")+':</b> '+safe(ev.interpretation?.ifHigher||"")+'</p>'+
        '<p><b>'+t("scenarioLower")+':</b> '+safe(ev.interpretation?.ifLower||"")+'</p>'+
        '<p class="v8Footnote">'+safe(ev.interpretation?.fact||"")+' '+t("notTradeSignal")+'</p>'+
        (ev.sourceUrl?'<a href="'+safe(ev.sourceUrl)+'" target="_blank" rel="noopener noreferrer">'+t("officialSource")+'</a>':"")+
      '</div></details>';
    }
    var html="";
    if(releases.length)html+='<div class="v8Footnote">'+safe(t("verifiedReleaseNote"))+'</div>'+releases.map(function(ev){return newsCard(ev,true)}).join("");
    else html+='<div class="v8Footnote">'+safe(t("noVerifiedReleases"))+'</div>';
    if(observations.length)html+='<div class="v8Footnote">'+safe(t("macroObservationNote"))+'</div>'+observations.map(function(ev){return newsCard(ev,false)}).join("");
    $("v8NewsList").innerHTML=html||"<p>"+t("noOfficialData")+"</p>";
    if(liveNewsCache)renderOpeningRisk(liveNewsCache);
  }

  var blogCache=null;
  function renderBlog(){
    var el=$("gfBlogPosts");if(!el||!blogCache)return;
    var ms=["ms","id"].includes(state.locale);
    el.innerHTML=blogCache.map(function(p){
      var title=ms?p.titleMS:p.titleEN,summary=ms?p.summaryMS:p.summaryEN,body=ms?p.bodyMS:p.bodyEN;
      var links=(p.sources||[]).filter(function(s){return safeNewsLink(s.url)!=="#"}).map(function(s){
         return '<a href="'+safeNewsLink(s.url)+'" target="_blank" rel="noopener noreferrer">'+safe(s.label||"Publisher source")+' ↗</a>'
        }).join(" • ");
      return '<details class="gfBlogPost"><summary><span class="gfBlogCategory">'+safe(p.category)+'</span><b>'+safe(title)+'</b><small>'+safe(p.dateUTC)+' • '+safe(p.version)+' • '+safe(p.changeType)+'</small><p>'+safe(summary)+'</p></summary><div class="gfBlogBody">'+
        '<p class="gfEditorialBody">'+safe(body)+'</p><p class="v8Footnote">'+safe(p.qualityNote||"")+'</p>'+
        (links?'<div class="gfBlogSources"><b>SOURCE REFERENCES:</b> '+links+'</div>':"")+'</div></details>';
    }).join("")||"<p>No published articles yet.</p>";
  }
  async function loadBlog(){
    var el=$("gfBlogPosts");if(!el)return;
    $("gfBlogNote").textContent="Loading published GoldFlow articles…";
    try{
      var r=await fetch("/blog/posts.json",{cache:"no-store"}),j=await r.json();
      if(!r.ok||!Array.isArray(j.posts))throw Error("BLOG_FEED_UNAVAILABLE");
      blogCache=j.posts.filter(function(p){return p&&p.published===true}).sort(function(a,b){return b.dateUTC.localeCompare(a.dateUTC)||(Number(a.featuredRank??99)-Number(b.featuredRank??99))});
      renderBlog();loadWorldNews(false);$("gfBlogNote").textContent="Current source-attributed market journal above; dated research articles below. None is proof of a broker trade.";
    }catch(e){el.textContent="Blog is temporarily unavailable.";$("gfBlogNote").textContent=e.message}
  }
  function tvHybridActionClass(a){return a==="BUY"?"g":a==="SELL"?"r":"y"}
  function tvHybridFmt(v){
    if(v===null||v===undefined||!Number.isFinite(Number(v)))return "N/A";
    var n=Number(v),a=Math.abs(n);return a>=1000?n.toLocaleString(undefined,{maximumFractionDigits:2}):a>=10?n.toFixed(2):n.toFixed(4);
  }
  function tvHybridSummaryCard(title,s){
    s=s||{};return '<div class="tvHybridSummary"><small>'+safe(title)+'</small><strong class="'+tvHybridActionClass(s.action)+'">'+safe(s.action||"N/A")+'</strong>'+
      '<span><b class="g">'+Number(s.BUY||0)+' Buy</b> • <b class="y">'+Number(s.NEUTRAL||0)+' Neutral</b> • <b class="r">'+Number(s.SELL||0)+' Sell</b></span></div>';
  }
  function tvHybridRows(rows){
    return '<div class="tvHybridTableWrap"><table class="tvHybridTable"><thead><tr><th>Indicator</th><th>Value</th><th>Action</th></tr></thead><tbody>'+
      (rows||[]).map(function(r){return '<tr><td><b>'+safe(r.name)+'</b>'+(r.detail?'<small>'+safe(r.detail)+'</small>':"")+'</td><td>'+tvHybridFmt(r.value)+'</td><td class="'+tvHybridActionClass(r.action)+'"><b>'+safe(r.action)+'</b></td></tr>'}).join("")+
      '</tbody></table></div>';
  }
  async function tvBars(symbol,tf){
    return json("/api/bars?symbol="+encodeURIComponent(symbol)+"&tf="+encodeURIComponent(tf)+"&limit=220&t="+Date.now());
  }
  async function renderTVTechnicalFallback(tfOverride){
    var el=$("v8TVTechnical"),engine=window.GFTVHybrid;if(!el||!engine)return;
    var symbol=window.selectedSymbol||$("symbolSelect")?.value||"XAUUSD247",tf=tfOverride||state.tvHybridTF||window.selectedTF||"M15";
    state.tvHybridTF=tf;
    el.innerHTML='<div class="tvHybridLoading">Loading Vantage technical indicators • '+safe(symbol)+' • '+safe(tf)+'…</div>';
    try{
      var feed=await tvBars(symbol,tf),calc=engine.calc(feed.bars||[]);
      if(!calc.ok)throw Error(calc.error||"INSUFFICIENT_BARS");
      var ext="https://www.tradingview.com/chart/?symbol="+encodeURIComponent((window.tvSymbol?window.tvSymbol(symbol):symbol)||symbol);
      var tfs=["M1","M5","M15","M30","H1","H4","D1"];
      el.innerHTML='<div class="tvHybridHead"><div><small>TRADINGVIEW-STYLE TECHNICAL FALLBACK</small><b>'+safe(symbol)+' • '+safe(tf)+'</b></div>'+
       '<a href="'+ext+'" target="_blank" rel="noopener noreferrer">OPEN TRADINGVIEW ↗</a></div>'+
       '<div class="tvTfButtons">'+tfs.map(function(x){return '<button type="button" data-tvhybrid-tf="'+x+'" class="'+(x===tf?"on":"")+'">'+x+'</button>'}).join("")+'</div>'+
       '<div class="tvHybridSummaries">'+tvHybridSummaryCard("Summary",calc.summaries.overall)+tvHybridSummaryCard("Oscillators",calc.summaries.oscillators)+tvHybridSummaryCard("Moving Averages",calc.summaries.movingAverages)+'</div>'+
       '<div class="tvHybridSpot"><span>Last <b>'+tvHybridFmt(calc.last)+'</b></span><span>1-bar <b class="'+(Number(calc.changePct)>0?"g":Number(calc.changePct)<0?"r":"y")+'">'+(Number.isFinite(Number(calc.changePct))?(Number(calc.changePct)>0?"+":"")+Number(calc.changePct).toFixed(3)+"%":"N/A")+'</b></span><span>'+calc.count+' broker candles</span></div>'+
       '<h4>Oscillators</h4>'+tvHybridRows(calc.oscillators)+'<h4>Moving Averages</h4>'+tvHybridRows(calc.movingAverages)+
       '<h4>Volatility / Bands</h4>'+tvHybridRows(calc.info)+
       '<p class="v8Footnote">Fallback is calculated from Vantage MT5 candles when the TradingView widget is blocked. It mirrors common TradingView-style indicators but is NOT TradingView feed or exact TradingView proprietary recommendation parity.</p>';
      el.querySelectorAll("[data-tvhybrid-tf]").forEach(function(b){b.onclick=function(){renderTVTechnicalFallback(this.dataset.tvhybridTf)}});
    }catch(e){
      el.innerHTML='<div class="notice bad">Technical fallback unavailable: '+safe(e.message||e)+'. Vantage broker data was not replaced with synthetic values.</div>';
    }
  }
  async function renderTVMarketFallback(){
    var el=$("v8TVMarket"),engine=window.GFTVHybrid;if(!el||!engine)return;
    var symbol=window.selectedSymbol||$("symbolSelect")?.value||"XAUUSD247",tfs=["M1","M5","M15","M30","H1","H4","D1"];
    el.innerHTML='<div class="tvHybridLoading">Loading multi-timeframe Vantage overview • '+safe(symbol)+'…</div>';
    var rows=[];
    for(const tf of tfs){
      if(!$("tvPage")?.classList.contains("on"))return;
      try{var feed=await tvBars(symbol,tf),c=engine.calc(feed.bars||[]);rows.push({tf,ok:c.ok,calc:c,error:c.error||null})}
      catch(e){rows.push({tf,ok:false,error:String(e.message||e)})}
      await new Promise(r=>setTimeout(r,140));
    }
    var ok=rows.filter(x=>x.ok);
    if(!ok.length){el.innerHTML='<div class="notice bad">Multi-timeframe broker overview unavailable. No synthetic market state was substituted.</div>';return}
    var alignedBuy=ok.filter(x=>x.calc.summaries.overall.action==="BUY").length,alignedSell=ok.filter(x=>x.calc.summaries.overall.action==="SELL").length;
    var broad=alignedBuy>alignedSell?"BUY":alignedSell>alignedBuy?"SELL":"NEUTRAL";
    el.innerHTML='<div class="tvHybridHead"><div><small>VANTAGE MULTI-TIMEFRAME OVERVIEW</small><b>'+safe(symbol)+'</b></div><span class="tag '+tvHybridActionClass(broad)+'">'+safe(broad)+'</span></div>'+
      '<div class="tvHybridBreadth"><span><b class="g">'+alignedBuy+'</b> BUY TF</span><span><b class="y">'+ok.filter(x=>x.calc.summaries.overall.action==="NEUTRAL").length+'</b> NEUTRAL TF</span><span><b class="r">'+alignedSell+'</b> SELL TF</span></div>'+
      '<div class="tvHybridTableWrap"><table class="tvHybridTable"><thead><tr><th>TF</th><th>Last</th><th>1-bar</th><th>Osc.</th><th>MA</th><th>Summary</th></tr></thead><tbody>'+
      rows.map(function(x){
       if(!x.ok)return '<tr><td><b>'+x.tf+'</b></td><td colspan="5" class="y">DATA UNAVAILABLE</td></tr>';
       var c=x.calc,s=c.summaries;return '<tr><td><b>'+x.tf+'</b></td><td>'+tvHybridFmt(c.last)+'</td><td class="'+(Number(c.changePct)>0?"g":Number(c.changePct)<0?"r":"y")+'">'+(Number.isFinite(Number(c.changePct))?(Number(c.changePct)>0?"+":"")+Number(c.changePct).toFixed(3)+"%":"N/A")+'</td>'+
        '<td class="'+tvHybridActionClass(s.oscillators.action)+'"><b>'+s.oscillators.action+'</b></td><td class="'+tvHybridActionClass(s.movingAverages.action)+'"><b>'+s.movingAverages.action+'</b></td><td class="'+tvHybridActionClass(s.overall.action)+'"><b>'+s.overall.action+'</b></td></tr>';
      }).join("")+'</tbody></table></div>'+
      '<p class="v8Footnote">This fallback is a Vantage MT5 multi-timeframe technical overview. It is independent of GoldFlow signal engines and does not claim to be TradingView market data.</p>';
  }
  function markTVFallback(reason){
    var n=$("v8TVNote");if(n)n.textContent="TradingView widget blocked/unavailable ("+reason+"). Vantage MT5 Hybrid fallback is active below. GoldFlow signals still use the broker bridge only.";
  }
  function loadTVTools(){
    var sym=(window.tvSymbol&&window.selectedSymbol)?window.tvSymbol(window.selectedSymbol):"OANDA:XAUUSD";
    var selectedTf=window.selectedTF||$("tfSelect")?.value||"M15";
    if(state.tvReady&&state.tvSymbol===sym&&state.tvSelectedTF===selectedTf)return;
    state.tvReady=true;state.tvSymbol=sym;state.tvSelectedTF=selectedTf;state.tvHybridTF=selectedTf;
    var generation=(state.tvWidgetGeneration||0)+1;state.tvWidgetGeneration=generation;
    $("v8TVNote").textContent="TradingView reference: "+sym+" • XAUUSD247 uses ThinkMarkets Spot Gold Continuous. Vantage MT5 remains the only GoldFlow signal source.";
    function embed(id,src,config,fallback){
      var el=$(id);if(!el)return;el.innerHTML='<div class="tvHybridLoading">Loading TradingView reference widget…</div>';
      var box=document.createElement("div");box.className="tradingview-widget-container";box.style.height="100%";box.style.width="100%";
      var script=document.createElement("script"),settled=false;script.type="text/javascript";script.async=true;script.src=src;script.textContent=JSON.stringify(config);
      function fail(reason){if(settled||generation!==state.tvWidgetGeneration)return;settled=true;markTVFallback(reason);fallback()}
      script.onerror=function(){fail("provider/script blocked")};
      box.appendChild(script);el.innerHTML="";el.appendChild(box);
      setTimeout(function(){if(generation!==state.tvWidgetGeneration)return;if(el.querySelector("iframe"))settled=true;else fail("widget did not render")},5000);
    }
    embed("v8TVTechnical","https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js",
      {interval:"1h",width:"100%",height:"460",symbol:sym,showIntervalTabs:true,displayMode:"single",locale:"en",colorTheme:"dark",isTransparent:true},
      function(){renderTVTechnicalFallback(selectedTf)});
    embed("v8TVMarket","https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js",
      {colorTheme:"dark",dateRange:"1D",showChart:true,locale:"en",largeChartUrl:"",isTransparent:true,showSymbolLogo:true,showFloatingTooltip:true,width:"100%",height:"460",
       tabs:[{title:"Macro references",symbols:[{s:"THINKMARKETS:XAUUSD247",d:"Gold • ThinkMarkets XAUUSD247"},{s:"TVC:DXY",d:"USD Index"},{s:"TVC:US10Y",d:"US10Y"},{s:"COINBASE:BTCUSD",d:"BTCUSD"}]}]},
      renderTVMarketFallback);
  }
  function attach(){
    setHistoryIndicator(HISTORY_IDS.includes(String(window.selectedIndicator||"").toLowerCase())?String(window.selectedIndicator).toLowerCase():"105");
    ["v8HistoryIndicator","v8PerformanceIndicator"].forEach(function(id){
      if(!$(id))return;$(id).value=historyIndicator();
      $(id).addEventListener("change",function(){
        setHistoryIndicator(this.value);state.history=null;state.performance=null;state.evidence=null;state.historyContext=null;
        if($("v8History")?.classList.contains("on"))loadHistory(true);
        else if($("v8Performance")?.classList.contains("on"))loadPerformance();
      });
    });
    $("gfLocale").onchange=function(){applyLocale(this.value)};
    $("gfSpeakGlobal").onclick=function(){var r=state.evidence?.signal||state.history?.rows?.[0];speechPlay(r?explainText(r):t("researchOnly")+" "+t("disclaimer"))};
    $("gfStop").onclick=speechStop;
    $("gfReplay").onclick=function(){if(state.lastSpeechText)speechPlay(state.lastSpeechText)};
    $("gfPause").onclick=function(){if(!("speechSynthesis" in window))return;if(speechSynthesis.paused)speechSynthesis.resume();else if(speechSynthesis.speaking)speechSynthesis.pause()};
    $("v8HistoryRefresh").onclick=function(){loadHistory(true)};
    $("v8PerformanceRefresh").onclick=loadPerformance;
    $("v8EvidenceLoad").onclick=function(){loadEvidence()};
    $("v8EvidenceRead").onclick=function(){if(state.evidence)speechPlay(explainText(state.evidence.signal))};
    $("v8EvidencePng").onclick=downloadEvidencePng;
    $("v8EvidenceJson").onclick=function(){if(state.evidence)downloadJSON(state.evidence,"goldflow-v8-"+state.evidence.signalId+".json")};
    $("v8EvidenceCsv").onclick=function(){if(state.evidence)window.location.href=evidenceURL(state.evidence.signalId,"csv")};
    $("v8NewsRefresh").onclick=function(){loadNews(true)};
    $("gfBlogRefresh").onclick=function(){loadBlog();loadWorldNews(true)};
    ["symbolSelect","tfSelect"].forEach(function(id){
      $(id)?.addEventListener("change",function(){
        state.tvReady=false;
        if($("tvPage")?.classList.contains("on"))setTimeout(loadTVTools,60);
      });
    });
    document.querySelectorAll("nav .tab").forEach(function(b){b.addEventListener("click",function(){
      if(b.dataset.page==="v8History")loadHistory();
      if(b.dataset.page==="v8Performance")loadPerformance();
      if(b.dataset.page==="v8Evidence"){
        (async function(){
          var context=historyContext();
          if(!state.history||state.historyContext!==context)await loadHistory(true);
          var rows=state.history?.rows||[];
          fillEvidenceChoices(rows);
          if($("v8EvidenceContext")){
           $("v8EvidenceContext").textContent="Historical reconstruction • "+context+" • "+historyMeta(historyIndicator()).label+
             ". Evidence follows the explicit History Indicator selector, not a different live indicator. Generated from currently available broker candles; NOT forward-published trade proof.";
          }
          var first=rows[0]?.signalId;
          if(first){$("v8EvidenceSelect").value=first;await loadEvidence(first)}
          else await loadEvidence("");
        })().catch(function(e){$("v8EvidenceSummary").textContent="Evidence loading failed: "+String(e.message||e)});
      }
      if(b.dataset.page==="v8News"){loadNews();recordWorldSeen();}
      if(b.dataset.page==="blogPage"){loadBlog();loadWorldNews(false)};
      if(b.dataset.page==="tvPage")loadTVTools();
    })});
  }
  // Open-page monitoring: latest publisher headlines every ~5 minutes.
  // Background browser tabs may throttle polling; visibility restores freshness.
  setInterval(function(){if(!document.hidden)loadWorldNews(false)},300000);
  document.addEventListener("visibilitychange",function(){
   if(!document.hidden)loadWorldNews(false);
  });
  attach();initLocale();
  setTimeout(function(){if(!document.hidden)loadWorldNews(false)},2200); // check NEW stories soon after site open, not only after visiting News tab
})();