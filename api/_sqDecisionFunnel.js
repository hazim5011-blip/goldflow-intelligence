import {n,clamp,isGoldSymbol,sign} from "./_sqFeatures.js";

const points={PASS:1,CAUTION:.55,UNVERIFIED:.25,NA:.7,FAIL:0};
function gate(id,label,status,reason,hard=false,weight=0){return {id,label,status,reason,hard,weight}}
function macroDirection(macro){
  const b=String(macro?.gold?.bias||"MIXED").toUpperCase();
  return b==="SUPPORTIVE"?1:b==="PRESSURE"?-1:0;
}
function zoneSupport(indicator,direction,features){
  const z=indicator?.activeZones||{},arr=direction>0?(z.buy||[]):direction<0?(z.sell||[]):[];
  if(arr.length)return {status:"PASS",reason:arr.length+" active directional zone(s) support the setup."};
  if(direction>0&&features?.sweepDown)return {status:"PASS",reason:"Bullish liquidity sweep supports the setup."};
  if(direction<0&&features?.sweepUp)return {status:"PASS",reason:"Bearish liquidity sweep supports the setup."};
  return {status:"CAUTION",reason:"No directional active zone or confirmed sweep is currently available."};
}
export function buildDecisionFunnel({analysis,macro,features,regime,dataHealth,newsRisk,calibration}){
  const sig=analysis?.indicator?.latestSignal||{},direction=sign(n(sig.direction)??0),score=n(sig.score);
  const setup=sign(features?.setupTrend||0),bias=sign(features?.biasTrend||0),gold=isGoldSymbol(analysis?.symbol||analysis?.requested);
  const gates=[];

  gates.push(gate("DATA_VALID","Data integrity",dataHealth?.hardBlock?"FAIL":dataHealth?.status==="GOOD"?"PASS":"CAUTION",
    dataHealth?.hardBlock?"Broker/candle quality has a hard blocker.":"Data-health score "+(dataHealth?.score??"N/A")+"/100.",true,18));

  if(!direction)gates.push(gate("STRUCTURE_VALID","Directional structure","FAIL","No confirmed directional setup is available.",true,18));
  else if(score!=null&&score<55)gates.push(gate("STRUCTURE_VALID","Directional structure","CAUTION","Directional setup exists but engine score is below 55.",false,18));
  else gates.push(gate("STRUCTURE_VALID","Directional structure","PASS","Directional setup is present"+(score!=null?" with engine score "+Math.round(score):"")+".",true,18));

  let mtfStatus="CAUTION",mtfReason="Higher-timeframe alignment is partial.";
  if(direction&&setup===direction&&bias===direction){mtfStatus="PASS";mtfReason="Trigger/setup/bias direction are aligned."}
  else if(direction&&(setup===-direction||bias===-direction)){mtfStatus="FAIL";mtfReason="At least one higher timeframe opposes the setup direction."}
  else if(!direction){mtfStatus="FAIL";mtfReason="No directional setup to validate."}
  gates.push(gate("MTF_VALID","Multi-timeframe alignment",mtfStatus,mtfReason,true,14));

  let regStatus="CAUTION",regReason="Regime is neutral/mixed.";
  if(!regime||regime.name==="UNKNOWN"){regStatus="UNVERIFIED";regReason="Regime could not be verified."}
  else if(direction&&regime.direction===direction){regStatus="PASS";regReason=regime.name+" supports the setup direction."}
  else if(direction&&regime.direction===-direction){regStatus="FAIL";regReason=regime.name+" opposes the setup direction."}
  else if(direction===0){regStatus="FAIL";regReason="No setup direction for regime compatibility."}
  gates.push(gate("REGIME_VALID","Market regime",regStatus,regReason,true,14));

  if(!gold)gates.push(gate("MACRO_VALID","Gold macro context","NA","Gold-specific macro gate is not applied to this symbol.",false,12));
  else if(!macro?.ok)gates.push(gate("MACRO_VALID","Gold macro context","UNVERIFIED","Macro engine unavailable; do not treat technical confidence as full-market confidence.",false,12));
  else{
    const md=macroDirection(macro),q=macro.quality||{},fresh=n(q.fresh)||0,total=n(q.total)||0,freshRatio=total?fresh/total:0;
    if(md===0)gates.push(gate("MACRO_VALID","Gold macro context","CAUTION","Macro Gold bias is MIXED.",false,12));
    else if(direction&&md===direction)gates.push(gate("MACRO_VALID","Gold macro context",freshRatio>=.5?"PASS":"CAUTION","Macro Gold bias supports the setup"+(freshRatio<.5?" but data freshness is weak.":"."),false,12));
    else if(direction&&md===-direction)gates.push(gate("MACRO_VALID","Gold macro context",freshRatio>=.5?"FAIL":"CAUTION","Macro Gold bias opposes the setup"+(freshRatio<.5?" but freshness is insufficient for a hard block.":"."),freshRatio>=.5,12));
    else gates.push(gate("MACRO_VALID","Gold macro context","CAUTION","No directional setup to compare with macro bias.",false,12));
  }

  const liq=zoneSupport(analysis?.indicator,direction,features);
  gates.push(gate("LIQUIDITY_VALID","Liquidity / zone context",direction?liq.status:"FAIL",direction?liq.reason:"No directional setup.",false,8));

  if(!newsRisk||newsRisk.verification!=="VERIFIED_OFFICIAL_SCHEDULES"){
    gates.push(gate("NEWS_RISK","Upcoming news risk","UNVERIFIED","Official BLS/BEA/Fed schedule coverage is incomplete. Private releases and unscheduled shocks are not covered.",false,0));
  }else if(newsRisk.block){
    const e=newsRisk.nextHighImpact;
    gates.push(gate("NEWS_RISK","Upcoming news risk","FAIL",(e?.type||"HIGH IMPACT")+" is inside the ±30 minute hard-block window.",true,0));
  }else if(newsRisk.status==="EVENT_SOON"){
    const e=newsRisk.nextHighImpact;
    gates.push(gate("NEWS_RISK","Upcoming news risk","CAUTION",(e?.type||"High-impact event")+" is due in "+Math.max(0,Math.round(newsRisk.minutesToNextHigh||0))+" minutes.",false,0));
  }else{
    gates.push(gate("NEWS_RISK","Upcoming news risk","PASS","Official high-impact schedule is verified and outside the hard-block window.",false,0));
  }

  let entryStatus="CAUTION",entryReason="Entry-distance quality unavailable.";
  if(!direction){entryStatus="FAIL";entryReason="No directional setup."}
  else if(features?.spreadToAtr!=null&&features.spreadToAtr>.35){entryStatus="FAIL";entryReason="Spread is too large relative to ATR14."}
  else if(features?.entryDistanceAtr==null){entryStatus="CAUTION";entryReason="Signal entry is not defined; treat as research/watch only."}
  else if(features.entryDistanceAtr<=.50){entryStatus="PASS";entryReason="Price is within 0.50 ATR of the model entry."}
  else if(features.entryDistanceAtr<=1.0){entryStatus="CAUTION";entryReason="Price is "+features.entryDistanceAtr.toFixed(2)+" ATR from model entry."}
  else {entryStatus="FAIL";entryReason="Price is "+features.entryDistanceAtr.toFixed(2)+" ATR from model entry; chasing is blocked."}
  gates.push(gate("ENTRY_QUALITY_VALID","Entry quality",entryStatus,entryReason,true,10));

  const entry=n(sig.entry),sl=n(sig.invalidation),tp=n(sig.tp1);
  let riskStatus="CAUTION",riskReason="Trade-plan risk model is incomplete.";
  if(!direction) {riskStatus="FAIL";riskReason="No directional setup."}
  else if(entry==null||sl==null||direction*(entry-sl)<=0){riskStatus="FAIL";riskReason="Entry/SL geometry is missing or invalid."}
  else if(tp==null){riskStatus="CAUTION";riskReason="SL is defined but this engine does not provide a verified TP1 outcome model."}
  else if(direction*(tp-entry)<=0){riskStatus="FAIL";riskReason="TP1 geometry is invalid."}
  else {const rr=Math.abs((tp-entry)/(entry-sl));riskStatus=rr>=1?"PASS":"CAUTION";riskReason="Plan R:R to TP1 is "+rr.toFixed(2)+"R."}
  gates.push(gate("RISK_VALID","Risk geometry",riskStatus,riskReason,true,6));

  let probStatus="UNVERIFIED",probReason="Forward-calibrated probability is unavailable.";
  const calibrated=calibration?.status==="CALIBRATED_FORWARD"&&n(calibration?.calibratedProbability)!=null;
  if(calibrated){
    const p=Number(calibration.calibratedProbability);
    if(p>=.58){probStatus="PASS";probReason="Forward-calibrated positive-outcome probability is "+Math.round(100*p)+"%."}
    else if(p>=.52){probStatus="CAUTION";probReason="Forward-calibrated probability is only "+Math.round(100*p)+"%; edge is modest."}
    else {probStatus="FAIL";probReason="Forward-calibrated probability is "+Math.round(100*p)+"%, below the minimum research threshold."}
  }else if(calibration?.status==="WEAK_FORWARD_CALIBRATION"){
    probReason="Forward samples exist but chronological holdout reliability failed.";
  }else if(calibration?.status==="INSUFFICIENT_CLASS_BALANCE"){
    probReason="Forward sample has insufficient win/loss balance for reliable calibration.";
  }else if(calibration?.status==="INSUFFICIENT_FORWARD_SAMPLE"){
    probReason="Need at least "+(calibration?.minSample||50)+" completed forward samples before probability is published.";
  }
  gates.push(gate("PROBABILITY_VALID","Forward probability calibration",probStatus,probReason,probStatus==="FAIL",12));

  const weighted=gates.filter(g=>g.weight>0),den=weighted.reduce((s,g)=>s+g.weight,0);
  const confidence=den?clamp(Math.round(100*weighted.reduce((s,g)=>s+g.weight*(points[g.status]??0),0)/den)):0;
  const hardFails=gates.filter(g=>g.hard&&g.status==="FAIL");
  const softFails=gates.filter(g=>!g.hard&&g.status==="FAIL");
  let decision="WAIT";
  const newsGate=gates.find(g=>g.id==="NEWS_RISK"),probGate=gates.find(g=>g.id==="PROBABILITY_VALID");
  if(!hardFails.length&&direction){
    if(confidence>=75&&newsGate?.status==="PASS"&&probGate?.status==="PASS")decision="RESEARCH_READY";
    else if(confidence>=55)decision="WATCH";
  }
  const side=direction>0?"BUY":direction<0?"SELL":"WAIT";
  const reasons=[...hardFails,...softFails,gates.filter(g=>g.status==="UNVERIFIED")].map(g=>g.id+": "+g.reason);

  return {
    decision,side,direction,modelConfidence:confidence,
    modelConfidenceMeaning:"WEIGHTED_GATE_CONFIDENCE_NOT_CALIBRATED_WIN_PROBABILITY",
    calibratedProbability:calibrated?Number(calibration.calibratedProbability):null,
    probabilityStatus:calibration?.status||"UNVERIFIED",
    gates,reasons,
    executionReady:false,
    executionBlock:decision==="RESEARCH_READY"
      ?"Research readiness passed, but broker order execution remains intentionally disabled."
      :(newsGate?.status!=="PASS"?"Smart Quant remains research-only: news-risk gate is not clear."
        :probGate?.status!=="PASS"?"Smart Quant remains research-only: forward probability gate is not validated."
        :"Smart Quant remains research-only until all hard gates and confidence thresholds pass."),
    summary:decision==="RESEARCH_READY"?side+" research setup passed all hard Phase-1 gates.":decision==="WATCH"?side+" setup is incomplete or lower-conviction.":"WAIT until failed or conflicting gates resolve."
  };
}
