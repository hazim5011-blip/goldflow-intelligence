"use strict";
(function(){
  var state={history:null,performance:null,evidence:null,news:null,locale:"en",en:{},dict:{},voices:[],speech:null,lastSpeechText:"",tvReady:false,evidenceChart:null,lastFocus:"history"};
  var SUPPORTED=["ms","en","id","zh-CN","zh-TW","ar","hi","es","fr","de","pt","ru","ja","ko","tr","th","vi","fil","ur","bn","ta","it"];
  var NAMES={"ms":"Bahasa Melayu","en":"English","id":"Bahasa Indonesia","zh-CN":"简体中文","zh-TW":"繁體中文","ar":"العربية","hi":"हिन्दी","es":"Español","fr":"Français","de":"Deutsch","pt":"Português","ru":"Русский","ja":"日本語","ko":"한국어","tr":"Türkçe","th":"ไทย","vi":"Tiếng Việt","fil":"Filipino","ur":"اردو","bn":"বাংলা","ta":"தமிழ்","it":"Italiano"};
  var $=function(id){return document.getElementById(id)};
  function safe(v){return String(v==null?"":v).replace(/[&<>"']/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]})}
  function finite(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))}
  function t(k){return state.dict[k]||state.en[k]||k}
  function number(v,d){return finite(v)?Number(v).toLocaleString(state.locale,{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d}):"N/A"}
  function signed(v,d){if(!finite(v))return "N/A";return (Number(v)>0?"+":"")+number(v,d==null?2:d)}
  function money(v){return finite(v)?signed(v,2)+" USD":"N/A"}
  function dt(v){if(!v)return "N/A";var x=new Date(v);return Number.isNaN(x.getTime())?"N/A":new Intl.DateTimeFormat(state.locale,{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(x)+" MYT"}
  function uri(params){return "symbol="+encodeURIComponent(window.selectedSymbol||document.getElementById("symbolSelect")?.value||"XAUUSD")+"&tf="+encodeURIComponent(window.selectedTF||"M5")+"&indicator="+encodeURIComponent(window.selectedIndicator||"105")+(params||"")}
  async function json(url){var r=await fetch(url,{cache:"no-store"}),j=await r.json();if(!r.ok||j.ok===false)throw Error(j.error||("HTTP "+r.status));return j}
  function notice(id,msg,bad){if($(id)){$(id).className=bad?"notice bad":"notice info";$(id).textContent=msg}}
  function stat(label,value,detail){
    return '<div class="v8Metric"><small>'+safe(label)+'</small><strong>'+safe(value)+'</strong>'+(detail?'<span>'+safe(detail)+'</span>':"")+'</div>';
  }
  function outcomeStyle(o){return ["TP1","TP2","TP3","BE_POSITIVE","TRAILING"].includes(o)?"g":o==="SL"?"r":"y"}
  function unitText(r){return /XAU|XAG/.test(r.symbolResolved||"")?"USD/oz (quote move)":(r.currencyProfit||"symbol quote")+" price move"}
  function resultStats(st){
    if(!st)return "";
    return stat(t("strictWR"),finite(st.strictWinRate)?number(st.strictWinRate,1)+"%":"N/A",t("strictFormula"))+
      stat(t("positive"),number(st.positive,0),t("tpTrailingBePositive"))+
      stat(t("negative"),number(st.negative,0),"SL")+
      stat(t("beZero"),number(st.beZero,0),t("excludedWR"))+
      stat(t("ambiguous"),number(st.ambiguous,0),t("intrabarUnknown"))+
      stat(t("grossPL"),money(st.grossPLUSD),"0.01 lot • "+(st.grossCoverage||0)+" records • excludes costs")+
      stat(t("totalR"),signed(st.totalR,2),(st.rCoverage||0)+" records")+
      stat(t("legacyWR"),finite(st.legacyWinRate)?number(st.legacyWinRate,1)+"%":"N/A","includes BE0");
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
    if(state.performance)renderPerformance(state.performance);
    if(state.news)renderNews(state.news);
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
    notice("v8HistoryStatus",t("loadingBroker"));
    try{
      var params="&limit=160";
      if($("v8Start").value)params+="&from="+encodeURIComponent($("v8Start").value);
      if($("v8End").value)params+="&to="+encodeURIComponent($("v8End").value);
      params+="&direction="+encodeURIComponent($("v8Direction").value);
      var data=await json("/api/history?"+uri(params));
      state.history=data;renderHistory(data);
      fillEvidenceChoices(data.rows||[]);
    }catch(e){state.history=null;rows.innerHTML="";$("v8Summary").innerHTML="";notice("v8HistoryStatus",e.message,true)}
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
    $("v8HistoryStatus").textContent=data.symbolResolved+" • "+data.tf+" • "+data.availableSignals+" "+t("availableSignals")+" • "+t("brokerWindow")+" "+dt(data.dataWindow?.startUTC)+" – "+dt(data.dataWindow?.endUTC);
    $("v8Summary").innerHTML=resultStats(data.stats);
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
    notice("v8PerformanceStatus",safe(data.symbol)+" • "+data.indicator+" • "+data.tf+" • "+t("brokerWindow")+" "+dt(data.dataWindow?.startUTC)+" – "+dt(data.dataWindow?.endUTC));
    $("v8PerformanceSummary").innerHTML=resultStats(data.summary);
    $("v8MonthComparison").innerHTML=renderComparison(data.comparison);
    var arr=data.groups||[];
    $("v8PeriodTable").innerHTML=arr.length?'<table class="v8Table"><thead><tr><th>'+t("period")+'</th><th>'+t("totalSignals")+'</th><th>'+t("completed")+'</th><th>'+t("positive")+'</th><th>'+t("negative")+'</th><th>'+t("beZero")+'</th><th>'+t("ambiguous")+'</th><th>'+t("strictWR")+'</th><th>'+t("totalR")+'</th><th>'+t("grossPL")+'</th></tr></thead><tbody>'+
      arr.map(function(s){return '<tr><td><b>'+safe(s.period)+'</b></td><td>'+number(s.totalSignals,0)+'</td><td>'+number(s.completed,0)+'</td><td class="g">'+number(s.positive,0)+'</td><td class="r">'+number(s.negative,0)+'</td><td>'+number(s.beZero,0)+'</td><td>'+number(s.ambiguous,0)+'</td><td>'+(finite(s.strictWinRate)?number(s.strictWinRate,1)+"%":"N/A")+'</td><td>'+signed(s.totalR,2)+'</td><td>'+money(s.grossPLUSD)+'</td></tr>'}).join("")+'</tbody></table>':'<p>'+t("noSignalsInWindow")+'</p>';
  }
  async function loadPerformance(){
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
    if(!id){$("v8EvidenceSummary").textContent=t("selectSignal");return}
    $("v8EvidenceSummary").textContent=t("loadingBroker");
    try{
      var data=await json(evidenceURL(id));state.evidence=data;renderEvidence(data);
      $("v8EvidenceRead").disabled=false;$("v8EvidenceJson").disabled=false;$("v8EvidenceCsv").disabled=false;
      $("v8EvidencePng").disabled=!(state.evidenceChart&&typeof state.evidenceChart.takeScreenshot==="function");
    }catch(e){state.evidence=null;$("v8EvidenceSummary").textContent=e.message;["v8EvidenceRead","v8EvidencePng","v8EvidenceJson","v8EvidenceCsv"].forEach(function(x){$(x).disabled=true})}
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
    if(!state.evidenceChart||typeof state.evidenceChart.takeScreenshot!=="function")return;
    try{
      var canvas=state.evidenceChart.takeScreenshot(),a=document.createElement("a");
      a.href=canvas.toDataURL("image/png");
      a.download="goldflow-v8-"+(state.evidence?.signalId||"evidence")+"-marked-chart.png";
      a.click();
    }catch(e){window.alert("Marked chart export is unavailable in this browser.")}
  }
  function drawProof(data){
    var el=$("v8EvidenceChart");if(!el)return;el.innerHTML="";
    if(state.evidenceChart){try{state.evidenceChart.remove()}catch(e){}state.evidenceChart=null}
    var rows=(data.ohlc||[]).filter(function(b){return finite(b.t)&&finite(b.o)&&finite(b.h)&&finite(b.l)&&finite(b.c)}).sort(function(a,b){return a.t-b.t});
    if(!rows.length){el.textContent=t("noArchivedCandles");return}
    if(typeof LightweightCharts==="undefined"){el.innerHTML=rows.slice(-12).map(function(b){return '<div>'+dt(new Date(b.t*1000))+" O "+b.o+" H "+b.h+" L "+b.l+" C "+b.c+'</div>'}).join("");return}
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
  async function loadNews(force){
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
    var releases=data.verifiedReleases||data.latestOfficialEvents||[],observations=data.latestOfficialObservations||[];
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
  }

  var blogCache=null;
  function renderBlog(){
    var el=$("gfBlogPosts");if(!el||!blogCache)return;
    var ms=["ms","id"].includes(state.locale);
    el.innerHTML=blogCache.map(function(p){
      var title=ms?p.titleMS:p.titleEN,summary=ms?p.summaryMS:p.summaryEN,body=ms?p.bodyMS:p.bodyEN;
      return '<details class="gfBlogPost"><summary><span class="gfBlogCategory">'+safe(p.category)+'</span><b>'+safe(title)+'</b><small>'+safe(p.dateUTC)+' • '+safe(p.version)+' • '+safe(p.changeType)+'</small><p>'+safe(summary)+'</p></summary><div class="gfBlogBody">'+
        '<p>'+safe(body)+'</p><p class="v8Footnote">'+safe(p.qualityNote||"")+'</p></div></details>';
    }).join("")||"<p>No published articles yet.</p>";
  }
  async function loadBlog(){
    var el=$("gfBlogPosts");if(!el)return;
    $("gfBlogNote").textContent="Loading published GoldFlow articles…";
    try{
      var r=await fetch("/blog/posts.json",{cache:"no-store"}),j=await r.json();
      if(!r.ok||!Array.isArray(j.posts))throw Error("BLOG_FEED_UNAVAILABLE");
      blogCache=j.posts.filter(function(p){return p&&p.published===true}).sort(function(a,b){return b.dateUTC.localeCompare(a.dateUTC)});
      renderBlog();$("gfBlogNote").textContent="Verified release notes and methodology. No claims of executed trades without forward proof.";
    }catch(e){el.textContent="Blog is temporarily unavailable.";$("gfBlogNote").textContent=e.message}
  }
  function loadTVTools(){
    var sym=(window.tvSymbol&&window.selectedSymbol)?window.tvSymbol(window.selectedSymbol):"OANDA:XAUUSD";
    if(state.tvReady&&state.tvSymbol===sym)return;
    state.tvReady=true;state.tvSymbol=sym;
    if(/THINKMARKETS:XAUUSD247/.test(sym))sym="OANDA:XAUUSD";
    $("v8TVNote").textContent="Reference provider: "+sym+" • Vantage MT5 remains the only signal source. Differences in spread, symbol and timing are normal.";
    function embed(id,src,config){
      var el=$(id);if(!el)return;el.innerHTML="";
      var box=document.createElement("div");box.className="tradingview-widget-container";box.style.height="100%";box.style.width="100%";
      var script=document.createElement("script");script.type="text/javascript";script.async=true;script.src=src;script.textContent=JSON.stringify(config);
      script.onerror=function(){el.innerHTML='<p class="sub" style="padding:10px">TradingView reference widget unavailable. Use the broker chart for Vantage candles.</p>'};
      box.appendChild(script);el.appendChild(box);
    }
    embed("v8TVTechnical","https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js",
      {interval:"1h",width:"100%",height:"330",symbol:sym,showIntervalTabs:true,displayMode:"single",locale:"en",colorTheme:"dark",isTransparent:true});
    embed("v8TVMarket","https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js",
      {colorTheme:"dark",dateRange:"1D",showChart:true,locale:"en",largeChartUrl:"",isTransparent:true,showSymbolLogo:true,showFloatingTooltip:true,width:"100%",height:"330",
       tabs:[{title:"Macro references",symbols:[{s:"OANDA:XAUUSD",d:"Gold ref."},{s:"TVC:DXY",d:"USD Index"},{s:"TVC:US10Y",d:"US10Y"},{s:"COINBASE:BTCUSD",d:"BTCUSD"}]}]});
  }
  function attach(){
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
    $("gfBlogRefresh").onclick=loadBlog;
    ["symbolSelect","tfSelect"].forEach(function(id){
      $(id)?.addEventListener("change",function(){
        state.tvReady=false;
        if($("tvPage")?.classList.contains("on"))setTimeout(loadTVTools,60);
      });
    });
    document.querySelectorAll("nav .tab").forEach(function(b){b.addEventListener("click",function(){
      if(b.dataset.page==="v8History")loadHistory();
      if(b.dataset.page==="v8Performance")loadPerformance();
      if(b.dataset.page==="v8Evidence"&&!state.history)loadHistory().then(function(){fillEvidenceChoices(state.history?.rows||[])});
      if(b.dataset.page==="v8News")loadNews();
      if(b.dataset.page==="blogPage")loadBlog();
      if(b.dataset.page==="tvPage")loadTVTools();
    })});
  }
  attach();initLocale();
})();