"use strict";
(function(){
  var state={loading:false,last:null,loadedKey:""};
  var $=function(id){return document.getElementById(id)};
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(x){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]})}
  function finite(v){return v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))}
  function num(v,d){return finite(v)?Number(v).toLocaleString("en-US",{minimumFractionDigits:d||0,maximumFractionDigits:d==null?2:d}):"—"}
  function pct(v,d){return finite(v)?num(v,d==null?0:d)+"%":"—"}
  function active(){return !!$("smartQuantPage")?.classList.contains("on")}
  function key(){return [window.selectedSymbol||"XAUUSD247",window.selectedTF||"M5",window.selectedIndicator||"105"].join("|")}
  function cls(status){return status==="PASS"||status==="GOOD"?"good":status==="FAIL"||status==="BAD"?"bad":status==="CAUTION"||status==="WARN"||status==="POOR"||status==="UNVERIFIED"?"warn":"info"}
  function decisionCls(d){return d==="RESEARCH_READY"?"good":d==="WATCH"?"warn":"bad"}
  function price(v,d){return finite(v)?Number(v).toFixed(finite(d)?Math.max(0,Math.min(8,Number(d))):2):"—"}

  function reset(msg){
    if($("sqNotice")){$("sqNotice").className="notice info";$("sqNotice").textContent=msg||"Smart Quant is waiting for data."}
    ["sqDecision","sqSide","sqConfidence","sqProbability","sqRegime","sqRegimeConfidence","sqDataHealth","sqMarketState"].forEach(function(id){if($(id))$(id).textContent="—"});
    if($("sqFunnel"))$("sqFunnel").innerHTML="";
    if($("sqReasons"))$("sqReasons").innerHTML="";
    if($("sqTechnical"))$("sqTechnical").innerHTML="";
    if($("sqMacroDrivers"))$("sqMacroDrivers").innerHTML="";
    if($("sqRegimeEvidence"))$("sqRegimeEvidence").innerHTML="";
    ["sqEdge","sqHistoryEdge","sqCalibration","sqLearning","sqRisk","sqMonteCarlo","sqNewsRisk","sqMtfSummary","sqMtfMatrix","sqTradePlan","sqAnalyst","sqSessionRadar","sqMacroMap","sqAlertPreview"].forEach(function(id){if($(id))$(id).innerHTML=""});
  }

  function renderSessionRadar(s,a){
    var el=$("sqSessionRadar"),tag=$("sqSessionTag");if(!el||!tag)return;
    if(!s||!s.ready){
      tag.textContent="UNAVAILABLE";tag.className="tag y";
      el.innerHTML='<div class="notice info">Session/liquidity data unavailable. Missing broker M5 data is not synthesized.</div>';return;
    }
    var digits=a?.digits??2,active=(s.currentSessions||[]);
    tag.textContent=active.length?active.join(" + "):"OFF SESSION";
    tag.className="tag "+(s.recentSweeps?.length?"r":active.length?"g":"y");
    var range=s.primarySessionRange||{},pos=finite(s.primarySessionPosition)?Math.round(100*s.primarySessionPosition):null;
    var nearest=[
      s.nearestAbove?'<div><small>NEAREST ABOVE</small><strong>'+esc(s.nearestAbove.id)+' '+price(s.nearestAbove.value,digits)+'</strong><span>'+ (finite(s.nearestAbove.distanceAtr)?num(s.nearestAbove.distanceAtr,2)+" ATR":"—") +'</span></div>':"",
      s.nearestBelow?'<div><small>NEAREST BELOW</small><strong>'+esc(s.nearestBelow.id)+' '+price(s.nearestBelow.value,digits)+'</strong><span>'+ (finite(s.nearestBelow.distanceAtr)?num(s.nearestBelow.distanceAtr,2)+" ATR":"—") +'</span></div>':""
    ].join("");
    var pools=(s.pools||[]).slice(0,8).map(function(p){
      var state=p.latestSweep?"SWEEP":p.latestBreak?"BREAK":p.side;
      var k=p.latestSweep?"r":p.side==="ABOVE"?"y":"g";
      return '<div class="sqPoolRow"><div><b>'+esc(p.id)+'</b><small>'+esc(p.label)+'</small></div><strong>'+price(p.value,digits)+'</strong><span>'+ (finite(p.distanceAtr)?num(p.distanceAtr,2)+" ATR":"—") +'</span><em class="'+k+'">'+esc(state)+'</em></div>';
    }).join("");
    var sessions=(s.sessions||[]).map(function(x){
      var r=x.range||x.previousRange;
      return '<div class="sqSessionChip '+(x.active?"active":"")+'"><b>'+esc(x.label)+'</b><span>'+ (r?price(r.low,digits)+" – "+price(r.high,digits):"N/A") +'</span></div>';
    }).join("");
    el.innerHTML='<div class="sqSessionHero"><div><small>PRIMARY SESSION</small><strong>'+esc(s.primarySession||"OFF_SESSION")+'</strong><span>'+ (s.overlap?"OVERLAP ACTIVE":"single/none") +'</span></div>'+
      '<div><small>SESSION POSITION</small><strong>'+ (pos==null?"—":pos+"%") +'</strong><span>'+ (finite(range.low)&&finite(range.high)?price(range.low,digits)+" – "+price(range.high,digits):"range unavailable") +'</span></div></div>'+
      '<div class="sqSessionChips">'+sessions+'</div><div class="sqNearestGrid">'+nearest+'</div>'+
      '<div class="sqPools">'+pools+'</div>';
  }

  function renderMacroMap(m){
    var el=$("sqMacroMap"),tag=$("sqMacroMapTag");if(!el||!tag)return;
    if(!m||!m.ok){
      tag.textContent="N/A";tag.className="tag y";
      el.innerHTML='<div class="notice info">Macro contribution map is not applicable or unavailable.</div>';return;
    }
    var bias=m.bias||"MIXED";tag.textContent=bias;tag.className="tag "+(bias==="SUPPORTIVE"?"g":bias==="PRESSURE"?"r":"y");
    var rows=(m.rows||[]).slice(0,9).map(function(x){
      var c=Number(x.contribution||0),k=c>0?"g":c<0?"r":"y";
      return '<div class="sqMacroMapRow"><div><b>'+esc(x.id)+'</b><small>'+esc(x.name)+'</small></div><strong>'+esc(x.display||"—")+'</strong><span class="'+k+'">'+(c>0?"+":"")+num(c,2)+'</span></div>';
    }).join("");
    el.innerHTML='<div class="sqMacroMapHero"><div><small>NET MACRO CONTEXT</small><strong class="'+(bias==="SUPPORTIVE"?"g":bias==="PRESSURE"?"r":"y")+'">'+esc(bias)+'</strong><span>'+ (m.netScore>0?"+":"")+num(m.netScore,2) +'</span></div>'+
      '<div><small>SUPPORT / PRESSURE</small><strong>'+num(m.supportScore,2)+' / '+num(m.pressureScore,2)+'</strong><span>weighted contribution score</span></div></div>'+
      '<div class="sqMacroMapRows">'+rows+'</div><p class="v8Footnote">'+esc(m.note||"")+'</p>';
  }

  function renderAlertPreview(x){
    var el=$("sqAlertPreview"),tag=$("sqAlertTag");if(!el||!tag)return;
    if(!x){tag.textContent="NO ALERT";tag.className="tag";el.innerHTML='<div class="notice info">Alert policy unavailable.</div>';return}
    var sev=x.severity||"INFO",klass=sev==="HIGH"?"r":sev==="MEDIUM"?"y":"g";
    tag.textContent=x.code||"NO ALERT";tag.className="tag "+klass;
    var lines=String(x.telegramText||"").split("\n").map(function(line){return "<div>"+esc(line)+"</div>"}).join("");
    el.innerHTML='<div class="sqAlertHero '+(sev==="HIGH"?"bad":sev==="MEDIUM"?"warn":"good")+'"><div><small>SEVERITY</small><strong>'+esc(sev)+'</strong><span>'+esc(x.reason||"")+'</span></div>'+
      '<div><small>NOTIFY POLICY</small><strong>'+(x.notify?"YES":"NO")+'</strong><span>dedupe '+esc(x.dedupeKey||"—")+'</span></div></div>'+
      '<div class="sqTelegramPreview">'+lines+'</div><p class="v8Footnote">'+esc(x.policy||"")+'</p>';
  }

  function renderTradePlan(p,a){
    var el=$("sqTradePlan"),tag=$("sqPlanStatus");if(!el||!tag)return;
    if(!p){el.innerHTML='<div class="notice info">Trade plan unavailable.</div>';tag.textContent="WAIT";return}
    var status=p.status||"WAIT",good=status==="READY_NEAR_ENTRY",bad=status==="INVALIDATED"||status==="INVALID_PLAN"||status==="BLOCK_NEWS",warn=!good&&!bad;
    tag.textContent=status;tag.className="tag "+(good?"g":bad?"r":"y");
    var digits=a?.digits??2;
    var zone=p.activeZone&&finite(p.activeZone.low)&&finite(p.activeZone.high)?price(p.activeZone.low,digits)+" – "+price(p.activeZone.high,digits):"—";
    el.innerHTML='<div class="sqPlanHero '+(good?"good":bad?"bad":"warn")+'"><div><small>PLAN STATE</small><strong>'+esc(status)+'</strong><span>'+esc(p.action||"")+'</span></div>'+
      '<div><small>SIDE</small><strong class="'+(Number(p.direction)>0?"g":Number(p.direction)<0?"r":"y")+'">'+esc(p.side||"WAIT")+'</strong><span>decision '+esc(p.decision||"WAIT")+'</span></div>'+
      '<div><small>CURRENT PRICE</small><strong>'+price(p.price,digits)+'</strong><span>distance '+(finite(p.distanceToEntryAtr)?num(p.distanceToEntryAtr,2)+" ATR":"—")+'</span></div></div>'+
      '<div class="sqPlanGrid">'+
        '<div><small>ENTRY</small><strong>'+price(p.entry,digits)+'</strong><span>preferred model entry</span></div>'+
        '<div><small>SL / INVALIDATION</small><strong>'+price(p.sl,digits)+'</strong><span>risk distance '+price(p.riskDistance,digits)+'</span></div>'+
        '<div><small>TP1</small><strong>'+price(p.tp1,digits)+'</strong><span>'+(finite(p.rr?.tp1)?num(p.rr.tp1,2)+"R":"R:R N/A")+'</span></div>'+
        '<div><small>TP2</small><strong>'+price(p.tp2,digits)+'</strong><span>'+(finite(p.rr?.tp2)?num(p.rr.tp2,2)+"R":"R:R N/A")+'</span></div>'+
        '<div><small>TP3</small><strong>'+price(p.tp3,digits)+'</strong><span>'+(finite(p.rr?.tp3)?num(p.rr.tp3,2)+"R":"R:R N/A")+'</span></div>'+
        '<div><small>ACTIVE ZONE</small><strong>'+esc(zone)+'</strong><span>'+ (p.noChase?"NO-CHASE active":p.newsBlocked?"NEWS BLOCK":"broker-zone context") +'</span></div>'+
      '</div>';
  }

  function renderAnalyst(a){
    var el=$("sqAnalyst");if(!el)return;
    if(!a){el.innerHTML='<div class="notice info">Smart Analyst unavailable.</div>';return}
    function items(arr,empty){return (arr||[]).length?(arr||[]).map(function(x){return "<li>"+esc(x)+"</li>"}).join(""):"<li>"+esc(empty)+"</li>"}
    var next=a.nextHighImpact?('<div class="sqAnalystNews"><small>NEXT HIGH IMPACT</small><strong>'+esc(a.nextHighImpact.type||a.nextHighImpact.title||"EVENT")+'</strong><span>'+new Date(a.nextHighImpact.scheduledAtUTC).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"})+' MYT</span></div>'):"";
    el.innerHTML='<div class="sqAnalystHero"><strong>'+esc(a.headline||"WAIT")+'</strong><span>'+esc(a.action||"")+'</span></div>'+
      '<div class="grid g3 sqAnalystGrid"><div><h4>Yang menyokong</h4><ul>'+items(a.support,"Belum ada sokongan utama.")+'</ul></div>'+
      '<div><h4>Yang masih menghalang</h4><ul>'+items(a.blockers,"Tiada blocker utama yang direkodkan.")+'</ul></div>'+
      '<div><h4>Amaran</h4><ul>'+items(a.warnings,"Tiada amaran tambahan.")+'</ul></div></div>'+
      '<div class="sqAnalystRisk"><div><small>RISK SUMMARY</small><span>'+esc(a.riskSummary||"")+'</span></div><div><small>MONTE CARLO</small><span>'+esc(a.monteCarloSummary||"")+'</span></div>'+next+'</div>';
  }

  function renderFunnel(decision){
    var el=$("sqFunnel");if(!el)return;
    el.innerHTML=(decision?.gates||[]).map(function(g,i){
      return '<div class="sqGate '+cls(g.status)+'"><div class="sqGateStep">'+String(i+1).padStart(2,"0")+'</div><div class="sqGateBody"><div class="sqGateTop"><b>'+esc(g.label)+'</b><span class="sqGateStatus">'+esc(g.status)+'</span></div><p>'+esc(g.reason)+'</p></div></div>';
    }).join("")||'<div class="sub">No decision gates.</div>';
  }

  function renderMtf(m){
    var summary=$("sqMtfSummary"),el=$("sqMtfMatrix");if(!summary||!el)return;
    if(!m||m.unavailable){
      summary.innerHTML='<div class="notice info">MTF matrix unavailable. Missing broker timeframe data is not synthesized.</div>';el.innerHTML="";return;
    }
    var nd=Number(m.netDirection||0),klass=nd>0?"g":nd<0?"r":"y";
    summary.innerHTML='<div class="sqMtfHero"><div><small>NET MTF BIAS</small><strong class="'+klass+'">'+esc(m.netBias||"MIXED")+'</strong><span>'+num(m.netScore,1)+' weighted score</span></div>'+
      '<div><small>ALIGNMENT</small><strong>'+esc(m.alignment?.aligned??0)+' / '+esc(m.readyCount??0)+'</strong><span>aligned • opposed '+esc(m.alignment?.opposed??0)+' • neutral '+esc(m.alignment?.neutral??0)+'</span></div>'+
      '<div><small>DATA COVERAGE</small><strong>'+esc(m.readyCount??0)+' / '+esc(m.total??7)+'</strong><span>closed-candle timeframes ready</span></div></div>';
    el.innerHTML='<div class="sqMtfHeader"><span>TF</span><span>STATE</span><span>CONF</span><span>CLOSE</span><span>EMA20/50</span><span>STRUCTURE</span></div>'+
      (m.rows||[]).map(function(x){
        if(!x.ready)return '<div class="sqMtfRow unavailable"><b>'+esc(x.tf)+'</b><span>UNAVAILABLE</span><span>—</span><span>—</span><span>—</span><span>'+esc(x.reason||"")+'</span></div>';
        var c=Number(x.direction)>0?"g":Number(x.direction)<0?"r":"y";
        var struct=x.structure?.breakoutUp?"BREAK↑":x.structure?.breakoutDown?"BREAK↓":x.structure?.sweepLow?"SWEEP LOW":x.structure?.sweepHigh?"SWEEP HIGH":"NORMAL";
        return '<div class="sqMtfRow"><b>'+esc(x.tf)+'</b><span class="'+c+'">'+esc(x.trend)+'</span><span>'+pct(x.confidence,0)+'</span><span>'+num(x.close,2)+'</span><span>'+num(x.ema20,2)+' / '+num(x.ema50,2)+'</span><span>'+esc(struct)+'</span></div>';
      }).join("");
  }

  function renderTechnical(j){
    var a=j.analysis||{},f=j.features||{},sig=a.latestSignal||{},d=a.digits;
    var rows=[
      ["Broker price",price(a.price,d),"Vantage MT5"],
      ["Signal",sig.code||"WAIT",finite(sig.score)?("engine score "+pct(sig.score,0)):"no score"],
      ["ATR14",price(f.atr14,d),finite(f.atrPercentile)?("volatility percentile "+pct(f.atrPercentile,0)):""],
      ["EMA20 / EMA50",price(f.ema20,d)+" / "+price(f.ema50,d),finite(f.emaSpreadAtr)?("spread "+num(f.emaSpreadAtr,2)+" ATR"):""],
      ["EMA20 slope",finite(f.ema20SlopeAtr5)?num(f.ema20SlopeAtr5,2)+" ATR/5 bars":"—","closed-candle normalized"],
      ["Spread / ATR",finite(f.spreadToAtr)?pct(100*f.spreadToAtr,1):"—","execution quality"],
      ["Entry distance",finite(f.entryDistanceAtr)?num(f.entryDistanceAtr,2)+" ATR":"—","distance from model entry"],
      ["Closed bars",f.closedBars??"—","forming candle excluded"]
    ];
    $("sqTechnical").innerHTML=rows.map(function(r){return '<div class="sqMetric"><small>'+esc(r[0])+'</small><strong>'+esc(r[1])+'</strong><span>'+esc(r[2])+'</span></div>'}).join("");
  }

  function renderMacro(macro){
    var el=$("sqMacroDrivers");if(!el)return;
    if(!macro?.ok){el.innerHTML='<div class="notice info">Gold-specific macro context is not available for this symbol/request.</div>';return}
    var top='<div class="sqMacroSummary"><div><small>Gold macro bias</small><strong>'+esc(macro.gold?.bias||"MIXED")+'</strong><span>Derived score '+esc(macro.gold?.score??"—")+'/100</span></div>'+
      '<div><small>Macro regime</small><strong>'+esc(macro.regime?.name||"—")+'</strong><span>'+esc(macro.regime?.note||"")+'</span></div>'+
      '<div><small>Fresh inputs</small><strong>'+esc((macro.quality?.fresh??"—")+"/"+(macro.quality?.total??"—"))+'</strong><span>frequency-aware context</span></div></div>';
    var drivers=(macro.drivers||[]).map(function(x){
      var impact=x.goldImpact||"MIXED";
      return '<div class="sqDriver '+(x.stale?"stale":"")+'"><div><b>'+esc(x.name)+'</b><small>'+esc(x.source||"")+' • '+esc(x.frequency||"")+'</small></div><strong>'+esc(x.display||"—")+'</strong><span class="'+(impact==="SUPPORTIVE"?"g":impact==="PRESSURE"?"r":"y")+'">'+esc(impact)+'</span></div>';
    }).join("");
    el.innerHTML=top+'<div class="sqDrivers">'+drivers+'</div>';
  }

  function renderRegime(r){
    var el=$("sqRegimeEvidence");if(!el)return;
    var support=(r?.support||[]).map(function(x){return "<li>"+esc(x)+"</li>"}).join("")||"<li>No supporting evidence recorded.</li>";
    var opposition=(r?.opposition||[]).map(function(x){return "<li>"+esc(x)+"</li>"}).join("")||"<li>No major opposition recorded.</li>";
    var conditions=(r?.conditions||[]).map(function(x){return '<span class="tag">'+esc(x)+'</span>'}).join(" ");
    el.innerHTML='<div class="sqConditions">'+conditions+'</div><div class="grid g2"><div><h4>Supporting evidence</h4><ul class="sqList">'+support+'</ul></div><div><h4>Opposing / risk evidence</h4><ul class="sqList">'+opposition+'</ul></div></div>';
  }

  function renderNewsRisk(news){
    var el=$("sqNewsRisk");if(!el)return;
    if(!news||news.verification!=="VERIFIED_OFFICIAL_SCHEDULES"){
      el.innerHTML='<div class="sqNewsBox warn"><div><small>UPCOMING NEWS RISK</small><strong>UNVERIFIED / PARTIAL</strong></div><p>Official schedule coverage is incomplete. Smart Quant will not treat news risk as clear.</p></div>';return;
    }
    var next=news.nextHighImpact,mins=Number(news.minutesToNextHigh);
    var label=news.status==="BLOCK_HIGH_IMPACT"?"BLOCK":news.status==="EVENT_SOON"?"CAUTION":"CLEAR";
    var klass=label==="BLOCK"?"bad":label==="CAUTION"?"warn":"good";
    var nextText=next?next.type+" • "+new Date(next.scheduledAtUTC).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}):"No high-impact event in available horizon";
    var rows=(news.upcoming||[]).slice(0,6).map(function(x){
      var when=new Date(x.scheduledAtUTC).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
      return '<div class="sqNewsRow"><div><b>'+esc(x.type)+'</b><small>'+esc(x.source)+'</small></div><strong>'+esc(when)+'</strong><span class="'+(x.impact==="HIGH"?"r":"y")+'">'+esc(x.impact)+'</span></div>';
    }).join("");
    el.innerHTML='<div class="sqNewsBox '+klass+'"><div><small>UPCOMING NEWS RISK</small><strong>'+label+'</strong><span>'+esc(nextText)+(finite(mins)&&mins>0?" • "+Math.round(mins)+" min":"")+'</span></div><p>'+esc(news.note||"")+'</p></div><div class="sqNewsRows">'+rows+'</div>';
  }

  function renderEdge(edge,hist){
    if($("sqEdge")){
      var comps=(edge?.components||[]).map(function(x){
        var c=Number(x.contribution||0),klass=c>0?"g":c<0?"r":"y";
        return '<div class="sqEdgeRow"><div><b>'+esc(x.label)+'</b><small>'+esc(x.detail||"")+'</small></div><strong class="'+klass+'">'+(c>0?"+":"")+num(c,1)+'</strong></div>';
      }).join("");
      $("sqEdge").innerHTML='<div class="sqEdgeHero"><div><small>DIRECTIONAL EDGE INDEX</small><strong class="'+(edge?.bias==="BULLISH"?"g":edge?.bias==="BEARISH"?"r":"y")+'">'+esc(edge?.directionalEdgeIndex??"—")+'</strong><span>'+esc(edge?.bias||"MIXED")+' • coverage '+esc(edge?.coverage??"—")+'%</span></div><p>'+esc(edge?.interpretation||"")+'</p></div><div class="sqEdgeRows">'+comps+'</div>';
    }
    if($("sqHistoryEdge")){
      if(!hist){$("sqHistoryEdge").innerHTML='<div class="notice info">Historical evidence unavailable.</div>';return}
      var lo=hist.winRateWilson95?.low,hi=hist.winRateWilson95?.high;
      var wr=finite(hist.winRate)?pct(100*hist.winRate,1):"—";
      var ci=finite(lo)&&finite(hi)?pct(100*lo,1)+" – "+pct(100*hi,1):"—";
      $("sqHistoryEdge").innerHTML='<div class="sqRiskGrid">'+
        '<div><small>Comparable sample</small><strong>'+esc(hist.sampleCount??0)+'</strong><span>'+esc(hist.selection||"")+'</span></div>'+
        '<div><small>Historical WR</small><strong>'+wr+'</strong><span>Wilson 95% '+ci+'</span></div>'+
        '<div><small>Mean R</small><strong>'+num(hist.meanR,2)+'R</strong><span>reconstructed outcomes</span></div>'+
        '<div><small>Profit Factor (R)</small><strong>'+num(hist.profitFactorR,2)+'</strong><span>not forward proof</span></div>'+
      '</div><p class="v8Footnote">'+esc(hist.warning||"")+'</p>';
    }
  }

  function renderCalibration(cal){
    var el=$("sqCalibration");if(!el)return;
    if(!cal){el.innerHTML='<div class="notice info">Forward probability calibration unavailable.</div>';return}
    var p=finite(cal.calibratedProbability)?pct(100*cal.calibratedProbability,1):"UNPUBLISHED";
    var status=cal.status||"UNVERIFIED",klass=status==="CALIBRATED_FORWARD"?"good":status==="WEAK_FORWARD_CALIBRATION"?"warn":"info";
    var hold=cal.holdout||{},train=cal.train||{};
    var bins=(cal.reliabilityBins||[]).map(function(b){
      return '<div class="sqCalBin"><span>'+Math.round(100*b.low)+'–'+Math.round(100*b.high)+'%</span><b>'+pct(100*b.predicted,0)+'</b><strong>'+pct(100*b.actual,0)+'</strong><small>n='+b.count+'</small></div>';
    }).join("");
    el.innerHTML='<div class="sqCalHead '+klass+'"><div><small>FORWARD CALIBRATION</small><strong>'+esc(status)+'</strong><span>'+esc(cal.sampleCount??0)+' completed forward samples • '+esc(cal.selection||"")+'</span></div>'+
      '<div><small>CALIBRATED PROBABILITY</small><strong>'+p+'</strong><span>'+esc(cal.reason||"")+'</span></div></div>'+
      '<div class="sqRiskGrid">'+
        '<div><small>Train</small><strong>'+esc(train.count??"—")+'</strong><span>wins '+esc(train.wins??"—")+' • losses '+esc(train.losses??"—")+'</span></div>'+
        '<div><small>Holdout</small><strong>'+esc(hold.count??"—")+'</strong><span>Brier '+num(hold.brier,4)+' • skill '+(finite(hold.brierSkill)?pct(100*hold.brierSkill,1):"—")+'</span></div>'+
        '<div><small>Holdout ECE</small><strong>'+ (finite(hold.ece)?pct(100*hold.ece,1):"—") +'</strong><span>must be ≤18%</span></div>'+
        '<div><small>Provenance</small><strong>'+esc(cal.provenance||"—")+'</strong><span>historical simulation excluded</span></div>'+
      '</div>'+(bins?'<div class="sqCalBins"><div class="sqCalLegend"><span>Bin</span><b>Pred.</b><strong>Actual</strong><small>Count</small></div>'+bins+'</div>':"")+
      '<p class="v8Footnote">'+esc(cal.note||"")+'</p>';
  }

  function renderLearning(x){
    var el=$("sqLearning");if(!el)return;
    if(!x){el.innerHTML='<div class="notice info">Forward learning monitor unavailable.</div>';return}
    var stage=String(x.stage||"COLLECTING_FORWARD_DATA"),k=stage.indexOf("DRIFT")>=0?"bad":stage.indexOf("CALIBRATED")>=0?"good":"warn";
    var recent=finite(x.recentWindow?.winRate)?pct(100*x.recentWindow.winRate,1):"—";
    var prior=finite(x.priorWindow?.winRate)?pct(100*x.priorWindow.winRate,1):"—";
    var drift=finite(x.driftPctPoints)?((x.driftPctPoints>0?"+":"")+num(x.driftPctPoints,1)+" pp"):"—";
    el.innerHTML='<div class="sqLearningHead '+k+'"><div><small>FORWARD LEARNING STAGE</small><strong>'+esc(stage)+'</strong><span>'+esc(x.nextStep||"")+'</span></div>'+
      '<div><small>IMMUTABLE OUTCOMES</small><strong>'+esc(x.sampleCount??0)+' / '+esc(x.minCalibrationSample??50)+'</strong><span>'+esc(x.collectionProgressPct??0)+'% to minimum calibration sample</span></div></div>'+
      '<div class="sqLearningBar"><i style="width:'+Math.max(0,Math.min(100,Number(x.collectionProgressPct||0)))+'%"></i></div>'+
      '<div class="sqRiskGrid"><div><small>Recent WR</small><strong>'+recent+'</strong><span>last '+esc(x.recentWindow?.count??0)+' outcomes</span></div>'+
      '<div><small>Prior WR</small><strong>'+prior+'</strong><span>previous '+esc(x.priorWindow?.count??0)+' outcomes</span></div>'+
      '<div><small>Drift</small><strong class="'+(x.driftWarning?"r":"g")+'">'+drift+'</strong><span>'+ (x.driftWarning?"DRIFT WARNING":"within monitor tolerance") +'</span></div>'+
      '<div><small>Promotion</small><strong>'+(x.promotionEligible?"ELIGIBLE FOR REVIEW":"NOT ELIGIBLE")+'</strong><span>manual review only</span></div></div>'+
      '<p class="v8Footnote">'+esc(x.promotionPolicy||"")+'</p>';
  }

  function renderRisk(risk,mc){
    if($("sqRisk")){
      var suggested=finite(risk?.suggestedRiskPct)?pct(risk.suggestedRiskPct,3):"N/A";
      $("sqRisk").innerHTML='<div class="sqRiskGrid">'+
        '<div><small>Status</small><strong>'+esc(risk?.status||"—")+'</strong><span>'+esc(risk?.method||"")+'</span></div>'+
        '<div><small>Suggested risk</small><strong>'+suggested+'</strong><span>hard cap '+esc(risk?.hardRiskCapPct??"—")+'%</span></div>'+
        '<div><small>Full Kelly</small><strong>'+ (finite(risk?.fullKellyPct)?pct(risk.fullKellyPct,3):"N/A") +'</strong><span>not used directly</span></div>'+
        '<div><small>Fractional Kelly</small><strong>'+ (finite(risk?.fractionalKellyPct)?pct(risk.fractionalKellyPct,3):"N/A") +'</strong><span>fraction '+esc(risk?.kellyFraction??"—")+'</span></div>'+
      '</div><p class="v8Footnote">'+esc(risk?.warning||"")+'</p>';
    }
    if($("sqMonteCarlo")){
      if(!mc||mc.status==="INSUFFICIENT_SAMPLE"){
        $("sqMonteCarlo").innerHTML='<div class="notice info">Monte Carlo unavailable: '+esc(mc?.sampleCount??0)+' resolved R samples; minimum '+esc(mc?.minSample??20)+'.</div>';return;
      }
      $("sqMonteCarlo").innerHTML='<div class="sqMcHead"><b>'+esc(mc.paths)+' paths × '+esc(mc.trades)+' trades</b><span>Risk used '+pct(mc.riskPctUsed,3)+' • '+esc(mc.riskBasis)+'</span></div>'+
        '<div class="sqRiskGrid">'+
        '<div><small>P(DD ≥5%)</small><strong>'+pct(mc.probabilities?.dd5,2)+'</strong><span>bootstrap</span></div>'+
        '<div><small>P(DD ≥10%)</small><strong>'+pct(mc.probabilities?.dd10,2)+'</strong><span>bootstrap</span></div>'+
        '<div><small>P(DD ≥20%)</small><strong>'+pct(mc.probabilities?.dd20,2)+'</strong><span>bootstrap</span></div>'+
        '<div><small>P(5-loss streak)</small><strong>'+pct(mc.probabilities?.lossStreak5,2)+'</strong><span>within '+esc(mc.trades)+' trades</span></div>'+
        '<div><small>Median max DD</small><strong>'+pct(mc.maxDrawdownPct?.p50,2)+'</strong><span>P95 '+pct(mc.maxDrawdownPct?.p95,2)+'</span></div>'+
        '<div><small>Ending return</small><strong>'+num(mc.endingReturnPct?.median,2)+'%</strong><span>P05 '+num(mc.endingReturnPct?.p05,2)+'% • P95 '+num(mc.endingReturnPct?.p95,2)+'%</span></div>'+
        '</div><p class="v8Footnote">'+esc(mc.warning||"")+'</p>';
    }
  }

  function renderReasons(decision){
    var el=$("sqReasons");if(!el)return;
    var a=decision?.reasons||[];
    el.innerHTML=a.length?a.map(function(x){return '<div class="sqReason">'+esc(x)+'</div>'}).join(""):'<div class="sqReason good">No hard Phase-1 gate failure. Upcoming-news verification still blocks EXECUTION_READY.</div>';
  }

  function render(j){
    state.last=j;state.loadedKey=key();
    var d=j.decision||{},r=j.regime||{},h=j.dataHealth||{},a=j.analysis||{};
    $("sqDecision").textContent=d.decision||"WAIT";$("sqDecision").className=decisionCls(d.decision);
    $("sqSide").textContent=d.side||"WAIT";$("sqSide").className=Number(d.direction)>0?"g":Number(d.direction)<0?"r":"y";
    $("sqConfidence").textContent=pct(d.modelConfidence,0);
    $("sqProbability").textContent=d.calibratedProbability==null?"UNVERIFIED":pct(100*d.calibratedProbability,1);
    $("sqRegime").textContent=r.name||"UNKNOWN";$("sqRegimeConfidence").textContent="State confidence "+pct(r.confidence,0)+" • not win probability";
    $("sqDataHealth").textContent=(h.status||"UNKNOWN")+" "+(finite(h.score)?Math.round(h.score)+"/100":"");
    $("sqDataHealth").className=cls(h.status);
    $("sqMarketState").textContent=(a.marketState||"UNKNOWN")+" • "+(a.symbol||"");
    $("sqNotice").className="notice "+decisionCls(d.decision);
    $("sqNotice").textContent=d.summary+" "+d.executionBlock;
    $("sqUpdated").textContent=j.capturedAtUTC?"Updated "+new Date(j.capturedAtUTC).toLocaleString("en-MY",{timeZone:"Asia/Kuala_Lumpur"}):"—";
    renderSessionRadar(j.sessionLiquidity,a);renderMacroMap(j.macroMap);renderAlertPreview(j.alertPreview);renderTradePlan(j.tradePlan,a);renderAnalyst(j.analyst);renderFunnel(d);renderMtf(j.mtfMatrix);renderTechnical(j);renderMacro(j.macro);renderNewsRisk(j.newsRisk);renderRegime(r);renderEdge(j.directionalEdge,j.historicalEdge);renderCalibration(j.calibration);renderLearning(j.learning);renderRisk(j.risk,j.monteCarlo);renderReasons(d);
  }

  async function load(force){
    if(state.loading)return;
    var sym=window.selectedSymbol||"XAUUSD247",tf=window.selectedTF||"M5",ind=window.selectedIndicator||"105";
    if(!force&&state.last&&state.loadedKey===key())return render(state.last);
    state.loading=true;
    reset("Loading broker, regime, macro and decision-funnel evidence…");
    try{
      var url="/api/smart-quant?symbol="+encodeURIComponent(sym)+"&tf="+encodeURIComponent(tf)+"&indicator="+encodeURIComponent(ind)+(force?"&t="+Date.now():"");
      var r=await fetch(url,{cache:"no-store"}),j=await r.json();
      if(!r.ok||!j.ok||!j.ready)throw Error(j.error||("HTTP "+r.status));
      render(j);
    }catch(e){
      reset();
      $("sqNotice").className="notice bad";$("sqNotice").textContent="Smart Quant unavailable: "+e.message;
    }finally{state.loading=false}
  }

  var tab=document.querySelector('.tab[data-page="smartQuantPage"]');
  if(tab)tab.addEventListener("click",function(){setTimeout(function(){load(false)},30)});
  if($("sqRefresh"))$("sqRefresh").onclick=function(){load(true)};
  ["symbolSelect","tfSelect","indicatorSelect"].forEach(function(id){
    $(id)?.addEventListener("change",function(){state.loadedKey="";if(active())setTimeout(function(){load(true)},60)});
  });
  setInterval(function(){if(active()&&!document.hidden)load(true)},60000);
  window.GoldFlowSmartQuant={refresh:function(){return load(true)},getState:function(){return state.last}};
})();
