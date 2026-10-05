function finite(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function fmt(v,d=2){return finite(v)?Number(v).toFixed(d):"—"}
function tag(x){return String(x||"").replace(/[^A-Za-z0-9_:-]/g,"_").slice(0,80)}
export function buildAlertPreview({analysis,decision,tradePlan,newsRisk,sessionLiquidity,calibration,dataHealth}={}){
  const symbol=analysis?.symbol||analysis?.requested||"UNKNOWN",tf=analysis?.selectedTF||analysis?.triggerTF||"";
  const side=decision?.side||tradePlan?.side||"WAIT";
  let severity="INFO",code="NO_ALERT",notify=false,reason="No actionable state change.";
  const status=tradePlan?.status||"WAIT";

  if(status==="INVALIDATED"){severity="HIGH";code="PLAN_INVALIDATED";notify=true;reason="Broker price crossed the model invalidation level."}
  else if(status==="BLOCK_NEWS"){severity="HIGH";code="HIGH_IMPACT_NEWS_BLOCK";notify=true;reason="Official high-impact event is inside the hard-block window."}
  else if(status==="READY_NEAR_ENTRY"){severity="HIGH";code="RESEARCH_READY_NEAR_ENTRY";notify=true;reason="All research gates passed and price is near model entry."}
  else if(status==="WAIT_NO_CHASE"){severity="MEDIUM";code="NO_CHASE";notify=true;reason="Price moved too far beyond preferred entry."}
  else if(decision?.decision==="WATCH"&&status==="IN_ZONE_WATCH"){severity="MEDIUM";code="WATCH_IN_ZONE";notify=true;reason="Price is inside a directional zone but one or more gates remain incomplete."}
  else if(newsRisk?.status==="EVENT_SOON"){severity="MEDIUM";code="EVENT_SOON";notify=true;reason="A verified high-impact event is approaching."}
  else if(sessionLiquidity?.recentSweeps?.length){severity="MEDIUM";code="LIQUIDITY_SWEEP";notify=true;reason="Latest closed M5 candle swept a tracked session/day liquidity level."}
  else if(dataHealth?.status==="BAD"){severity="HIGH";code="DATA_HEALTH_BAD";notify=true;reason="Broker/data quality has a hard blocker."}

  const entry=tradePlan?.entry,sl=tradePlan?.sl,tp1=tradePlan?.tp1;
  const next=newsRisk?.nextHighImpact;
  const sweep=sessionLiquidity?.recentSweeps?.[0];
  const prob=calibration?.status==="CALIBRATED_FORWARD"&&finite(calibration?.calibratedProbability)
    ?Math.round(100*Number(calibration.calibratedProbability))+"%"
    :"UNVERIFIED";

  const lines=[
    "GoldFlow Smart Quant",
    symbol+(tf?" • "+tf:"")+" • "+side,
    code,
    reason
  ];
  if(finite(entry))lines.push("Entry "+fmt(entry,2)+(finite(sl)?" | SL "+fmt(sl,2):"")+(finite(tp1)?" | TP1 "+fmt(tp1,2):""));
  lines.push("Decision "+(decision?.decision||"WAIT")+" | Model "+(finite(decision?.modelConfidence)?Math.round(decision.modelConfidence)+"%":"—")+" | Forward P "+prob);
  if(next)lines.push("Next "+(next.type||next.title||"High impact")+" "+String(next.scheduledAtUTC||""));
  if(sweep)lines.push("Sweep "+sweep.id+" @ "+fmt(sweep.value,2));
  lines.push("Research only • no broker order sent");

  const dedupeKey=tag([symbol,tf,code,side,finite(entry)?Number(entry).toFixed(3):"",next?.scheduledAtUTC||"",sweep?.id||""].join(":"));
  return {
    notify,severity,code,dedupeKey,reason,
    telegramText:lines.join("\n"),
    channels:["TELEGRAM_PREVIEW"],
    policy:"Preview only. Sending must happen through a separate deduplicated action/worker; polling this API never sends messages."
  };
}
