(function(root){
 "use strict";
 // GF-AI Live Management + Recovery Brain v1.50
 // Browser-observed research lifecycle only. Never proof of a broker order/fill.
 // Recovery never increases risk after a loss and never martingales.
 const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
 const READY=new Set(["AI_BUY_READY","AI_SELL_READY"]);
 const TERMINAL=new Set(["CUT_LOSS","TP3_COMPLETE","AMBIGUOUS_PATH"]);
 const side=d=>Number(d)>0?"BUY":"SELL";
 function quote(d,a){
  const age=Number(d?.quoteAgeSeconds),fresh=Number.isFinite(age)&&age>=-20&&age<=35;
  const q=Number(a?.direction)>0?Number(d?.bid):Number(d?.ask);
  return fresh&&Number.isFinite(q)&&q>0?q:null;
 }
 function currentIdea(d){return d?.professionalPlaybook?.tradeIdea||null}
 function candidate(d,loss){
  const p=d?.confirmation,idea=currentIdea(d),st=String(d?.status||"");
  if(d?.mode!=="ai"||!d?.canEnter||!READY.has(st)||!p||!idea||![1,-1].includes(Number(p.direction)))return null;
  if(![p.entryLow,p.entryHigh,p.invalidation,p.tp1].every(finite))return null;
  const grade=String(idea?.quality?.grade||"");
  if(!["A++","A+","A"].includes(grade)||idea?.quality?.eligible!==true)return null;
  const entry=finite(d.entryQuote)?Number(d.entryQuote):(Number(p.entryLow)+Number(p.entryHigh))/2;
  const risk=Math.abs(entry-Number(p.invalidation));
  if(!(risk>0))return null;
  return {
   version:1.5,id:String(idea.id||p.tradeIdeaId||""),symbol:String(d.symbol||""),mode:"ai",
   direction:Number(p.direction),side:side(p.direction),selectedTf:String(d.tf||""),anchorTf:String(idea.anchorTf||""),
   grade,qualityScore:Number(idea?.quality?.score)||null,entryLow:Number(p.entryLow),entryHigh:Number(p.entryHigh),
   invalidation:Number(p.invalidation),tp1:Number(p.tp1),tp2:finite(p.tp2)?Number(p.tp2):null,tp3:finite(p.tp3)?Number(p.tp3):null,
   entryPrice:entry,risk,signalCandleTime:Number(p.signalCandleTime)||null,confirmationCloseUTC:p.confirmationCloseUTC||null,
   observedAtUTC:d.updatedAtUTC||new Date().toISOString(),bestFavorable:0,worstAdverse:0,hitTP1:false,hitTP2:false,
   recoveryFrom:loss&&loss.id&&loss.id!==String(idea.id||"")?loss.id:null,recoveryRule:loss?"NORMAL_RISK_ONLY_NO_MARTINGALE":null,
   note:"Browser observed GF-AI ENTRY READY inside its verified zone. This is a research lifecycle, not proof of an MT5 order or fill."
  };
 }
 function oppositeStructuralCut(a,d){
  const want=-Number(a.direction),r=d?.reasoning,idea=currentIdea(d),tr=d?.analysis?.trigger;
  if(!r||!idea||idea.id===a.id)return false;
  const primary=r.primaryScenario==="BUY"?1:r.primaryScenario==="SELL"?-1:0;
  const triggerDir=Number(tr?.direction)||0;
  const grade=String(idea?.quality?.grade||"");
  return primary===want&&triggerDir===want&&["A++","A+","A"].includes(grade)&&idea?.quality?.eligible===true;
 }
 function evaluate(a,d){
  if(!a)return {state:"NONE",active:false,terminal:false,action:"WAIT",reason:"No observed GF-AI entry lifecycle."};
  if(a.terminalState)return {state:a.terminalState,active:false,terminal:true,action:a.terminalAction||a.terminalState,reason:a.terminalReason||"Stored terminal AI lifecycle.",updates:{}};
  if(String(d?.symbol||a.symbol)!==a.symbol||String(d?.mode||"ai")!=="ai")
   return {state:"CONTEXT_MISMATCH",active:false,terminal:false,action:"WAIT",reason:"Different symbol/mode context.",updates:{}};
  const q=quote(d,a);
  if(q===null)return {state:"ACTIVE_QUOTE_OFFLINE",active:true,terminal:false,action:"HOLD_DATA",reason:"Active idea retained, but fresh broker exit-side quote is unavailable.",updates:{}};
  const fav=a.direction>0?q-a.entryPrice:a.entryPrice-q,adv=a.direction>0?a.entryPrice-q:q-a.entryPrice;
  const best=Math.max(Number(a.bestFavorable)||0,fav),worst=Math.max(Number(a.worstAdverse)||0,adv),rNow=a.risk>0?fav/a.risk:null;
  const updates={bestFavorable:best,worstAdverse:worst,lastQuote:q,lastSeenUTC:d?.updatedAtUTC||new Date().toISOString()};
  const hit1=Boolean(a.hitTP1)||(a.direction>0?q>=a.tp1:q<=a.tp1);
  const hit2=Boolean(a.hitTP2)||(finite(a.tp2)&&(a.direction>0?q>=a.tp2:q<=a.tp2));
  updates.hitTP1=hit1;updates.hitTP2=hit2;
  if(a.direction>0?q<=a.invalidation:q>=a.invalidation)
   return {state:"CUT_LOSS",active:false,terminal:true,action:"CUT SETUP",reason:"Fresh broker quote crossed the stored structural SL / invalidation. Original thesis is finished.",rNow,updates};
  if(oppositeStructuralCut(a,d))
   return {state:"CUT_LOSS",active:false,terminal:true,action:"CUT • THESIS FLIPPED",reason:"A different A-grade Trade Idea has confirmed in the opposite direction with a fresh structural trigger. Do not keep the old thesis alive.",rNow,updates};
  if(finite(a.tp3)&&(a.direction>0?q>=a.tp3:q<=a.tp3))
   return {state:"TP3_COMPLETE",active:false,terminal:true,action:"TAKE PROFIT • COMPLETE",reason:"TP3 reached on fresh broker quote.",rNow,updates:{...updates,hitTP1:true,hitTP2:true}};
  if(hit2)return {state:"TP2_HIT",active:true,terminal:false,action:"LOCK PROFIT / MANAGE RUNNER",reason:"TP2 reached. Protect remaining exposure; do not widen the original structural stop.",rNow,updates};
  if(hit1)return {state:"TP1_HIT",active:true,terminal:false,action:"TAKE PARTIAL / PROTECT",reason:"TP1 reached. A professional lifecycle protects profit instead of turning a winner into a full loss.",rNow,updates};
  if(rNow!==null&&rNow>=.5)return {state:"PROTECT",active:true,terminal:false,action:"PROTECT • BE REVIEW",reason:"Price has moved at least +0.5R in favor. Review break-even/structure protection without choking normal volatility.",rNow,updates};
  if(rNow!==null&&rNow<=-.65)return {state:"DANGER",active:true,terminal:false,action:"DANGER • WATCH INVALIDATION",reason:"Price is deep into the original risk budget. Do not add size; wait for the predefined structural invalidation or verified thesis flip.",rNow,updates};
  return {state:"ACTIVE",active:true,terminal:false,action:"HOLD PLAN",reason:"Original Trade Idea remains structurally valid. A newer WAIT status alone does not cancel an already observed entry.",rNow,updates};
 }
 function recovery(lastLoss,d){
  if(!lastLoss||lastLoss.terminalState!=="CUT_LOSS")return {state:"NONE",ready:false,reason:"No stored cut-loss event requiring recovery review."};
  const idea=currentIdea(d),p=d?.confirmation,st=String(d?.status||"");
  if(!idea||String(idea.id||"")===String(lastLoss.id||""))return {state:"WAIT_RECOVERY",ready:false,reason:"Old losing idea is retired. Wait for a genuinely new Trade Idea ID."};
  const grade=String(idea?.quality?.grade||"");
  const eligible=idea?.quality?.eligible===true&&["A++","A+","A"].includes(grade);
  if(d?.canEnter&&READY.has(st)&&p&&eligible)
   return {state:"RECOVERY_READY",ready:true,ideaId:idea.id,grade,reason:"A new A-grade Trade Idea is ENTRY READY. Recovery uses NORMAL risk only — never martingale or larger size because of the previous loss."};
  if(eligible)return {state:"RECOVERY_WATCH",ready:false,ideaId:idea.id,grade,reason:"A new A-grade thesis exists, but entry/retest is not ready. Do not revenge trade or chase."};
  return {state:"WAIT_RECOVERY",ready:false,ideaId:idea?.id||null,grade:grade||null,reason:"No new A-grade recovery setup. Stay flat until structure, location and risk geometry qualify again."};
 }
 root.GFAILifecycle={candidate,evaluate,recovery,isTerminal:s=>TERMINAL.has(String(s||""))};
})(typeof window!=="undefined"?window:globalThis);
