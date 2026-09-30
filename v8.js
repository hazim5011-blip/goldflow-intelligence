(function(){
var LOCALES=["ms","en","id","zh-CN","zh-TW","ar","hi","es","fr","de","pt","ru","ja","ko","tr","th","vi","fil","ur","bn","ta","it"];
var VOICE={ms:"ms-MY",en:"en-US",id:"id-ID","zh-CN":"zh-CN","zh-TW":"zh-TW",ar:"ar-SA",hi:"hi-IN",es:"es-ES",fr:"fr-FR",de:"de-DE",pt:"pt-PT",ru:"ru-RU",ja:"ja-JP",ko:"ko-KR",tr:"tr-TR",th:"th-TH",vi:"vi-VN",fil:"fil-PH",ur:"ur-PK",bn:"bn-BD",ta:"ta-IN",it:"it-IT"};
var TXT={
 en:{history:"History Pro",performance:"Performance",evidence:"Evidence",news:"News Study",explain:"AI Explain / Read Aloud",sim:"HISTORICAL SIMULATION",proof:"Not contemporaneous publication proof.",noExit:"Exact exit price/time is not available in the legacy simulation record.",validOnly:"VALID only — no TP/SL win rate is defined for this engine.",research:"Research/education only. Past performance does not guarantee future results."},
 ms:{history:"History Pro",performance:"Prestasi",evidence:"Evidence",news:"Kajian News",explain:"AI Explain / Terangkan",sim:"SIMULASI SEJARAH",proof:"Bukan bukti signal diterbitkan pada masa sebenar.",noExit:"Harga/masa keluar tepat belum tersedia dalam rekod simulasi lama.",validOnly:"VALID sahaja — win rate TP/SL tidak ditakrifkan untuk enjin ini.",research:"Untuk kajian/pendidikan sahaja. Prestasi lampau tidak menjamin hasil masa depan."}
};
function locale(){return localStorage.getItem("gf_locale")||((navigator.language||"en").startsWith("ms")?"ms":"en")}
function t(k){var l=locale();return (TXT[l]&&TXT[l][k])||(TXT.en&&TXT.en[k])||k}
function n(v,d){return Number.isFinite(Number(v))?Number(v).toLocaleString(locale(),{maximumFractionDigits:d==null?2:d}):"N/A"}
function when(s){try{return new Intl.DateTimeFormat(locale(),{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kuala_Lumpur"}).format(new Date(s))}catch{return s||"N/A"}}
function activeAnalysis(){return window.lastAnalysis||null}
async function json(u){var r=await fetch(u,{cache:"no-store"}),j=await r.json();if(!r.ok)throw new Error(j.error||("HTTP "+r.status));return j}
function q(){return "?symbol="+encodeURIComponent(window.selectedSymbol||"XAUUSD247")+"&tf="+encodeURIComponent(window.selectedTF||"M5")+"&indicator="+encodeURIComponent(window.selectedIndicator||"105")}
function statusClass(s){return /SL|LOSE/.test(s)?"r":/TP|TRAIL|BE_POSITIVE|WIN/.test(s)?"g":"y"}
async function renderHistoryPro(){
 var el=document.getElementById("historyProRows");if(!el)return;
 el.innerHTML='<div class="sub">Loading...</div>';
 try{var h=await json("/api/history"+q());document.getElementById("historyMode").textContent=t("sim");
 el.innerHTML=(h.records||[]).slice().reverse().map(function(x){
   var move=Number.isFinite(x.priceMove)?n(x.priceMove,5):"N/A",pts=Number.isFinite(x.signedPoints)?n(x.signedPoints,1):"N/A",pips=Number.isFinite(x.signedPips)?n(x.signedPips,1):"N/A",pl=Number.isFinite(x.estimatedGrossPL)?"$"+n(x.estimatedGrossPL,2):"N/A";
   var warn=x.status==="VALID_ONLY"?t("validOnly"):(!x.exitPrice?t("noExit"):"");
   return '<article class="v8record"><div class="v8recHead"><div><b>'+x.symbolResolved+' • '+x.direction+' • '+x.triggerTF+'</b><div class="sub">'+when(x.signalCandleCloseUTC)+' • '+x.signalId+'</div></div><span class="tag '+statusClass(x.status)+'">'+x.status+'</span></div>'+
   '<div class="v8metrics"><div><small>ENTRY</small><b>'+n(x.entry,5)+'</b></div><div><small>SL</small><b>'+n(x.originalSL,5)+'</b></div><div><small>TP1</small><b>'+n(x.tp1,5)+'</b></div><div><small>EXIT</small><b>'+n(x.exitPrice,5)+'</b></div><div><small>MOVE</small><b>'+move+'</b></div><div><small>POINTS</small><b>'+pts+'</b></div><div><small>PIPS</small><b>'+pips+'</b></div><div><small>GROSS 0.01</small><b>'+pl+'</b></div></div>'+
   '<div class="reason">'+(x.reasons||[]).join(" + ")+'</div><div class="v8warn">'+warn+'</div><div class="sub">'+t("sim")+' • '+t("proof")+'</div></article>';
 }).join("")||'<div class="sub">No records.</div>';}catch(e){el.innerHTML='<div class="notice bad">'+e.message+'</div>'}
}
async function renderPerformance(){
 var el=document.getElementById("performanceBody");if(!el)return;
 try{var p=await json("/api/performance"+q()),c=p.counts||{};
 var wr=Number.isFinite(p.strictWinRate)?n(p.strictWinRate,1)+"%":"N/A",legacy=Number.isFinite(p.legacyWinRate)?n(p.legacyWinRate,1)+"%":"N/A";
 el.innerHTML='<div class="grid g5"><div class="card kpi"><small>TOTAL</small><strong>'+c.total+'</strong></div><div class="card kpi"><small>COMPLETED</small><strong>'+c.completed+'</strong></div><div class="card kpi"><small>TP/TR</small><strong>'+(c.tp+c.trailing)+'</strong></div><div class="card kpi"><small>SL</small><strong>'+c.sl+'</strong></div><div class="card kpi"><small>STRICT WR</small><strong>'+wr+'</strong><span>'+p.strictNumerator+' / '+p.strictDenominator+'</span></div></div>'+
 '<div class="card sec"><div class="head"><h3>Outcome integrity</h3><span class="tag y">'+t("sim")+'</span></div><div class="stats"><div><small>TRAILING</small><b>'+c.trailing+'</b></div><div><small>BE+</small><b>'+c.bePositive+'</b></div><div><small>BE0</small><b>'+c.beZero+'</b></div><div><small>AMBIGUOUS</small><b>'+c.ambiguous+'</b></div><div><small>VALID ONLY</small><b>'+c.validOnly+'</b></div><div><small>LEGACY WR</small><b>'+legacy+'</b></div></div><div class="v8warn">'+(p.note||t("noExit"))+'</div></div>';
 }catch(e){el.innerHTML='<div class="notice bad">'+e.message+'</div>'}
}
function renderEvidence(){
 var el=document.getElementById("evidenceBody"),a=activeAnalysis();if(!el)return;
 var cnt=a&&a.indicator&&a.indicator.history?a.indicator.history.length:0;
 el.innerHTML='<div class="card"><div class="head"><h3>Evidence status</h3><span class="tag y">PROOF PENDING</span></div>'+
 '<div class="reason"><b>'+cnt+'</b> reconstructed closed-candle records are currently visible for the selected engine. They are <b>HISTORICAL_SIM</b>, not verified contemporaneous publication records.</div>'+
 '<div class="v8warn">Forward ledger, archived publication-time OHLC, chained SHA-256 event storage and captured-at-publication screenshots are not yet enabled in this staging phase. TradingView remains an independent reference source.</div></div>';
}
function explainText(){
 var a=activeAnalysis();if(!a||!a.ready)return "GoldFlow analysis is not ready.";
 var s=a.indicator&&a.indicator.latestSignal||{},dir=Number(s.direction)>0?"BUY":Number(s.direction)<0?"SELL":"WAIT",rs=(s.reasons||[]).join(", ")||"no confirmed trigger";
 return (locale()==="ms"?
  "GoldFlow mengkaji "+(a.symbol||"simbol")+" pada "+a.triggerTF+". Arah kajian semasa ialah "+dir+". Skor "+n(s.score,0)+" peratus. Sebab utama: "+rs+". Rekod sejarah yang dipaparkan ialah simulasi candle tertutup dan bukan bukti penerbitan masa nyata. "+t("research"):
  "GoldFlow is studying "+(a.symbol||"the symbol")+" on "+a.triggerTF+". Current study direction is "+dir+". Score "+n(s.score,0)+" percent. Main reasons: "+rs+". Displayed history is closed-candle simulation, not contemporaneous publication proof. "+t("research"));
}
function speak(){
 var box=document.getElementById("explainText"),txt=explainText();if(box)box.textContent=txt;
 if(!("speechSynthesis" in window)){if(box)box.textContent=txt+" Speech synthesis is unavailable in this browser.";return}
 speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(txt);u.lang=VOICE[locale()]||VOICE.en;u.rate=Number(document.getElementById("speechRate")?.value||1);speechSynthesis.speak(u);
}
function setupLocale(){
 var s=document.getElementById("localeSelect");if(!s)return;s.innerHTML=LOCALES.map(function(x){return '<option value="'+x+'">'+x+'</option>'}).join("");s.value=locale();
 s.onchange=function(){localStorage.setItem("gf_locale",this.value);document.documentElement.lang=this.value;document.documentElement.dir=/^(ar|ur)/.test(this.value)?"rtl":"ltr";renderAll()};
 document.documentElement.dir=/^(ar|ur)/.test(locale())?"rtl":"ltr";
}
function renderAll(){renderHistoryPro();renderPerformance();renderEvidence();var b=document.getElementById("explainBtn");if(b)b.textContent="🔊 "+t("explain")}
var old=window.renderHistory;
if(typeof old==="function")window.renderHistory=function(rows){old(rows);setTimeout(renderAll,0)};
document.addEventListener("DOMContentLoaded",function(){
 setupLocale();var b=document.getElementById("explainBtn");if(b)b.onclick=speak;
 var stop=document.getElementById("speechStop");if(stop)stop.onclick=function(){if("speechSynthesis" in window)speechSynthesis.cancel()};
 setTimeout(renderAll,300);
});
})();