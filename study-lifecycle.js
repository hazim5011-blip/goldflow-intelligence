(function(root){
 "use strict";
 const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
 const READY=new Set(["BUY_ENTRY_READY","SELL_ENTRY_READY"]);
 const TERMINAL=new Set(["INVALIDATED","COMPLETED_TP1","AMBIGUOUS_PATH"]);
 function idOf(d,p){return [d?.symbol||"",d?.tf||"",Number(p?.signalCandleTime)||0,Number(p?.direction)||0].join("|")}
 function candidate(d){
  const p=d?.confirmation,st=String(d?.status||"");
  if(d?.mode!=="study"||!d?.canEnter||!READY.has(st)||!p||![1,-1].includes(Number(p.direction)))return null;
  if(![p.entryLow,p.entryHigh,p.invalidation,p.tp1].every(finite))return null;
  return {
   version:1,id:idOf(d,p),symbol:String(d.symbol||""),tf:String(d.tf||""),mode:"study",
   direction:Number(p.direction),side:Number(p.direction)>0?"BUY":"SELL",
   entryLow:Number(p.entryLow),entryHigh:Number(p.entryHigh),invalidation:Number(p.invalidation),
   tp1:Number(p.tp1),tp2:finite(p.tp2)?Number(p.tp2):null,tp3:finite(p.tp3)?Number(p.tp3):null,
   signalCandleTime:Number(p.signalCandleTime)||null,confirmationCloseUTC:p.confirmationCloseUTC||null,
   observedEntryPrice:finite(d.entryQuote)?Number(d.entryQuote):null,
   observedAtUTC:d.updatedAtUTC||new Date().toISOString(),
   note:"Browser observed a verified Market Study READY quote inside the entry zone; this is not proof of a broker order or fill."
  };
 }
 function evaluate(a,d){
  if(!a)return {state:"NONE",active:false,terminal:false,reason:"No observed Market Study setup."};
  if(a.terminalState)return {state:a.terminalState,active:false,terminal:true,reason:a.terminalReason||"Stored terminal lifecycle state."};
  const symbol=String(d?.symbol||a.symbol),tf=String(d?.tf||a.tf);
  if(symbol!==a.symbol||tf!==a.tf||String(d?.mode||"study")!=="study")
   return {state:"CONTEXT_MISMATCH",active:false,terminal:false,reason:"Different symbol/timeframe context."};
  const st=String(d?.status||""),p=d?.confirmation,same=!!p&&idOf(d,p)===a.id;
  if((a.direction>0&&st==="BUY_INVALID")||(a.direction<0&&st==="SELL_INVALID"))
   return {state:"INVALIDATED",active:false,terminal:true,reason:"Current verified Market Study invalidated the same directional structure."};
  if(same&&st==="STUDY_AMBIGUOUS_PATH")
   return {state:"AMBIGUOUS_PATH",active:false,terminal:true,reason:"OHLC cannot prove whether target or invalidation was touched first."};
  if(same&&st==="STUDY_TARGET_TOUCHED")
   return {state:"COMPLETED_TP1",active:false,terminal:true,reason:"TP1 was observed after the stored confirmation."};
  const age=Number(d?.quoteAgeSeconds),fresh=Number.isFinite(age)&&age>=-20&&age<=35;
  const q=a.direction>0?Number(d?.bid):Number(d?.ask);
  if(!fresh||!Number.isFinite(q)||q<=0)
   return {state:"ACTIVE_QUOTE_OFFLINE",active:true,terminal:false,reason:"Setup is retained, but a fresh exit-side broker quote is unavailable; do not infer cancellation or completion."};
  if(a.direction>0?q<=a.invalidation:q>=a.invalidation)
   return {state:"INVALIDATED",active:false,terminal:true,reason:"Fresh broker exit-side quote crossed the stored SL / structural invalidation."};
  if(a.direction>0?q>=a.tp1:q<=a.tp1)
   return {state:"COMPLETED_TP1",active:false,terminal:true,reason:"Fresh broker exit-side quote reached the stored TP1 objective."};
  return {state:"ACTIVE_VALID",active:true,terminal:false,reason:"Earlier observed entry setup remains valid. A newer WAIT status applies to NEW confirmation only; it does not cancel this stored setup."};
 }
 root.GFStudyLifecycle={candidate,evaluate,isTerminal:s=>TERMINAL.has(String(s||""))};
})(typeof window!=="undefined"?window:globalThis);
