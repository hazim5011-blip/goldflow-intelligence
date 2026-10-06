"use strict";
// Additive V8.1.1 study controller. No legacy indicator output is overwritten.
(function(){
 const $=id=>document.getElementById(id);
 const isGF=()=>/^gf-(ai|news|study)$/.test(window.selectedIndicator||$("indicatorSelect")?.value||"");
 const mode=()=>({ "gf-ai":"ai","gf-news":"news","gf-study":"study"})[window.selectedIndicator||$("indicatorSelect")?.value]||"study";
 const safe=v=>v===undefined||v===null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:/^(BTC|ETH|XAU|GOLD)/i.test(state.last?.symbol||"")?2:5});
 const state={busy:false,last:null,seq:0,context:null};
 const ACTIVE_PREFIX="gf_active_study_v1:";
 function activeContext(d){
  const symbol=String(d?.symbol||window.selectedSymbol||$("symbolSelect")?.value||"");
  const tf=String(d?.tf||window.selectedTF||$("tfSelect")?.value||"M15");
  return {symbol,tf,key:ACTIVE_PREFIX+symbol+"|"+tf};
 }
 function readActive(d){try{const c=activeContext(d),x=JSON.parse(localStorage.getItem(c.key)||"null");return x&&x.symbol===c.symbol&&x.tf===c.tf?x:null}catch(e){return null}}
 function saveActive(a){if(!a)return;try{localStorage.setItem(ACTIVE_PREFIX+a.symbol+"|"+a.tf,JSON.stringify(a))}catch(e){}}
 function removeActive(d){try{localStorage.removeItem(activeContext(d).key)}catch(e){}}
 function activeText(v){return v==null?"—":safe(v)}
 function renderActiveLifecycle(d){
  const card=$("gfActiveSetupCard"),life=window.GFStudyLifecycle;
  if(!card||!life)return null;
  const technical=(d?.mode||mode())==="study";card.hidden=!technical;if(!technical)return null;
  let active=readActive(d),assessment=life.evaluate(active,d),candidate=life.candidate(d);
  if(candidate&&(!active||(life.isTerminal(assessment.state)&&candidate.id!==active.id))){
   active=candidate;saveActive(active);assessment=life.evaluate(active,d);
  }
  if(active&&assessment.terminal&&!active.terminalState){
   active={...active,terminalState:assessment.state,terminalReason:assessment.reason,terminalAtUTC:d?.updatedAtUTC||new Date().toISOString()};
   saveActive(active);assessment=life.evaluate(active,d);
  }
  state.active=active;
  const badge=$("gfActiveSetupBadge");
  if(!active){
   put("gfActiveSetupBadge","NONE");if(badge)badge.className="tag";
   put("gfActiveSide","—");put("gfActiveEntry","—");put("gfActiveSL","—");put("gfActiveTP1","—");
   put("gfActiveSetupNote","No Market Study setup has been observed inside its verified entry zone in this browser.");
   return assessment;
  }
  const label=assessment.state==="ACTIVE_VALID"?active.side+" ACTIVE • VALID":
   assessment.state==="ACTIVE_QUOTE_OFFLINE"?active.side+" ACTIVE • QUOTE OFFLINE":
   assessment.state==="COMPLETED_TP1"?active.side+" COMPLETED • TP1":
   assessment.state==="INVALIDATED"?active.side+" INVALIDATED":
   assessment.state==="AMBIGUOUS_PATH"?"AMBIGUOUS PATH":assessment.state.replaceAll("_"," ");
  put("gfActiveSetupBadge",label);
  if(badge)badge.className="tag "+(assessment.terminal?"terminal":active.direction>0?"active-buy":"active-sell");
  put("gfActiveSide",active.side);put("gfActiveEntry",activeText(active.observedEntryPrice));
  put("gfActiveSL",activeText(active.invalidation));put("gfActiveTP1",activeText(active.tp1));
  const extras="TP2 "+activeText(active.tp2)+" • TP3 "+activeText(active.tp3)+" • observed "+(active.observedAtUTC||"N/A");
  put("gfActiveSetupNote",assessment.reason+" "+extras+" Browser lifecycle only; NOT proof that an MT5/broker position was opened.");
  return {...assessment,setup:active};
 }
 function put(id,value){if($(id))$(id).textContent=String(value??"—")}
 let studyChart=null;
 // Never retain a previous mode's BUY/SELL marker or entry plan while selecting
 // a different mode/symbol/TF. No cached UI result can act as LIVE evidence.
 function invalidate(){
  state.last=null;state.context=null;state.seq++;
  const m=mode();
  put("gfStudyModeTitle",m==="ai"?"GF-AI Live Analyst • Strict MTF Confluence":m==="study"?"GF-Market Study Pro • Technical Entry Lifecycle":"GF-News Impact Pro • Gold Context Study");
  put("gfStudyModePurpose","Loading the NEW mode. Previous signal/entry plan deliberately cleared; NO ENTRY until verified.");
  put("gfStudyState","REFRESHING");if($("gfStudyState"))$("gfStudyState").className="y";
  put("gfStudyReason","Waiting for a new verified response for this symbol / timeframe / study mode.");
  put("gfEntryDecision","NO ENTRY • REFRESHING");
  put("gfScenarioTitle","Live Research / Scenario");put("gfScenarioBadge","WAIT NEW VERIFIED RESULT");put("gfScenarioNarrative","Previous mode result removed. Waiting for a fresh analysis.");
  put("gfEntryHint","Old mode's confirmation is cleared. Never act on a previous selection.");
  put("gfOppositeDirection","NO CURRENT VERIFIED DIRECTION");
  put("gfConfirmTime","—");put("gfStudyFresh","—");
  for(const id of ["gfEntryRange","gfInvalidate","gfTP1","gfTP2","gfTP3","gfStudyTechnical","gfStudyMacro"])put(id,"—");
  if(studyChart){studyChart.remove();studyChart=null}
  if($("gfStudyChart"))$("gfStudyChart").textContent="Waiting for broker data for the newly selected study.";
 }

 function drawStudyChart(d){
  const node=$("gfStudyChart"),LW=window.LightweightCharts;
  if(!node||!$("gfStudyPage")?.classList.contains("on"))return;
  if(studyChart){studyChart.remove();studyChart=null}node.textContent="";
  if(!LW||!Array.isArray(d?.chartBars)||d.chartBars.length<25){
    node.textContent="Broker chart unavailable; never substitute synthetic candles.";
    put("gfStudyChartNote","Chart not ready or broker data unavailable. No inferred price line.");
    return;
  }
  try{
   const rows=d.chartBars.filter(b=>Number.isFinite(Number(b.t))&&[b.o,b.h,b.l,b.c].every(x=>Number.isFinite(Number(x))))
    .map(b=>({time:Number(b.t),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c)})).sort((a,b)=>a.time-b.time);
   if(rows.length<25)throw Error("Insufficient valid broker chart bars");
   studyChart=LW.createChart(node,{width:Math.max(300,node.clientWidth),height:360,
    layout:{background:{color:"#07131c"},textColor:"#aab9c3"},grid:{vertLines:{color:"#10222e"},horzLines:{color:"#10222e"}},
    rightPriceScale:{borderColor:"#24404e"},timeScale:{borderColor:"#24404e",timeVisible:true,secondsVisible:false}});
   const candle=studyChart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",borderVisible:false,wickUpColor:"#31d6a4",wickDownColor:"#ff6079"});
   candle.setData(rows);
   const p=d.confirmation;if(p){
    const green=p.direction>0,col=green?"#31d6a4":"#ff6079";
    const markerTime=Number(p.signalCandleTime)-Number(d.brokerUtcOffsetSeconds);
    if(rows.some(b=>b.time===markerTime)&&candle.setMarkers)candle.setMarkers([{time:markerTime,
      position:green?"belowBar":"aboveBar",color:col,shape:green?"arrowUp":"arrowDown",text:(green?"BUY":"SELL")+" CLOSED CONFIRMED"}]);
    const prefix=d.mode==="ai"?"AI FIB":"PIVOT RETEST";
    for(const [price,name,color,lineStyle] of [[p.entryLow,prefix+" LOW",col,2],[p.entryHigh,prefix+" HIGH",col,2],
     [p.invalidation,"STRUCTURE INVALID","#f2c75b",0],[p.tp1,"TP1","#71c3fa",2],[p.tp2,"TP2","#71c3fa",2],[p.tp3,"TP3","#71c3fa",2]]){
      if(price!==null&&price!==undefined&&Number.isFinite(Number(price)))candle.createPriceLine({price:Number(price),color,lineWidth:1,lineStyle,axisLabelVisible:true,title:name});
    }
   }else if(d.mode==="study"&&d.structureLevels){
    // Market Study must display its proposed levels WHILE WAITING, explicitly
    // labelled as RESEARCH and never represented as an executed position.
    const s=d.structureLevels;
    for(const [price,name,color] of [[s.support,"SUPPORT","#31d6a4"],[s.resistance,"RESISTANCE","#ff6079"],
     [s.reactionZoneLow,"REACTION ZONE LOW","#e2c165"],[s.reactionZoneHigh,"REACTION ZONE HIGH","#e2c165"],
     [s.breakoutLevel,"BREAK/RETEST TRIGGER","#71c3fa"],[s.invalidationLevel,"CLOSE INVALIDATES","#f2c75b"],
     ...(d.projectedTargets||[]).map((x,i)=>[x,"PROVISIONAL TARGET "+(i+1),"#71c3fa"])]){
     if(price!==null&&price!==undefined&&Number.isFinite(Number(price)))
      candle.createPriceLine({price:Number(price),color,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:name});
    }
   }
   studyChart.timeScale().fitContent();
   put("gfStudyChartNote",d.mode==="study"?
    "GF-MARKET STUDY • independently derived support/resistance, dynamic pivot/retest reaction zone, breakout trigger, invalidation and provisional liquidity targets. PENDING lines are NOT entry-ready. Closed-candle confirmation only.":
    d.mode==="ai"?"GF-AI • independent 38.2%-61.8% impulse retracement, structural invalidation and scenario targets; Macro Regime is historical observation context, not guaranteed direction.":
    "Vantage MT5 • broker clock normalized to UTC. Confirmation uses CLOSED candles only. Never an executed trade.");
  }catch(e){if(studyChart){studyChart.remove();studyChart=null}node.textContent="Broker chart rendering unavailable.";put("gfStudyChartNote","Data visualization unavailable; trade-ready status does not depend on chart rendering.")}
 }
 window.addEventListener("resize",function(){if(studyChart&&$("gfStudyChart"))studyChart.applyOptions({width:Math.max(300,$("gfStudyChart").clientWidth)})});
 const colors={BUY_ENTRY_READY:"g",SELL_ENTRY_READY:"r",BUY_CONFIRMED:"g",SELL_CONFIRMED:"r",BUY_INVALID:"r",SELL_INVALID:"r",WAIT_CONFIRMATION:"y",WAIT_CONFLICT:"y",MISSED_ENTRY:"y",COMPLETED_STUDY:"g",AMBIGUOUS_PATH:"y",EXPIRED:"y",DATA_UNVERIFIED:"y",MARKET_OFFLINE:"y"};
 function render(d){
  state.last=d;
  const st=String(d?.status||"DATA_UNVERIFIED"),p=d?.confirmation||null;
  const m=d?.mode||mode();
  const technicalMode=m==="study",gold=/^(XAU|GOLD)/i.test(String(d?.symbol||""));
  const activeLifecycle=technicalMode?renderActiveLifecycle(d):null;
  put("gfStudyModeTitle",technicalMode?"GF-Market Study Pro • Technical Entry Lifecycle":
      m==="ai"?"GF-AI Live Analyst • Strict MTF Confluence":"GF-News Impact Pro • Gold Context Study");
  put("gfStudyModePurpose",technicalMode?
    "STRUCTURE-DRIVEN: closed-candle rejection/break-retest; H1/H4 may be neutral but cannot oppose. Entry comes from dynamic pivots, targets from liquidity levels; Gold macro/yields are commentary ONLY, never entry gate.":
    m==="ai"?(gold?"AI RESEARCH: both H1 and H4 plus closed pattern. Use verified Macro Regime when available; if missing, downgrade transparently to TECHNICAL ONLY. Verified contradictory Gold macro blocks the setup. No ML-trained win probability.":
    "STRICT AI RULES: BOTH H1 and H4 must align. No verified asset-specific fundamental feed for this symbol; TECHNICAL-ONLY confluence, not Gold macro or trained ML."):
    "GOLD NEWS CONTEXT: official macro context and closed-candle confirmation; no verified event-release timestamp or consensus surprise is asserted.");

  const aiMode=m==="ai",research=d?.macroEvidence,structure=d?.structureLevels,scenario=d?.explanation;
  put("gfScenarioTitle",aiMode?"GF-AI • Evidence & Macro/Pattern Decision":
    technicalMode?"Market Structure Study • Continuation / Reclaim / Reaction":"GF-News Study");
  put("gfScenarioBadge",d?.canEnter?"ENTRY CONDITIONS MET":"RESEARCH ONLY • NO EXECUTION");
  put("gfScenarioNarrative",aiMode?[
    scenario?.headline||"AI scenario pending verified confluence.",
    ...(scenario?.drivers||[]),
    "AI methodology: "+(p?.entryMethod||"Await macro + H1/H4 + newly closed chart pattern"),
    "Verified observations: "+(research?.observations||[]).filter(x=>x.display&&x.status!=="UNAVAILABLE")
      .slice(0,10).map(x=>x.id+" "+x.display+" (period "+x.period+", "+x.impactCategory+" category)").join("; "),
    research?.explanation||"",
    d?.reason||""
   ].filter(Boolean).join("\n"):
   technicalMode?[
    "SCENARIO: "+(d?.scenario||"WAIT STRUCTURE"),
    d?.scenarioNarrative||"Wait for verified structural levels.",
    "SUPPORT: "+safe(structure?.support)+"  |  RESISTANCE: "+safe(structure?.resistance),
    "REACTION ZONE: "+safe(structure?.reactionZoneLow)+" — "+safe(structure?.reactionZoneHigh),
    "BREAK/RETEST TRIGGER: "+safe(structure?.breakoutLevel)+" on CLOSED "+(d?.tf||"selected")+" candle.",
    "CONDITION A: "+(d?.confirmationRules?.reaction||""),
    "CONDITION B: "+(d?.confirmationRules?.breakdown||""),
    "INVALIDATION: "+(d?.confirmationRules?.invalidation||""),
    "PROVISIONAL TARGETS (NOT ENTRY): "+(d?.projectedTargets||[]).map(safe).join(" → "),
    "FUNDAMENTAL: "+(d?.macroContext?.explanation||"Not applied as entry gate."),
    d?.reason||""
   ].filter(Boolean).join("\n"):
   d?.reason||"No release-time claim without a verified official calendar.");
  put("gfStudyState",st.replaceAll("_"," "));
  $("gfStudyState").className=colors[st]||(st.endsWith("READY")?"g":st.endsWith("INVALID")||st==="AI_INVALIDATED"?"r":"y");
  put("gfStudyReason",d?.reason||"No verified study state.");
  put("gfStudyFresh",[d?.symbol||"",d?.tf||"",d?.closedAtUTC||"N/A",d?.quoteAgeSeconds==null?"Tick N/A":"Tick "+d.quoteAgeSeconds+" s"].filter(Boolean).join(" • "));
  put("gfConfirmTime",p?"Confirmed candle closed at "+p.confirmationCloseUTC+" • expires after "+(p.expiresAfterClosedBars||3)+" closed bars":"No confirmed closed trigger candle");
  let decision="NO ENTRY",hint="WAIT for a fresh confirmed candle. No broker order is sent.";
  if(d?.canEnter && ["AI_BUY_READY","AI_SELL_READY","BUY_ENTRY_READY","SELL_ENTRY_READY"].includes(st)){
    decision=p?.side+" • ENTRY READY"+(aiMode&&d.researchScope==="TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE"?" • TECHNICAL ONLY":"");hint="Verified CLOSED candle + FRESH "+d.entryQuoteSide+" inside mode-specific entry area. "+(aiMode&&d.researchScope==="TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE"?"Fundamental for this pair unavailable; decision is based ONLY on valid broker technical evidence. ":"")+"Study ONLY; confirm your own trade.";
  }else if(["AI_BUY_CONFIRMED","AI_SELL_CONFIRMED","BUY_CONFIRMED","SELL_CONFIRMED"].includes(st)){
    decision=p?.side+" CONFIRMED • WAIT RETEST";hint="The direction has confirmed but the quote is OUTSIDE the entry range. Do not chase.";
  }else if(["AI_INVALIDATED","BUY_INVALID","SELL_INVALID"].includes(st)){
    decision=p?.side+" INVALID • NO ENTRY";hint=d?.invalidationBasis==="INTRABAR_QUOTE"?"Live price crossed study invalidation; close validation is pending but entry blocked.":"The original study invalidation was breached by broker candles. Previous setup is cancelled.";
  }else if(st==="MISSED_ENTRY"){decision="MISSED ENTRY • NO CHASE";hint="Price already moved beyond the safe retest band. Wait for a NEW closed-candle setup."}
  else if(st==="COMPLETED_STUDY"){decision="TARGET ALREADY TOUCHED • NO ENTRY";hint="TP1 was touched after confirmation. Never reactivate a completed old setup."}
  else if(st==="AMBIGUOUS_PATH"){decision="AMBIGUOUS HISTORY • NO ENTRY";hint="TP and SL touched within the same OHLC candle; the order is unknown."}
  else if(st==="EXPIRED"){decision="EXPIRED • NO ENTRY";hint="Three closed trigger candles passed; a new setup must be confirmed."}
  else if(st==="MARKET_OFFLINE"){decision="OFFLINE • NO ENTRY";hint="No verified fresh broker quote or closed-candle feed."}
  else if(st==="WAIT_CONFLICT"){decision="CONFLICT • WAIT";hint="Pattern disagrees with higher timeframe/fundamental context."}
  else if(["STUDY_WAIT_BUY_CONFIRMATION","STUDY_WAIT_SELL_CONFIRMATION","STUDY_WAIT_STRUCTURE"].includes(st)){
   if(activeLifecycle?.state==="ACTIVE_VALID"){
    decision="NEW SIGNAL WAIT • "+activeLifecycle.setup.side+" ACTIVE";
    hint="WAIT applies to a NEW confirmation only. The earlier observed "+activeLifecycle.setup.side+" setup remains ACTIVE until its stored SL/invalidation or TP1 is reached.";
   }else if(activeLifecycle?.state==="ACTIVE_QUOTE_OFFLINE"){
    decision="NEW SIGNAL WAIT • ACTIVE SETUP QUOTE OFFLINE";
    hint="The earlier observed setup is retained, but a fresh broker exit-side quote is unavailable. Do not assume TP, SL or cancellation.";
   }else{
    decision="STRUCTURE SCENARIO • WAIT CLOSED CANDLE";hint="Reaction zone and provisional targets are research only. WAIT for a new verified close and retest.";
   }
  }else if(["AI_WAIT_VERIFIED_MACRO","AI_ASSET_FUNDAMENTAL_UNAVAILABLE","AI_WAIT_MACRO_CONFLUENCE","AI_WAIT_MTF_ALIGNMENT","AI_WAIT_PATTERN"].includes(st)){
   decision="AI CONFLUENCE INCOMPLETE • NO ENTRY";hint="One or more independent AI evidence gates are not verified; never reuse a previous mode's signal.";
  }else if(["AI_MISSED_ENTRY","STUDY_MISSED_ENTRY"].includes(st)){
   decision="MISSED ENTRY • DO NOT CHASE";hint="Current quote moved beyond the original independently calculated zone.";
  }else if(["AI_COMPLETED_STUDY","STUDY_TARGET_TOUCHED"].includes(st)){
   decision="TARGET ALREADY TOUCHED • NO ENTRY";hint="Earlier study has retired after reaching the first objective.";
  }else if(["AI_EXPIRED","STUDY_EXPIRED"].includes(st)){
   decision="EXPIRED • NO ENTRY";hint="Entry confirmation window elapsed.";
  }else if(st==="STUDY_AMBIGUOUS_PATH"){
   decision="AMBIGUOUS OHLC PATH • NO ENTRY";hint="Cannot prove whether TP or SL touched first.";
  }
  else if(st==="DATA_UNVERIFIED"){decision="DATA UNVERIFIED";hint="Source quality is insufficient; cannot issue a new trade-ready indication."}
  put("gfEntryDecision",decision);$("gfEntryDecision").className=d?.canEnter?(p?.direction>0?"g":"r"):"y";
  put("gfEntryHint",hint);
  put("gfOppositeDirection",p&&["AI_BUY_READY","AI_SELL_READY","AI_BUY_CONFIRMED","AI_SELL_CONFIRMED","BUY_ENTRY_READY","SELL_ENTRY_READY","BUY_CONFIRMED","SELL_CONFIRMED"].includes(st)?
   (p.direction>0?"SELL INVALID for this BUY study":"BUY INVALID for this SELL study"):
   "Opposite-direction status is not an independent confirmed trade.");
  put("gfEntryRange",p?safe(p.entryLow)+" — "+safe(p.entryHigh):structure&&technicalMode?"REACTION (WAIT): "+safe(structure.reactionZoneLow)+" — "+safe(structure.reactionZoneHigh):"—");
  put("gfInvalidate",p?safe(p.invalidation):technicalMode?safe(structure?.invalidationLevel)+" (WAIT)":"—");
  put("gfTP1",p?safe(p.tp1):technicalMode&&d.projectedTargets?.length?safe(d.projectedTargets[0])+" (PROJECTION)":"—");
  put("gfTP2",p?safe(p.tp2):technicalMode&&d.projectedTargets?.length>1?safe(d.projectedTargets[1])+" (PROJECTION)":"—");
  put("gfTP3",p?safe(p.tp3):technicalMode&&d.projectedTargets?.length>2?safe(d.projectedTargets[2])+" (PROJECTION)":"—");
  const h1=v=>v===1?"BULLISH":v===-1?"BEARISH":"NEUTRAL / N/A";
  put("gfStudyTechnical",[
    "Independent engine: "+(d?.engine||"UNVERIFIED")+" • Broker: "+(d?.source||d?.technicalSource||"VANTAGE MT5"),
    "H1: "+h1(d?.h1Trend)+"; H4: "+h1(d?.h4Trend),
    p?"Closed candle: "+p.confirmationType+(p.score!==null&&p.score!==undefined&&Number.isFinite(Number(p.score))?" • Auditable AI alignment score "+p.score+"/100 (NOT win probability)":" • Pivot-based structure, no pseudo-probability"):"No validated signal candle",
    p?"Entry quote "+(d?.entryQuoteSide||"—")+": "+safe(d?.entryQuote):"",
    p?"Entry model: "+String(p.entryMethod||"LEGACY")+"; targets: "+String(p.targetMethod||"derived study")+"; structural stop "+safe(p.invalidation)+".":""
  ].filter(Boolean).join("\n"));
  const macro=d?.news,events=macro?.cards||[],find=id=>events.find(x=>x.id===id);
  const ids=["CPI","FEDUPPER","USDBROAD","US2Y","US10Y","REAL10Y","NETLIQ"];
  put("gfStudyMacro",technicalMode?[
    "GF-MARKET STUDY: NEWS/YIELDS ARE CONTEXT ONLY, never an entry gate or level formula.",
    d?.macroContext?.explanation||"Macro context unavailable.",
    ...(d?.macroContext?.observations||[]).map(x=>x.id+": "+(x.display||"N/A")+" • Period "+(x.date||"N/A")+" • "+x.status)
   ].join("\n"):
    aiMode?[
     "GF-AI: "+(d.researchScope||"EVIDENCE REVIEW")+" • "+(research?.scope||"MACRO_UNAVAILABLE")+" • "+(research?.bias||"UNVERIFIED")+" • Macro score "+safe(research?.score)+(research?.score==null?" (unavailable)":" /100 (not a price guarantee)."),
     research?.explanation||"",
     ...(research?.observations||[]).map(x=>x.id+": "+(x.display||"N/A")+" • "+x.impactCategory+" potential • Period "+(x.period||"N/A")+" • "+x.status),
     "NO verified news release timestamp, market consensus or surprise. Conditions remain dependent on broker price."
    ].filter(Boolean).join("\n"):
    macro?[
    "Derived gold macro context: "+(macro.gold?.bias||"N/A")+" • Score "+safe(macro.gold?.score)+"/100 (NOT a directional guarantee)",
    "Official/derived coverage: "+safe(macro.quality?.available)+"/"+safe(macro.quality?.total)+"; source errors "+(macro.quality?.errors?.length||0),
    ...ids.map(id=>{const x=find(id);return x?id+": "+(x.display||"N/A")+" • Period "+(x.date||"N/A")+" • "+(x.status||""):""}),
    "Important: no verified release timestamp or consensus forecast is claimed here. Market price confirmation is required."
  ].filter(Boolean).join("\n"):"Macro context not verified / unavailable. AI & News modes must fail closed when required source data is incomplete.");
  $("gfStudyNote").textContent=d?.limitation||"CLOSED-CANDLE RESEARCH • A BUY/SELL CONFIRMED label does NOT mean an executed position.";
  $("gfStudyNote").className="notice "+(d?.ok?"info":"bad");
  drawStudyChart(d);
 }
 async function load(){
  if(!isGF())return;
  const symbol=window.selectedSymbol||$("symbolSelect")?.value,tf=window.selectedTF||$("tfSelect")?.value||"M15",m=mode();
  const context=[symbol||"",tf,m].join("|");
  if(state.context!==context){invalidate();state.context=context}
  if(state.busy){state.seq++;return}
  const seq=++state.seq;
  if(!symbol){invalidate();put("gfStudyReason","Select a verified Vantage symbol first.");return}
  state.busy=true;put("gfStudyFresh","Refreshing fresh Vantage broker observations...");
  try{
   const r=await fetch("/api/study?symbol="+encodeURIComponent(symbol)+"&tf="+encodeURIComponent(tf)+"&mode="+m,{cache:"no-store"});
   const d=await r.json();if(!r.ok)throw Error(d?.error||"HTTP "+r.status);
   if(seq===state.seq&&symbol===(window.selectedSymbol||$("symbolSelect")?.value)&&tf===(window.selectedTF||$("tfSelect")?.value)&&m===mode())render(d);
  }catch(e){if(seq===state.seq)render({ok:false,status:"DATA_UNVERIFIED",mode:m,reason:"Study API unavailable. Entry blocked.",limitation:String(e.message||e)})}
  finally{state.busy=false;if(state.seq!==seq&&isGF())setTimeout(load,0)}
 }

 // A previously displayed READY state is never left stale while the price moves.
 // Fast tick polling may only DEMOTE a server-confirmed signal. It never upgrades
 // WAIT/CONFIRMED to READY without another full closed-candle server evaluation.
 let rapidCheckBusy=false;
 async function verifyDisplayedReady(){
  if(rapidCheckBusy||document.hidden||!isGF()||!$("gfStudyPage")?.classList.contains("on"))return;
  const old=state.last;
  if(!old?.canEnter||!old?.confirmation)return;
  rapidCheckBusy=true;
  try{
   const name=old.symbol,p=old.confirmation,d=p.direction;
   const r=await fetch("/api/status?lite=1&pair="+encodeURIComponent(name),{cache:"no-store"});
   const j=await r.json();
   if(state.last!==old)return;
   const stamp=Date.parse(old.updatedAtUTC||"");
   const fresh=Number.isFinite(stamp)&&Date.now()-stamp<=22000;
   const quoteOk=r.ok&&j.ok&&j.bridgeOnline&&j.symbol===name&&
    Number.isFinite(Number(j.ageSeconds))&&Number(j.ageSeconds)>=-20&&Number(j.ageSeconds)<=30&&
    Number.isFinite(Number(j.sampleAgeSeconds))&&Number(j.sampleAgeSeconds)>=-25&&Number(j.sampleAgeSeconds)<=35&&
    Number.isFinite(Number(j.bid))&&Number.isFinite(Number(j.ask))&&Number(j.bid)>0&&Number(j.ask)>=Number(j.bid);
   if(!fresh||!quoteOk){
    render({...old,status:"MARKET_OFFLINE",canEnter:false,reason:"READY status suppressed: full analysis or broker tick is no longer fresh."});
    return;
   }
   const px=d===1?Number(j.ask):Number(j.bid);
   if(d*(px-Number(p.invalidation))<=0){
    render({...old,status:old.mode==="ai"?"AI_INVALIDATED":(d===1?"BUY_INVALID":"SELL_INVALID"),canEnter:false,
     invalidationBasis:"INTRABAR_QUOTE",reason:"Fresh broker tick has breached original mode-specific invalidation."});
   }else if(px<Number(p.entryLow)||px>Number(p.entryHigh)){
    render({...old,status:old.mode==="ai"?(d===1?"AI_BUY_CONFIRMED":"AI_SELL_CONFIRMED"):(d===1?"BUY_CONFIRMED":"SELL_CONFIRMED"),canEnter:false,
     entryState:"WAIT_RETEST",reason:"Previously READY, but fresh broker quote has left the original mode-specific entry band. Wait for full revalidation."});
   }
  }catch(e){
   if(state.last===old)render({...old,status:"MARKET_OFFLINE",canEnter:false,reason:"Live tick check unavailable; previous ENTRY READY revoked."});
  }finally{rapidCheckBusy=false}
 }
 setInterval(function(){
  if(!document.hidden&&isGF()&&$("gfStudyPage")?.classList.contains("on"))load();
 },15000);
 setInterval(verifyDisplayedReady,5000);
 document.addEventListener("visibilitychange",function(){
  if(!document.hidden&&isGF()&&$("gfStudyPage")?.classList.contains("on"))load();
 });

 window.GFStudy={load,invalidate,getLast:()=>state.last,getActive:()=>state.active};
 if($("gfStudyRefresh"))$("gfStudyRefresh").onclick=load;
 if($("gfActiveSetupClear"))$("gfActiveSetupClear").onclick=function(){removeActive(state.last||{});state.active=null;if(state.last)renderActiveLifecycle(state.last)};
 // API returns only positive exact-symbol fresh ticks. Unsampled symbols never count as ONLINE.
 const market={last:null,at:0,attempt:0,promise:null};
 function needsUpdate(){return !market.promise&&Date.now()-market.at>25000&&Date.now()-market.attempt>20000}
 async function ensure(){
  if(market.promise)return market.promise;
  if(!needsUpdate())return market.last;
  market.attempt=Date.now();
  market.promise=(async()=>{
   try{const r=await fetch("/api/market-online",{cache:"no-store"}),d=await r.json();market.last=r.ok&&d.ok?d:null;market.at=Date.now();return market.last}
   catch(e){market.last=null;market.at=Date.now();return null}
   finally{market.promise=null}
  })();
  return market.promise;
 }
 function has(symbol,cat){
  if(!market.last||market.last.ok!==true)return false;
  return cat==="MARKET_24H"?market.last.market24hWeekendVerified?.includes(symbol):market.last.verified?.includes(symbol);
 }
 function note(cat){
  if(!market.last)return "Checking Vantage MT5 tradeMode and fresh broker ticks… No unverified symbol is labelled ONLINE.";
  let s=market.last;
  const synth=s.byCategory?.SYNTHETIC,listed=s.syntheticSamples||[],missing=s.examplesNotListed||[];
  return (cat==="MARKET_24H"?"Weekend LIVE verified currently: "+s.market24hWeekendVerified.length:
          "MARKET ONLINE verified: "+s.verified.length)+
    " • verified-scan "+s.sampled+"/"+(s.tradableCatalogCount??s.catalogCount)+" tradable broker symbols • "+
    (s.partialCoverage?"PARTIAL / UNKNOWN batches":"ALL TRADABLE CATALOG SCANNED")+
    " • SYNTHETIC "+(synth?.verifiedOnline??0)+"/"+(synth?.catalogTradable??0)+" ONLINE"+
    (missing.length?" • Not listed in this Vantage account: "+missing.join(", "):"")+
    " • "+s.asOfUTC+". ONLINE is verified NOW, not guaranteed permanent 24/7 opening.";
 }
 window.GFMarket={ensure,has,note,needsUpdate};
 setInterval(function(){
  if(["MARKET_ONLINE","MARKET_24H"].includes($("category")?.value)){
    market.at=0;ensure().then(function(){if(window.applySymbolFilter)window.applySymbolFilter()});
  }
 },30000);
})();
