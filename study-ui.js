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
 const AI_ACTIVE_PREFIX="gf_ai_active_v150:",AI_LOSS_PREFIX="gf_ai_loss_v150:";
 function aiLifeKey(d,prefix){const symbol=String(d?.symbol||window.selectedSymbol||$("symbolSelect")?.value||"");return prefix+symbol}
 function readAI(d,prefix){try{return JSON.parse(localStorage.getItem(aiLifeKey(d,prefix))||"null")}catch(e){return null}}
 function saveAI(d,prefix,x){try{x?localStorage.setItem(aiLifeKey(d,prefix),JSON.stringify(x)):localStorage.removeItem(aiLifeKey(d,prefix))}catch(e){}}
 function renderAILifecycle(d){
  const card=$("gfAIManageCard"),life=window.GFAILifecycle,ai=(d?.mode||mode())==="ai";
  if(!card)return null;card.hidden=!ai;if(!ai||!life)return null;
  let active=readAI(d,AI_ACTIVE_PREFIX),loss=readAI(d,AI_LOSS_PREFIX),assessment=life.evaluate(active,d);
  if(active&&assessment?.updates&&Object.keys(assessment.updates).length){
   active={...active,...assessment.updates};saveAI(d,AI_ACTIVE_PREFIX,active);assessment=life.evaluate(active,d);
  }
  if(active&&assessment.terminal&&!active.terminalState){
   active={...active,...(assessment.updates||{}),terminalState:assessment.state,terminalAction:assessment.action,terminalReason:assessment.reason,terminalAtUTC:d?.updatedAtUTC||new Date().toISOString()};
   saveAI(d,AI_ACTIVE_PREFIX,active);
   if(assessment.state==="CUT_LOSS"){loss=active;saveAI(d,AI_LOSS_PREFIX,loss)}
   assessment=life.evaluate(active,d);
  }
  const recovery=life.recovery(loss,d),candidate=life.candidate(d,loss);
  if(candidate&&(!active||(assessment.terminal&&candidate.id!==active.id))){
   active=candidate;saveAI(d,AI_ACTIVE_PREFIX,active);assessment=life.evaluate(active,d);
  }
  state.aiActive=active;state.aiLoss=loss;
  const badge=$("gfAIManageBadge");
  const label=!active?"NONE":candidate?.recoveryFrom&&recovery.ready?"RECOVERY READY • "+active.grade:
   assessment.state==="CUT_LOSS"?"CUT LOSS":
   assessment.state==="TP3_COMPLETE"?"TP3 COMPLETE":
   assessment.state.replaceAll("_"," ");
  put("gfAIManageBadge",label);
  if(badge)badge.className="tag "+(assessment.terminal?"terminal":active?.direction>0?"active-buy":active?.direction<0?"active-sell":"");
  if(!active){
   put("gfAIManageIdea","—");put("gfAIManageEntry","No AI ENTRY READY has been observed in this browser.");
   put("gfAIManageAction","WAIT");put("gfAIManageRisk","No active research position lifecycle.");
  }else{
   put("gfAIManageIdea",active.id+" • "+active.side+" • "+active.grade);
   put("gfAIManageEntry","Entry observed "+activeText(active.entryPrice)+" • SL "+activeText(active.invalidation)+" • TP1 "+activeText(active.tp1)+" • TP2 "+activeText(active.tp2)+" • TP3 "+activeText(active.tp3));
   put("gfAIManageAction",assessment.action||assessment.state);
   put("gfAIManageRisk",(assessment.rNow===null||assessment.rNow===undefined?"R N/A":"Live R "+Number(assessment.rNow).toFixed(2))+"\n"+assessment.reason+"\nBest favorable "+activeText(active.bestFavorable)+" • Worst adverse "+activeText(active.worstAdverse));
  }
  put("gfAIRecoveryState",recovery.state.replaceAll("_"," "));
  put("gfAIRecoveryNote",recovery.reason+(recovery.ideaId?"\nNew idea: "+recovery.ideaId+(recovery.grade?" • "+recovery.grade:""):""));
  return {assessment,recovery,setup:active};
 }
 function put(id,value){if($(id))$(id).textContent=String(value??"—")}
 let studyChart=null;
 // Never retain a previous mode's BUY/SELL marker or entry plan while selecting
 // a different mode/symbol/TF. No cached UI result can act as LIVE evidence.
 function invalidate(){
  state.last=null;state.context=null;state.seq++;
  const m=mode();
  put("gfStudyModeTitle",m==="ai"?"GF-AI Live Analyst v1.50 • Live Management + Recovery":m==="study"?"GF-Market Study Pro • Technical Entry Lifecycle":"GF-News Impact Pro • Gold Context Study");
  put("gfStudyModePurpose","Loading the NEW mode. Previous signal/entry plan deliberately cleared; NO ENTRY until verified.");
  put("gfStudyState","REFRESHING");if($("gfStudyState"))$("gfStudyState").className="y";
  put("gfStudyReason","Waiting for a new verified response for this symbol / timeframe / study mode.");
  put("gfEntryDecision","NO ENTRY • REFRESHING");
  put("gfScenarioTitle","Live Research / Scenario");put("gfScenarioBadge","WAIT NEW VERIFIED RESULT");put("gfScenarioNarrative","Previous mode result removed. Waiting for a fresh analysis.");
  put("gfEntryHint","Old mode's confirmation is cleared. Never act on a previous selection.");
  put("gfOppositeDirection","NO CURRENT VERIFIED DIRECTION");
  put("gfConfirmTime","—");put("gfStudyFresh","—");
  for(const id of ["gfEntryRange","gfInvalidate","gfTP1","gfTP2","gfTP3","gfStudyTechnical","gfStudyMacro","gfReasoningHeadline","gfReasoningBuy","gfReasoningBuyWhy","gfReasoningSell","gfReasoningSellWhy","gfReasoningNoTrade","gfReasoningNoTradeWhy","gfReasoningChange","gfLearningSummary","gfTradeIdeaId","gfPlaybookState","gfPlaybookQuality","gfPlaybookHierarchy","gfPlaybookTfRole","gfPlaybookRR","gfPlaybookRisk","gfPlaybookChecklist","gfAIManageBadge","gfAIManageIdea","gfAIManageEntry","gfAIManageAction","gfAIManageRisk","gfAIRecoveryState","gfAIRecoveryNote"])put(id,"—");
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
    const prefix=d.mode==="ai"?"AI "+String(p.entryMethod||"MARKET RETEST").replaceAll("_"," "):d.mode==="study"&&d.structureFlip?.type?d.structureFlip.type+" RETEST":"PIVOT RETEST";
    for(const [price,name,color,lineStyle] of [[p.entryLow,prefix+" LOW",col,2],[p.entryHigh,prefix+" HIGH",col,2],
     [p.invalidation,"STRUCTURE INVALID","#f2c75b",0],[p.tp1,"TP1","#71c3fa",2],[p.tp2,"TP2","#71c3fa",2],[p.tp3,"TP3","#71c3fa",2]]){
      if(price!==null&&price!==undefined&&Number.isFinite(Number(price)))candle.createPriceLine({price:Number(price),color,lineWidth:1,lineStyle,axisLabelVisible:true,title:name});
    }
   }else if(d.mode==="ai"&&d.candidatePlan){
    const q=d.candidatePlan,dir=Number(d.direction)||0,col=dir>0?"#31d6a4":"#ff6079",nm=String(q.entryMethod||"AI WATCH").replaceAll("_"," ");
    for(const [price,name,color] of [[q.entryLow,nm+" LOW • WATCH",col],[q.entryHigh,nm+" HIGH • WATCH",col],
      [q.invalidation,"STRUCTURE INVALID • WATCH","#f2c75b"],[q.tp1,"TP1 PROJECTION • WATCH","#71c3fa"]]){
      if(price!==null&&price!==undefined&&Number.isFinite(Number(price)))
       candle.createPriceLine({price:Number(price),color,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:name});
    }
    const be=d.marketBrain?.selected?.breakEvent;
    if(be&&Number.isFinite(Number(be.level)))candle.createPriceLine({price:Number(be.level),color:"#71c3fa",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:be.type+" "+(be.direction>0?"BULL":"BEAR")});
   }else if(d.mode==="study"&&d.structureLevels){
    // Market Study must display its proposed levels WHILE WAITING, explicitly
    // labelled as RESEARCH and never represented as an executed position.
    const s=d.structureLevels;
    for(const [price,name,color] of [[s.support,"SUPPORT","#31d6a4"],[s.resistance,"RESISTANCE","#ff6079"],
     [s.reactionZoneLow,"REACTION ZONE LOW","#e2c165"],[s.reactionZoneHigh,"REACTION ZONE HIGH","#e2c165"],
     [s.breakoutLevel,(d.structureFlipWatch?.type||"SBR/RBS")+" WATCH","#71c3fa"],[s.invalidationLevel,"CLOSE INVALIDATES","#f2c75b"],
     ...(d.projectedTargets||[]).map((x,i)=>[x,"PROVISIONAL TARGET "+(i+1),"#71c3fa"])]){
     if(price!==null&&price!==undefined&&Number.isFinite(Number(price)))
      candle.createPriceLine({price:Number(price),color,lineWidth:1,lineStyle:2,axisLabelVisible:true,title:name});
    }
   }
   studyChart.timeScale().fitContent();
   put("gfStudyChartNote",d.mode==="study"?
    "GF-MARKET STUDY • support/resistance + explicit SBR/RBS break/retest lifecycle. RBS = broken resistance retested as support; SBR = broken support retested as resistance. PENDING/WATCH lines are NOT entry-ready. Closed-candle confirmation only.":
    d.mode==="ai"?"GF-AI v1.50 • professional top-down structure + live management/recovery lifecycle. Entry, SL and targets remain broker-research levels; no automatic order.":
    "Vantage MT5 • broker clock normalized to UTC. Confirmation uses CLOSED candles only. Never an executed trade.");
  }catch(e){if(studyChart){studyChart.remove();studyChart=null}node.textContent="Broker chart rendering unavailable.";put("gfStudyChartNote","Data visualization unavailable; trade-ready status does not depend on chart rendering.")}
 }
 window.addEventListener("resize",function(){if(studyChart&&$("gfStudyChart"))studyChart.applyOptions({width:Math.max(300,$("gfStudyChart").clientWidth)})});
 const colors={BUY_ENTRY_READY:"g",SELL_ENTRY_READY:"r",BUY_CONFIRMED:"g",SELL_CONFIRMED:"r",AI_BUY_WATCH:"g",AI_SELL_WATCH:"r",AI_MARKET_BALANCED:"y",AI_AMBIGUOUS_PATH:"y",AI_BUY_BLOCKED_MACRO:"y",AI_SELL_BLOCKED_MACRO:"y",AI_WAIT_MTF_CONFLICT:"y",AI_WAIT_DIRECTION:"y",BUY_INVALID:"r",SELL_INVALID:"r",WAIT_CONFIRMATION:"y",WAIT_CONFLICT:"y",MISSED_ENTRY:"y",COMPLETED_STUDY:"g",AMBIGUOUS_PATH:"y",EXPIRED:"y",DATA_UNVERIFIED:"y",MARKET_OFFLINE:"y"};
 function render(d){
  state.last=d;
  const rawStatus=String(d?.status||"DATA_UNVERIFIED"),st=d?.transportUnavailable?"DATA_UNVERIFIED":rawStatus,p=d?.confirmation||null;
  const m=d?.mode||mode();
  const technicalMode=m==="study",gold=/^(XAU|GOLD)/i.test(String(d?.symbol||""));
  const activeLifecycle=technicalMode?renderActiveLifecycle(d):null;
  const aiLifecycle=m==="ai"?renderAILifecycle(d):null;
  put("gfStudyModeTitle",technicalMode?"GF-Market Study Pro • Technical Entry Lifecycle":
      m==="ai"?"GF-AI Live Analyst v1.50 • Live Management + Recovery":"GF-News Impact Pro • Gold Context Study");
  put("gfStudyModePurpose",technicalMode?
    "STRUCTURE-DRIVEN: closed-candle rejection/break-retest; H1/H4 may be neutral but cannot oppose. Entry comes from dynamic pivots, targets from liquidity levels; Gold macro/yields are commentary ONLY, never entry gate.":
    m==="ai"?(gold?"PROFESSIONAL TRADER AI v1.50: D1/H4 regime → H1/M30 thesis → M15/M5 setup → M1 precision, then HOLD/PROTECT/CUT/RECOVERY management on the same Trade Idea. A++ is quality, NOT 90% certainty; full-margin/martingale are blocked.":
    "PROFESSIONAL TRADER TECHNICAL AI v1.50: top-down setup plus live management and no-martingale recovery. No fabricated asset fundamental and no trained-ML probability."):
    "GOLD NEWS CONTEXT: official macro context and closed-candle confirmation; no verified event-release timestamp or consensus surprise is asserted.");

  const aiMode=m==="ai",research=d?.macroEvidence,structure=d?.structureLevels,scenario=d?.explanation;
  put("gfScenarioTitle",aiMode?"GF-AI • Reasoning / Primary + Alternative Scenario":
    technicalMode?"Market Structure Study • Continuation / Reclaim / Reaction":"GF-News Study");
  put("gfScenarioBadge",d?.canEnter?"ENTRY CONDITIONS MET":"RESEARCH ONLY • NO EXECUTION");
  put("gfScenarioNarrative",aiMode?[
    d?.reasoning?.decisionSummary?.whyPrimary?("PRIMARY: "+d.reasoning.primaryScenario+" • "+d.reasoning.decisionSummary.whyPrimary):scenario?.headline||"AI scenario pending verified confluence.",
    d?.reasoning?.alternativeScenario?("ALTERNATIVE: "+d.reasoning.alternativeScenario+" • "+(d.reasoning.decisionSummary?.whyNotAlternative||"Lower evidence than primary.")):"",
    ...(scenario?.drivers||[]),
    "AI methodology: "+(p?.entryMethod||d?.candidatePlan?.entryMethod||"Market structure → liquidity → pattern → all-TF scenario comparison → market-driven retest"),
    d?.analysis?.directionScore!==undefined?"Reasoning confluence: "+safe(d.analysis.directionScore)+"/100 • confirm "+safe(d.analysis.confirmThreshold)+" • ready "+safe(d.analysis.readyThreshold)+" • thesis "+(d.analysis.thesis?.type||"N/A"):"",
    ...(d?.analysis?.selectedEvidence||[]).map(x=>"SELECTED TF: "+(x.points>=0?"+":"")+x.points+" • "+x.text),
    ...(d?.analysis?.allTfEvidence||[]).slice(0,12).map(x=>"ALL-TF "+x.tf+": "+(x.points>=0?"+":"")+x.points+" • "+x.text),
    d?.experienceLearning?.ok?("LEARNING: BUY adj "+(d.experienceLearning.buyAdjustment>=0?"+":"")+safe(d.experienceLearning.buyAdjustment)+" • SELL adj "+(d.experienceLearning.sellAdjustment>=0?"+":"")+safe(d.experienceLearning.sellAdjustment)+" • "+safe(d.experienceLearning.overall?.decidable)+" decidable historical event samples. NOT win probability."):"",
    ...(d?.analysis?.blockers||[]).map(x=>"BLOCKER: "+x),
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
    "SBR/RBS: "+(d?.structureFlip?.type?(d.structureFlip.type+" • "+d.structureFlip.stage+" @ "+safe(d.structureFlip.level)):(d?.structureFlipWatch?.type?(d.structureFlipWatch.type+" WATCH @ "+safe(d.structureFlipWatch.level)+" • "+d.structureFlipWatch.meaning):"No structure flip confirmed yet.")),
    "BREAK/RETEST LEVEL: "+safe(structure?.breakoutLevel)+" on CLOSED "+(d?.tf||"selected")+" candle.",
    "CONDITION A: "+(d?.confirmationRules?.reaction||""),
    "CONDITION B: "+(d?.confirmationRules?.breakdown||""),
    "INVALIDATION: "+(d?.confirmationRules?.invalidation||""),
    "PROVISIONAL TARGETS (NOT ENTRY): "+(d?.projectedTargets||[]).map(safe).join(" → "),
    "FUNDAMENTAL: "+(d?.macroContext?.explanation||"Not applied as entry gate."),
    d?.reason||""
   ].filter(Boolean).join("\n"):
   [d?.newsDecision?.headline||"WHY WAIT • NEWS IMPACT",d?.newsDecision?.summary||d?.reason||"No release-time claim without a verified official calendar.",...(d?.newsDecision?.technicalReasons||[]).map(x=>"TECHNICAL: "+x),...(d?.newsDecision?.macroReasons||[]).map(x=>"MACRO: "+x),d?.newsDecision?.disclaimer||""].filter(Boolean).join("\n"));
  const rb=aiMode?d?.reasoning:null,rbBuy=rb?.scenarios?.BUY,rbSell=rb?.scenarios?.SELL,rbFlat=rb?.scenarios?.NO_TRADE,learn=d?.experienceLearning;
  put("gfReasoningHeadline",aiMode&&rb?(rb.primaryScenario+" PRIMARY • ALT "+rb.alternativeScenario):"—");
  put("gfReasoningBuy",aiMode&&rbBuy?("BUY "+safe(rbBuy.score)+"/100 • "+(rbBuy.state||"WATCH")):"—");
  put("gfReasoningBuyWhy",aiMode&&rbBuy?[rbBuy.thesis,...(rbBuy.evidence||[]).slice(0,5).map(x=>"PRO: "+x),...(rbBuy.contradictions||[]).slice(0,4).map(x=>"CONTRA: "+x),rbBuy.entry?.entryModel?"ENTRY MODEL: "+rbBuy.entry.entryModel:""].filter(Boolean).join("\n"):"—");
  put("gfReasoningSell",aiMode&&rbSell?("SELL "+safe(rbSell.score)+"/100 • "+(rbSell.state||"WATCH")):"—");
  put("gfReasoningSellWhy",aiMode&&rbSell?[rbSell.thesis,...(rbSell.evidence||[]).slice(0,5).map(x=>"PRO: "+x),...(rbSell.contradictions||[]).slice(0,4).map(x=>"CONTRA: "+x),rbSell.entry?.entryModel?"ENTRY MODEL: "+rbSell.entry.entryModel:""].filter(Boolean).join("\n"):"—");
  put("gfReasoningNoTrade",aiMode&&rbFlat?("NO TRADE "+safe(rbFlat.score)+"/100 • "+(rbFlat.state||"OPTION")):"—");
  put("gfReasoningNoTradeWhy",aiMode&&rbFlat?((rbFlat.reasons||[]).map(x=>"• "+x).join("\n")||"No-trade remains a valid safety option."):"—");
  put("gfReasoningChange",aiMode&&rb?((rb.decisionSummary?.whatWouldChangeMyMind||[]).map(x=>"• "+x).join("\n")||"—"):"—");
  put("gfLearningSummary",aiMode&&learn?.ok?[
    "Mode: "+learn.mode,
    "BUY follow-through: "+safe(learn.buy?.followThroughRate)+"% • "+safe(learn.buy?.decidable)+" decidable • adjustment "+(learn.buyAdjustment>=0?"+":"")+safe(learn.buyAdjustment),
    "SELL follow-through: "+safe(learn.sell?.followThroughRate)+"% • "+safe(learn.sell?.decidable)+" decidable • adjustment "+(learn.sellAdjustment>=0?"+":"")+safe(learn.sellAdjustment),
    "Cap ±"+safe(learn.adjustmentCap)+" points • minimum "+safe(learn.minSamplesForAdjustment)+" samples.",
    "Historical follow-through only; NOT trade win rate / ML probability."
  ].join("\n"):aiMode?(learn?.reason||"Learning unavailable for this history window."):"—");
  const pb=aiMode?d?.professionalPlaybook:null,idea=pb?.tradeIdea;
  put("gfTradeIdeaId",idea?.id||"NO IDEA");
  put("gfPlaybookState",idea?(idea.direction+" • "+idea.state+" • "+idea.quality?.grade):pb?.status||"NO TRADE");
  put("gfPlaybookQuality",idea?("Quality "+safe(idea.quality?.score)+"/100 • floor "+safe(idea.quality?.floor)+" • "+(idea.quality?.eligible?"A-GRADE ELIGIBLE":"WATCH ONLY")+"\n"+(idea.quality?.reasons||[]).map(x=>"PRO: "+x).join("\n")+"\n"+(idea.quality?.blockers||[]).map(x=>"BLOCKER: "+x).join("\n")):(pb?.reason||"No parent trade idea."));
  put("gfPlaybookHierarchy",pb?.executionHierarchy?"D1/H4 → H1/M30 → M15/M5 → M1":"—");
  put("gfPlaybookTfRole",idea?("Selected "+safe(pb.selectedTf)+" = "+safe(pb.selectedTfRole?.role)+"\n"+safe(pb.selectedTfRole?.purpose)+"\nCadence guide: "+safe(idea.cadenceGuidance)):"—");
  put("gfPlaybookRR",idea?.riskGeometry?.rr1!==null&&idea?.riskGeometry?.rr1!==undefined?("TP1 RR "+safe(idea.riskGeometry.rr1)+" • TP2 "+safe(idea.riskGeometry.rr2)+" • TP3 "+safe(idea.riskGeometry.rr3)):"—");
  put("gfPlaybookRisk",idea?("Entry model: "+safe(idea.entryModel)+"\nLocation: "+((idea.locationEvidence||[]).join(" / ")||"NO STRONG OVERLAP")+"\nCountertrend: "+(idea.counterTrend?.isCounterTrend?(idea.counterTrend?.strongException?"YES • reversal exception passed":"YES • NOT YET QUALIFIED"):"NO")+"\n"+safe(idea.professionalRule)):"—");
  put("gfPlaybookChecklist",pb?.tfChecklist?pb.tfChecklist.map(x=>x.tf+" ["+x.role+"] "+x.direction+" • "+x.structure+(x.breakEvent?" • "+x.breakEvent:"")).join("\n"):"—");
  put("gfStudyState",d?.transportUnavailable?("DATA UNVERIFIED • LAST KNOWN "+String(d?.previousStatus||rawStatus).replaceAll("_"," ")):st.replaceAll("_"," "));
  $("gfStudyState").className=colors[st]||(st.endsWith("READY")?"g":st.endsWith("INVALID")||st==="AI_INVALIDATED"?"r":"y");
  put("gfStudyReason",d?.transportUnavailable?("BRIDGE UNAVAILABLE • Last known study is reference only and cannot create a new entry. "+(d?.transportReason||"")):(d?.reason||"No verified study state."));
  put("gfStudyFresh",[d?.symbol||"",d?.tf||"",d?.closedAtUTC||"N/A",d?.quoteAgeSeconds==null?"Tick N/A":"Tick "+d.quoteAgeSeconds+" s"].filter(Boolean).join(" • "));
  put("gfConfirmTime",p?(d?.transportUnavailable?"LAST KNOWN • ":"")+"Confirmed candle closed at "+p.confirmationCloseUTC+" • expires after "+(p.expiresAfterClosedBars||3)+" closed bars":"No confirmed closed trigger candle");
  let decision="NO ENTRY",hint="WAIT for a fresh confirmed candle. No broker order is sent.";
  if(aiMode&&aiLifecycle?.assessment?.active&&!d?.canEnter){
    decision=(aiLifecycle.setup?.side||"AI")+" ACTIVE • "+(aiLifecycle.assessment.action||"MANAGE");
    hint=aiLifecycle.assessment.reason+" A newer WAIT does not cancel the stored Trade Idea. Recovery is considered only after a terminal CUT and a NEW qualified idea.";
  }else if(aiMode&&aiLifecycle?.assessment?.state==="CUT_LOSS"){
    decision="CUT SETUP • ORIGINAL THESIS INVALID";
    hint=aiLifecycle.assessment.reason+" Recovery risk remains NORMAL only; no martingale.";
  }else if(d?.canEnter && ["AI_BUY_READY","AI_SELL_READY","BUY_ENTRY_READY","SELL_ENTRY_READY"].includes(st)){
    decision=p?.side+" • ENTRY READY"+(aiMode&&d.researchScope==="TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE"?" • TECHNICAL ONLY":"");hint="Verified CLOSED candle + FRESH "+d.entryQuoteSide+" inside mode-specific entry area. "+(aiMode&&d.researchScope==="TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE"?"Fundamental for this pair unavailable; decision is based ONLY on valid broker technical evidence. ":"")+"Study ONLY; confirm your own trade.";
  }else if(["AI_BUY_CONFIRMED","AI_SELL_CONFIRMED","BUY_CONFIRMED","SELL_CONFIRMED"].includes(st)){
    decision=p?.side+" CONFIRMED • WAIT RETEST";hint="The direction has confirmed but the quote is OUTSIDE the entry range. Do not chase.";
  }else if(["AI_INVALIDATED","BUY_INVALID","SELL_INVALID"].includes(st)){
    decision=p?.side+" INVALID • NO ENTRY";hint=d?.invalidationBasis==="INTRABAR_QUOTE"?"Live price crossed study invalidation; close validation is pending but entry blocked.":"The original study invalidation was breached by broker candles. Previous setup is cancelled.";
  }else if(st==="MISSED_ENTRY"){decision="MISSED ENTRY • NO CHASE";hint="Price already moved beyond the safe retest band. Wait for a NEW closed-candle setup."}
  else if(st==="COMPLETED_STUDY"){decision="TARGET ALREADY TOUCHED • NO ENTRY";hint="TP1 was touched after confirmation. Never reactivate a completed old setup."}
  else if(st==="AMBIGUOUS_PATH"){decision="AMBIGUOUS HISTORY • NO ENTRY";hint="TP and SL touched within the same OHLC candle; the order is unknown."}
  else if(st==="EXPIRED"){decision="EXPIRED • NO ENTRY";hint="Three closed trigger candles passed; a new setup must be confirmed."}
  else if(st==="MARKET_OFFLINE"){const stale=String(d?.reason||"")==="BROKER_TICK_MISSING_OR_STALE";decision=stale?"SYMBOL QUOTE STALE • NO ENTRY":"SELECTED TF DATA STALE • NO ENTRY";hint=stale?"Vantage terminal/bridge may still be LIVE, but this selected symbol has no fresh BID/ASK tick. This commonly occurs during a symbol-specific pause or daily rollover; no entry is allowed until the tick becomes fresh.":"The latest fully closed candle for this selected symbol/timeframe is stale. No entry is allowed until fresh broker candles resume."}
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
  }else if(["AI_BUY_WATCH","AI_SELL_WATCH"].includes(st)){
   const side=st.includes("BUY")?"BUY":"SELL",a=d?.analysis||{};
   decision=side+" WATCH • MARKET THESIS";
   hint="Directional evidence exists, but ENTRY READY is not verified yet. Score "+safe(a.directionScore)+"/100 • confirm "+safe(a.confirmThreshold)+" • ready "+safe(a.readyThreshold)+" • blockers: "+((a.blockers||[]).join(", ")||"WAIT MARKET TRIGGER / RETEST")+".";
  }else if(["AI_BUY_BLOCKED_MACRO","AI_SELL_BLOCKED_MACRO"].includes(st)){
   decision=(st.includes("BUY")?"BUY":"SELL")+" SETUP • MACRO CONFLICT • NO ENTRY";
   hint="Technical setup exists, but verified Gold macro points the opposite way. AI keeps the setup visible for study and blocks entry.";
  }else if(st==="AI_WAIT_MTF_CONFLICT"){
   decision="HIGHER-TF CONFLICT • NO FORCED ENTRY";hint="Weighted higher-timeframe structure opposes the selected-TF thesis. AI keeps WATCH until structure improves."
  }else if(st==="AI_WAIT_DIRECTION"){
   decision="NO STABLE DIRECTION • WAIT";hint="AI has no stable MTF/local direction yet. It will form BUY/SELL WATCH before ENTRY READY.";
  }else if(st==="AI_MARKET_BALANCED"){
   decision="MARKET BALANCED • NO FORCED TRADE";
   hint="BUY and SELL evidence are too close or too weak. AI will wait for BOS/CHOCH/liquidity/pattern evidence instead of inventing a signal.";
  }else if(st==="AI_AMBIGUOUS_PATH"){
   decision="AMBIGUOUS OHLC PATH • NO ENTRY";
   hint="The observed candle path touched both structural stop and TP1; result cannot be proven.";
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
  else if(st==="DATA_UNVERIFIED"){decision=d?.transportUnavailable?"BRIDGE OFFLINE • NO NEW ENTRY":"DATA UNVERIFIED";hint=d?.transportUnavailable?"Broker transport is unavailable. Any levels shown below are LAST KNOWN / STALE reference only until a fresh Vantage study is received.":"Source quality is insufficient; cannot issue a new trade-ready indication."}
  put("gfEntryDecision",decision);$("gfEntryDecision").className=d?.canEnter?(p?.direction>0?"g":"r"):"y";
  put("gfEntryHint",hint);
  put("gfOppositeDirection",p&&["AI_BUY_READY","AI_SELL_READY","AI_BUY_CONFIRMED","AI_SELL_CONFIRMED","BUY_ENTRY_READY","SELL_ENTRY_READY","BUY_CONFIRMED","SELL_CONFIRMED"].includes(st)?
   (p.direction>0?"SELL INVALID for this BUY study":"BUY INVALID for this SELL study"):
   "Opposite-direction status is not an independent confirmed trade.");
  const staleTag=d?.transportUnavailable?" (LAST KNOWN)":"",watchPlan=aiMode&&!p?d?.candidatePlan:null;
  put("gfEntryRange",p?safe(p.entryLow)+" — "+safe(p.entryHigh)+staleTag:watchPlan?safe(watchPlan.entryLow)+" — "+safe(watchPlan.entryHigh)+" (WATCH)":structure&&technicalMode?"REACTION (WAIT): "+safe(structure.reactionZoneLow)+" — "+safe(structure.reactionZoneHigh)+staleTag:"—");
  put("gfInvalidate",p?safe(p.invalidation)+staleTag:watchPlan?safe(watchPlan.invalidation)+" (WATCH)":technicalMode?safe(structure?.invalidationLevel)+" (WAIT)"+staleTag:"—");
  put("gfTP1",p?safe(p.tp1)+staleTag:watchPlan?safe(watchPlan.tp1)+" (WATCH)":technicalMode&&d.projectedTargets?.length?safe(d.projectedTargets[0])+" (PROJECTION)"+staleTag:"—");
  put("gfTP2",p?safe(p.tp2)+staleTag:watchPlan?safe(watchPlan.tp2)+" (WATCH)":technicalMode&&d.projectedTargets?.length>1?safe(d.projectedTargets[1])+" (PROJECTION)"+staleTag:"—");
  put("gfTP3",p?safe(p.tp3)+staleTag:watchPlan?safe(watchPlan.tp3)+" (WATCH)":technicalMode&&d.projectedTargets?.length>2?safe(d.projectedTargets[2])+" (PROJECTION)"+staleTag:"—");
  const h1=v=>v===1?"BULLISH":v===-1?"BEARISH":"NEUTRAL / N/A";
  put("gfStudyTechnical",[
    "Independent engine: "+(d?.engine||"UNVERIFIED")+" • Broker: "+(d?.source||d?.technicalSource||"VANTAGE MT5"),
    aiMode&&Array.isArray(d?.analysis?.timeframeMatrix)?"ALL TF MATRIX: "+d.analysis.timeframeMatrix.map(x=>x.available?x.tf+" "+(x.structure===1?"BULL":x.structure===-1?"BEAR":"NEUT")+" "+safe(x.buyScore)+"/"+safe(x.sellScore):x.tf+" N/A").join(" • "):"H1: "+h1(d?.h1Trend)+"; H4: "+h1(d?.h4Trend),
    aiMode&&d?.analysis?.allTfConsensus?"ALL TF CONSENSUS: BUY "+safe(d.analysis.allTfConsensus.buy)+" • SELL "+safe(d.analysis.allTfConsensus.sell)+" • gap "+safe(d.analysis.allTfConsensus.gap)+" • coverage "+safe(d.analysis.tfCoverage?.available)+"/"+safe(d.analysis.tfCoverage?.total):"",
    aiMode&&d?.reasoning?"REASONING: PRIMARY "+d.reasoning.primaryScenario+" • ALT "+d.reasoning.alternativeScenario+" • "+(d.reasoning.decisionSummary?.whyPrimary||""):"",
    aiMode&&d?.professionalPlaybook?.tradeIdea?"TRADE IDEA: "+d.professionalPlaybook.tradeIdea.id+" • "+d.professionalPlaybook.tradeIdea.direction+" • "+d.professionalPlaybook.tradeIdea.state+" • grade "+d.professionalPlaybook.tradeIdea.quality?.grade+" • anchor "+d.professionalPlaybook.tradeIdea.anchorTf:"",
    aiMode&&d?.professionalPlaybook?"PLAYBOOK: D1/H4 regime → H1/M30 thesis → M15/M5 setup → M1 precision • ONE_PARENT_IDEA_ACROSS_TFS":"",
    aiMode&&aiLifecycle?.setup?"LIVE LIFECYCLE: "+aiLifecycle.setup.id+" • "+aiLifecycle.assessment.state+" • "+(aiLifecycle.assessment.action||"WAIT")+" • "+(aiLifecycle.assessment.rNow===null||aiLifecycle.assessment.rNow===undefined?"R N/A":"R "+Number(aiLifecycle.assessment.rNow).toFixed(2)):"",
    aiMode&&aiLifecycle?.recovery?"RECOVERY: "+aiLifecycle.recovery.state+" • "+aiLifecycle.recovery.reason:"",
    aiMode&&d?.experienceLearning?.ok?"EXPERIENCE: BUY "+(d.experienceLearning.buyAdjustment>=0?"+":"")+safe(d.experienceLearning.buyAdjustment)+" • SELL "+(d.experienceLearning.sellAdjustment>=0?"+":"")+safe(d.experienceLearning.sellAdjustment)+" • "+safe(d.experienceLearning.overall?.decidable)+" decidable samples (NOT win probability)":"",
    aiMode&&d?.aiPolicy?"AI MARKET BRAIN: "+(Array.isArray(d.aiPolicy.primaryEngines)?d.aiPolicy.primaryEngines.join(" • "):"UNAVAILABLE")+" | ENTRY MODELS: "+(Array.isArray(d.aiPolicy.entryModels)?d.aiPolicy.entryModels.join(" • "):"UNAVAILABLE")+" | FIB: "+(d.aiPolicy.fibonacciRole||"OPTIONAL")+"." :"",
    aiMode&&d?.aiPolicy&&!d.aiPolicy.persistent24hSignalArchive?"24H AI HISTORY: NOT ARCHIVED YET — current WAIT cannot prove there was no transient setup earlier in the day.":"",
    technicalMode?(d?.structureFlip?.type?"SBR/RBS: "+d.structureFlip.type+" • "+d.structureFlip.stage+" @ "+safe(d.structureFlip.level):d?.structureFlipWatch?.type?"SBR/RBS: "+d.structureFlipWatch.type+" WATCH @ "+safe(d.structureFlipWatch.level):"SBR/RBS: no confirmed flip"):"",
    p?"Closed candle: "+p.confirmationType+(p.score!==null&&p.score!==undefined&&Number.isFinite(Number(p.score))?" • Market-intelligence confluence "+p.score+"/100 (NOT win probability)":" • Structure-derived confirmation"):(aiMode&&d?.analysis?.directionScore!==undefined?"Directional WATCH "+safe(d.analysis.directionScore)+"/100 • "+(d.analysis.thesis?.type||"MARKET THESIS")+" • no entry-ready trigger/retest yet":"No validated signal candle"),
    aiMode&&d?.marketBrain?.selected?"STRUCTURE: "+(d.marketBrain.selected.structure?.highClass||"N/A")+"/"+(d.marketBrain.selected.structure?.lowClass||"N/A")+" • "+(d.marketBrain.selected.breakEvent?.label||"NO RECENT BOS/CHOCH"):"",
    aiMode&&d?.marketBrain?.selected?.liquidity?.sweep?"LIQUIDITY: "+d.marketBrain.selected.liquidity.sweep.type+" @ "+safe(d.marketBrain.selected.liquidity.sweep.level):"",
    aiMode&&d?.marketBrain?.selected?.chartPattern?"CHART PATTERN: "+d.marketBrain.selected.chartPattern.type+" • "+d.marketBrain.selected.chartPattern.state:"",
    aiMode&&d?.marketBrain?.selected?.zones?.flip?"SBR/RBS: "+d.marketBrain.selected.zones.flip.type+" @ "+safe(d.marketBrain.selected.zones.flip.level):"",
    aiMode&&d?.marketBrain?.selected?.zones?.orderBlock?"ORDER BLOCK: "+d.marketBrain.selected.zones.orderBlock.type+" "+safe(d.marketBrain.selected.zones.orderBlock.low)+" — "+safe(d.marketBrain.selected.zones.orderBlock.high):"",
    aiMode&&d?.marketBrain?.selected?.zones?.fvg?"FVG: "+d.marketBrain.selected.zones.fvg.type+" "+safe(d.marketBrain.selected.zones.fvg.low)+" — "+safe(d.marketBrain.selected.zones.fvg.high):"",
    p?"Entry quote "+(d?.entryQuoteSide||"—")+": "+safe(d?.entryQuote):watchPlan?"Candidate "+watchPlan.entryMethod+" • RESEARCH WATCH ONLY":"",
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
    d?.newsDecision?.headline||"GF-NEWS IMPACT • WHY BUY / SELL / WAIT",
    d?.newsDecision?.summary||"",
    "Derived gold macro context: "+(macro.gold?.bias||"N/A")+" • Score "+safe(macro.gold?.score)+"/100 (NOT a directional guarantee)",
    "Official/derived coverage: "+safe(macro.quality?.available)+"/"+safe(macro.quality?.total)+"; source errors "+(macro.quality?.errors?.length||0),
    ...(d?.newsDecision?.drivers||[]).map(x=>x.id+": "+(x.display||"N/A")+" • "+(x.impact||"MIXED")+" • Period "+(x.period||"N/A")+" • "+(x.status||"")),
    "Important: PRESSURE/SUPPORTIVE are GoldFlow derived macro-context labels. They are not a verified event surprise or automatic entry. Market price confirmation is required."
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

 function transportLost(reason){
  if(!isGF())return;
  const old=state.last;
  if(old){
    render({...old,ok:false,transportUnavailable:true,transportReason:String(reason||"BROKER TRANSPORT UNAVAILABLE"),
      previousStatus:String(old.status||"DATA_UNVERIFIED"),status:"DATA_UNVERIFIED",canEnter:false,bid:null,ask:null,entryQuote:null,quoteAgeSeconds:null,
      limitation:"BRIDGE OFFLINE • LAST KNOWN study shown for reference only. No new entry can be issued until fresh Vantage data returns."});
  }else{
    render({ok:false,mode:mode(),status:"DATA_UNVERIFIED",transportUnavailable:true,transportReason:String(reason||"BROKER TRANSPORT UNAVAILABLE"),
      canEnter:false,reason:"Bridge unavailable. Entry blocked.",limitation:"BRIDGE OFFLINE • No verified broker study is available."});
  }
}
window.GFStudy={load,invalidate,getLast:()=>state.last,getActive:()=>state.active,getAIActive:()=>state.aiActive,getAILoss:()=>state.aiLoss,transportLost};
 if($("gfStudyRefresh"))$("gfStudyRefresh").onclick=load;
 if($("gfActiveSetupClear"))$("gfActiveSetupClear").onclick=function(){removeActive(state.last||{});state.active=null;if(state.last)renderActiveLifecycle(state.last)};
 if($("gfAIManageClear"))$("gfAIManageClear").onclick=function(){const d=state.last||{};saveAI(d,AI_ACTIVE_PREFIX,null);saveAI(d,AI_LOSS_PREFIX,null);state.aiActive=null;state.aiLoss=null;if(state.last)renderAILifecycle(state.last)};
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
