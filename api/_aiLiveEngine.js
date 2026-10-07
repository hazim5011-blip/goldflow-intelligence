// GF-AI LIVE ADAPTIVE v1.10:
// auditable multi-timeframe + momentum + structure/pattern + macro confluence.
// This is adaptive RULE-BASED reasoning, NOT trained ML, future prediction or execution.
// It deliberately does not import/call Market Study or legacy evaluateStudy().
import {context,publicFields,riskLevels,rnd,isGold,val,clamp} from "./_researchInputs.js";
import {impactForType} from "./_v8Impact.js";

const ids=["CPI","COREPCE","PAYEMS","UNRATE","FEDUPPER","US2Y","US10Y","REAL10Y","USDBROAD","NETLIQ"];
const TFSEC={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
const EXPIRY={M1:6,M5:5,M15:5,M30:4,H1:4,H4:3,D1:3};

function macroEvidence(macro,assetGold){
 const q=macro?.quality||null;
 const complete=!!q&&q.total===16&&q.available===16&&!q.errors?.length&&!q.stale?.length&&
   q.strictPrimaryReady!==false&&!q.secondaryMirror?.length;
 const cards=(macro?.cards||[]).filter(x=>ids.includes(x.id)).map(x=>{
  const impact=impactForType(x.id);
  return {id:x.id,display:x.display||null,period:x.date||null,source:x.source||null,status:x.status||"UNKNOWN",
   impactCategory:impact.impact,verifiedReleaseTimestamp:false,consensusSurprise:null,
   note:"Observation period is NOT a verified news publication time."};
 });
 const bias=assetGold?macro?.gold?.bias||"UNAVAILABLE":"USD_CROSS_ASSET_CONTEXT_ONLY";
 return {available:complete,assetSpecific:assetGold,scope:assetGold?"GOLD_MACRO":"USD_MACRO_CONTEXT_NOT_BTC_SPECIFIC",
  bias,score:assetGold&&Number.isFinite(Number(macro?.gold?.score))?Number(macro.gold.score):null,
  observations:cards,releaseTimeVerified:false,forecastSurpriseVerified:false,
  sourceHealth:q?.primarySourceHealth||"UNAVAILABLE",
  explanation:assetGold?
   "Gold macro is a derived context from official observations; cannot guarantee direction. Published data-period is not a release timestamp.":
   "Available US macro can be relevant to USD/risk appetite, but is NOT an authenticated BTC/crypto-specific fundamental, derivatives or on-chain feed."};
}
function macroDirection(e){return e.bias==="PRESSURE"?-1:e.bias==="SUPPORTIVE"?1:0}

function ema(c,n){
 if(!Array.isArray(c)||c.length<n)return null;
 const k=2/(n+1);let e=c.slice(0,n).reduce((s,x)=>s+x.c,0)/n;
 for(let i=n;i<c.length;i++)e=c[i].c*k+e*(1-k);
 return e;
}
function rsi(c,n=14){
 if(!Array.isArray(c)||c.length<n+1)return null;
 let gain=0,loss=0;
 for(let i=c.length-n;i<c.length;i++){
  const d=c[i].c-c[i-1].c;if(d>0)gain+=d;else loss-=d;
 }
 if(loss===0)return 100;
 const rs=(gain/n)/(loss/n);return 100-(100/(1+rs));
}
function localTrend(c,p){
 const e10=ema(c.slice(-80),10),e20=ema(c.slice(-80),20),prev20=ema(c.slice(-83,-3),20),last=c.at(-1);
 if(!last||!p||e10===null||e20===null||prev20===null)return {direction:0,e10,e20,slope:null};
 const slope=e20-prev20;
 if(last.c>e10&&e10>e20&&slope>.025*p)return {direction:1,e10,e20,slope};
 if(last.c<e10&&e10<e20&&slope<-.025*p)return {direction:-1,e10,e20,slope};
 return {direction:0,e10,e20,slope};
}
function closeLocation(bar,d){
 const range=bar.h-bar.l;if(!(range>0))return 0;
 return d===1?(bar.c-bar.l)/range:(bar.h-bar.c)/range;
}
function detectPattern(c,i,d,p){
 const bar=c[i],previous=c[i-1],prior8=c.slice(Math.max(0,i-8),i),prior3=c.slice(Math.max(0,i-3),i);
 if(!bar||!previous||prior8.length<5||!p)return null;
 const high8=Math.max(...prior8.map(b=>b.h)),low8=Math.min(...prior8.map(b=>b.l));
 const high3=Math.max(...prior3.map(b=>b.h)),low3=Math.min(...prior3.map(b=>b.l));
 const range=Math.max(0,bar.h-bar.l),body=Math.abs(bar.c-bar.o),dirBody=d*(bar.c-bar.o),loc=closeLocation(bar,d);
 const lowerWick=Math.min(bar.o,bar.c)-bar.l,upperWick=bar.h-Math.max(bar.o,bar.c);
 const breakout=d===1?bar.c>high8+.035*p:bar.c<low8-.035*p;
 const engulf=d===1?
  previous.c<previous.o&&bar.c>bar.o&&bar.c>=previous.o&&bar.o<=previous.c:
  previous.c>previous.o&&bar.c<bar.o&&bar.c<=previous.o&&bar.o>=previous.c;
 const displacement=dirBody>=.44*p&&loc>=.68&&(d===1?bar.c>previous.h:bar.c<previous.l);
 const rejection=d===1?
  lowerWick>=Math.max(body*1.25,.16*p)&&loc>=.60&&bar.c>previous.c:
  upperWick>=Math.max(body*1.25,.16*p)&&loc>=.60&&bar.c<previous.c;
 const microBreak=dirBody>=.25*p&&loc>=.62&&(d===1?bar.c>high3+.012*p:bar.c<low3-.012*p);
 if(breakout&&dirBody>.18*p)return {type:"CLOSED_IMPULSE_BREAKOUT",level:d===1?high8:low8,points:20,location:rnd(loc,3),bodyAtr:rnd(body/p,2),quality:"STRONG"};
 if(engulf&&dirBody>.16*p&&loc>=.58)return {type:"ENGULFING_MTF_CONFIRMATION",level:previous.c,points:18,location:rnd(loc,3),bodyAtr:rnd(body/p,2),quality:"STRONG"};
 if(displacement)return {type:"CLOSED_DISPLACEMENT",level:d===1?previous.h:previous.l,points:16,location:rnd(loc,3),bodyAtr:rnd(body/p,2),quality:"MEDIUM_STRONG"};
 if(rejection)return {type:"PULLBACK_REJECTION",level:(bar.o+bar.c)/2,points:15,location:rnd(loc,3),bodyAtr:rnd(body/p,2),quality:"MEDIUM"};
 if(microBreak)return {type:"MICRO_STRUCTURE_BREAK",level:d===1?high3:low3,points:13,location:rnd(loc,3),bodyAtr:rnd(body/p,2),quality:"MEDIUM"};
 return null;
}
function mtfContext(k,local){
 const h1=k.h1Trend,h4=k.h4Trend,l=local.direction;
 if(h1&&h4&&h1===-h4)return {direction:0,mode:"H1_H4_CONFLICT",score:0,entryEligible:false,hardConflict:true,
  reason:"H1 and H4 are opposite. Adaptive AI will not force a direction."};
 if(h1&&h4&&h1===h4)return {direction:h1,mode:"ALIGNED_H1_H4",score:30,entryEligible:true,hardConflict:false,
  reason:"H1 and H4 are aligned."};
 if(h1&&h4===0&&l!==-h1)return {direction:h1,mode:"H1_WITH_H4_NEUTRAL",score:22,entryEligible:l===h1,hardConflict:false,
  reason:"H1 is directional while H4 is neutral; local TF must agree before entry."};
 if(h4&&h1===0&&l!==-h4)return {direction:h4,mode:"H4_WITH_H1_NEUTRAL",score:22,entryEligible:l===h4,hardConflict:false,
  reason:"H4 is directional while H1 is neutral; local TF must agree before entry."};
 if(!h1&&!h4&&l)return {direction:l,mode:"LOCAL_EARLY_BIAS",score:12,entryEligible:false,hardConflict:false,
  reason:"Only the selected timeframe is directional; this is an early bias, not entry-ready."};
 if(h1&&!h4)return {direction:h1,mode:"H1_ONLY_WATCH",score:16,entryEligible:false,hardConflict:false,
  reason:"H1 is directional but H4/local confirmation is incomplete."};
 if(h4&&!h1)return {direction:h4,mode:"H4_ONLY_WATCH",score:16,entryEligible:false,hardConflict:false,
  reason:"H4 is directional but H1/local confirmation is incomplete."};
 return {direction:0,mode:"NO_MTF_DIRECTION",score:0,entryEligible:false,hardConflict:false,
  reason:"No stable multi-timeframe direction is available yet."};
}
function momentumScore(c,d,p,local){
 const x=rsi(c,14),last=c.at(-1),range=last?last.h-last.l:0;
 let score=0;const notes=[];
 if(local.direction===d){score+=12;notes.push("Selected TF EMA trend agrees +12")}
 else if(local.direction===0){score+=4;notes.push("Selected TF EMA trend neutral +4")}
 else{score-=10;notes.push("Selected TF EMA trend opposes -10")}
 if(x!==null){
  if(d===1&&x>=50&&x<=72||d===-1&&x<=50&&x>=28){score+=8;notes.push("RSI supports direction +8")}
  else if(d===1&&x>78||d===-1&&x<22){score-=6;notes.push("RSI overextended -6")}
  else{score+=2;notes.push("RSI mixed +2")}
 }
 if(last&&local.e20!==null){
  if(d===1&&last.c>local.e20||d===-1&&last.c<local.e20){score+=6;notes.push("Price on correct EMA20 side +6")}
  else notes.push("Price not on preferred EMA20 side +0");
 }
 if(p&&range>=.18*p&&range<=2.4*p){score+=4;notes.push("Current volatility usable +4")}
 return {score,rsi:x===null?null:rnd(x,1),notes};
}
function nextCloseUTC(latest,args){
 const sec=TFSEC[args.tf]||900;
 return new Date((latest.t-args.offsetSeconds+2*sec)*1000).toISOString();
}
function adaptivePlan(c,trigger,d,p,fullGoldEvidence,macroDir){
 const base=c.slice(Math.max(0,trigger.index-14),trigger.index);
 if(!base.length)return null;
 const origin=d===1?Math.min(...base.map(x=>x.l)):Math.max(...base.map(x=>x.h));
 const impulse=d*(trigger.bar.c-origin);
 const strong=Boolean(fullGoldEvidence&&macroDir===d);
 const targetScale=strong?[1.2,2.1,3.0]:[1,1.75,2.55];
 let entryLow=null,entryHigh=null,stop=null,method=null;
 if(["CLOSED_IMPULSE_BREAKOUT","ENGULFING_MTF_CONFIRMATION","CLOSED_DISPLACEMENT"].includes(trigger.type)&&impulse>=.45*p&&impulse<=10*p){
  const a=trigger.bar.c-d*.618*impulse,b=trigger.bar.c-d*.382*impulse;
  entryLow=Math.min(a,b);entryHigh=Math.max(a,b);
  stop=d===1?Math.min(origin,trigger.bar.l)-.18*p:Math.max(origin,trigger.bar.h)+.18*p;
  method="AI_ADAPTIVE_FIB_0382_TO_0618";
 }else{
  const anchor=Number.isFinite(Number(trigger.level))?Number(trigger.level):(trigger.bar.o+trigger.bar.c)/2;
  entryLow=anchor-.18*p;entryHigh=anchor+.18*p;
  const swingLow=Math.min(...base.slice(-10).map(x=>x.l),trigger.bar.l);
  const swingHigh=Math.max(...base.slice(-10).map(x=>x.h),trigger.bar.h);
  stop=d===1?swingLow-.16*p:swingHigh+.16*p;
  method="AI_ADAPTIVE_STRUCTURE_RETEST";
 }
 const mid=(entryLow+entryHigh)/2,risk=d*(mid-stop);
 if(!(risk>.12*p&&risk<12*p))return null;
 const plan=riskLevels({side:d===1?"BUY":"SELL",entryLow,entryHigh,stop,targets:targetScale.map(t=>mid+d*risk*t)});
 return plan?{...plan,entryMethod:method,impulseAtr:rnd(impulse/p,2)}:null;
}
function response(status,k,e,extra={}){
 const expiry=EXPIRY[k?.tf]||4;
 const aiPolicy={
  entryPolicy:"ADAPTIVE_CONFLUENCE_V1",
  requiresH1H4Alignment:false,
  h1H4Rule:"ALIGNED preferred; one neutral is allowed only when selected TF agrees. Opposing H1/H4 is a hard veto.",
  acceptedClosedPatterns:["CLOSED_IMPULSE_BREAKOUT","ENGULFING_MTF_CONFIRMATION","CLOSED_DISPLACEMENT","PULLBACK_REJECTION","MICRO_STRUCTURE_BREAK"],
  triggerLookbackClosedBars:6,
  entryRetest:"ADAPTIVE_FIB_OR_STRUCTURE_RETEST",
  entryExpiryClosedBars:expiry,
  scoreThresholdAligned:68,
  scoreThresholdPartialMTF:74,
  hardVetoes:["STALE_BROKER_DATA","OPPOSING_H1_H4","VERIFIED_GOLD_MACRO_CONFLICT","STRUCTURE_INVALIDATION"],
  persistent24hSignalArchive:false,
  note:"Adaptive score is an auditable confluence score, NOT win probability. The endpoint still reports current state only and does not prove no transient setup appeared earlier in the last 24 hours."
 };
 return {ok:true,engine:"GF_AI_LIVE_ADAPTIVE_V3",mode:"ai",modeProfile:"ADAPTIVE_MACRO_MTF_MOMENTUM_STRUCTURE",
  modelType:"AUDITABLE_ADAPTIVE_RULES_NOT_TRAINED_ML",marketResearchOnly:true,canEnter:false,isExecutedTrade:false,
  source:"VANTAGE_MT5",...publicFields(k),macroBias:e.bias,macroScore:e.score,macroEvidence:e,aiPolicy,
  caution:"AI score is contextual confluence, not guaranteed direction, news surprise or calibrated win probability.",
  status,...extra};
}
export function evaluateAILive(args={}){
 const k=context(args),gold=isGold(args.symbol),e=macroEvidence(args.macro,gold);
 if(!k.ok)return response(k.status,k,e,{reason:k.reason});
 const fullGoldEvidence=gold&&e.available;
 const scope=fullGoldEvidence?"VERIFIED_GOLD_MACRO_PLUS_TECHNICAL":"TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE";
 const c=k.c,p=k.atr,latest=c.at(-1),local=localTrend(c,p),mtf=mtfContext(k,local),macroDir=fullGoldEvidence?macroDirection(e):0;
 if(mtf.hardConflict)return response("AI_WAIT_MTF_CONFLICT",k,e,{
  researchScope:scope,direction:0,reason:mtf.reason,
  analysis:{mtfMode:mtf.mode,h1Direction:k.h1Trend,h4Direction:k.h4Trend,localDirection:local.direction,score:0,entryEligible:false,
   blockers:["OPPOSING_H1_H4"]}});
 if(!mtf.direction)return response("AI_WAIT_DIRECTION",k,e,{
  researchScope:scope,direction:0,reason:mtf.reason,nextCandleCloseUTC:nextCloseUTC(latest,args),
  analysis:{mtfMode:mtf.mode,h1Direction:k.h1Trend,h4Direction:k.h4Trend,localDirection:local.direction,score:0,entryEligible:false,
   blockers:["NO_STABLE_DIRECTION"]}});
 const d=mtf.direction,n=c.length,mom=momentumScore(c,d,p,local),macroConflict=Boolean(macroDir&&macroDir!==d);
 let macroPoints=fullGoldEvidence?(macroDir===d?10:macroDir===0?3:-20):0;
 const baseScore=clamp(mtf.score+mom.score+macroPoints,0,100);
 const baseReasons=[
  mtf.reason+" +"+mtf.score,
  ...mom.notes,
  fullGoldEvidence?(macroDir===d?"Verified Gold macro agrees +10":macroDir===0?"Verified Gold macro neutral +3":"Verified Gold macro conflicts -20"):"Macro incomplete/unavailable: technical-only +0"
 ];
 let trigger=null;
 for(let i=n-1;i>=Math.max(n-6,10);i--){
  const v=detectPattern(c,i,d,p);if(v){trigger={...v,index:i,bar:c[i]};break}
 }
 if(!trigger){
  const watchStatus=macroConflict?(d===1?"AI_BUY_BLOCKED_MACRO":"AI_SELL_BLOCKED_MACRO"):(d===1?"AI_BUY_WATCH":"AI_SELL_WATCH");
  return response(watchStatus,k,e,{direction:d,researchScope:scope,
   reason:macroConflict?
    "Technical direction exists, but verified Gold macro is opposite. Entry is blocked until the conflict clears and a fresh closed trigger appears.":
    "Adaptive directional bias exists, but no accepted fully CLOSED trigger appeared within the last six candles. AI keeps the direction on WATCH instead of returning a meaningless blank state.",
   nextCandleCloseUTC:nextCloseUTC(latest,args),
   analysis:{mtfMode:mtf.mode,h1Direction:k.h1Trend,h4Direction:k.h4Trend,localDirection:local.direction,rsi:mom.rsi,
    baseScore:Math.round(baseScore),score:Math.round(baseScore),entryEligible:false,trigger:null,scoreBreakdown:baseReasons,
    blockers:[macroConflict?"VERIFIED_GOLD_MACRO_CONFLICT":"WAIT_CLOSED_TRIGGER"].filter(Boolean),
    acceptedTriggers:["breakout","engulfing","displacement","pullback rejection","micro structure break"]}});
 }
 const recency=n-1-trigger.index,recencyPoints=Math.max(0,6-recency);
 const setupScore=clamp(baseScore+trigger.points+recencyPoints,0,100);
 const plan=adaptivePlan(c,trigger,d,p,fullGoldEvidence,macroDir);
 if(!plan)return response(d===1?"AI_BUY_WATCH":"AI_SELL_WATCH",k,e,{
  direction:d,researchScope:scope,reason:"A closed trigger exists, but adaptive risk/retest geometry is not valid enough for an entry plan.",
  analysis:{mtfMode:mtf.mode,rsi:mom.rsi,score:Math.round(setupScore),entryEligible:false,trigger:trigger.type,
   triggerQuality:trigger.quality,scoreBreakdown:[...baseReasons,trigger.type+" +"+trigger.points,"Trigger recency +"+recencyPoints],
   blockers:["RISK_GEOMETRY_INVALID"]}});
 const expiry=EXPIRY[args.tf]||4;
 const explain={
  headline:(gold?"GOLD":String(args.symbol||"SYMBOL"))+" "+(d===1?"BUY":"SELL")+" adaptive confluence scenario",
  drivers:[fullGoldEvidence?"Verified derived Gold Macro Regime: "+e.bias+" (score "+e.score+"/100; NOT win probability)":
    "Fundamental unavailable/insufficient for "+args.symbol+"; using Vantage technical evidence only. No fabricated fundamental.",
   "MTF mode: "+mtf.mode+" • H1 "+(k.h1Trend===1?"BULLISH":k.h1Trend===-1?"BEARISH":"NEUTRAL")+" • H4 "+(k.h4Trend===1?"BULLISH":k.h4Trend===-1?"BEARISH":"NEUTRAL"),
   "Selected TF trend: "+(local.direction===1?"BULLISH":local.direction===-1?"BEARISH":"NEUTRAL")+" • RSI14 "+(mom.rsi??"N/A"),
   "Closed trigger: "+trigger.type+" • quality "+trigger.quality,
   "Setup confluence score: "+Math.round(setupScore)+"/100 (NOT win probability)",
   "Price confirmation/retest is still required before ENTRY READY."],
  releaseTimingVerified:false,newsSurpriseVerified:false,
  basis:plan.entryMethod==="AI_ADAPTIVE_FIB_0382_TO_0618"?
    "Adaptive impulse Fibonacci retracement + pre-trigger structural invalidation":
    "Adaptive structure/rejection retest + swing invalidation",
  researchScope:scope};
 const signalClose=trigger.bar.t-args.offsetSeconds+(TFSEC[args.tf]||900);
 const conf={...plan,direction:d,confirmationType:trigger.type,confirmationCloseUTC:new Date(signalClose*1000).toISOString(),
  signalCandleTime:trigger.bar.t,targetMethod:"AI_ADAPTIVE_RISK_SCALED",score:Math.round(setupScore),expiresAfterClosedBars:expiry,
  verifiedForecastSurprise:false,explanation:explain.drivers};
 delete conf.impulseAtr;
 const elapsed=n-1-trigger.index,price=d===1?k.ask:k.bid;
 const inside=price>=plan.entryLow&&price<=plan.entryHigh;
 const liveScore=clamp(setupScore+(inside?8:0),0,100);
 const threshold=mtf.mode==="ALIGNED_H1_H4"?68:74;
 const entryEligible=mtf.entryEligible&&!macroConflict&&liveScore>=threshold;
 const blockers=[];
 if(!mtf.entryEligible)blockers.push("MTF_ENTRY_CONTEXT_INCOMPLETE");
 if(macroConflict)blockers.push("VERIFIED_GOLD_MACRO_CONFLICT");
 if(liveScore<threshold)blockers.push("CONFLUENCE_SCORE_BELOW_"+threshold);
 if(!inside)blockers.push("WAIT_ENTRY_RETEST");
 const overlay={direction:d,researchScope:scope,fundamentalApplied:fullGoldEvidence,confirmation:conf,explanation:explain,
  entryQuote:price,entryQuoteSide:d===1?"ASK":"BID",elapsedClosedBars:elapsed,
  analysis:{mtfMode:mtf.mode,h1Direction:k.h1Trend,h4Direction:k.h4Trend,localDirection:local.direction,rsi:mom.rsi,
   baseScore:Math.round(baseScore),setupScore:Math.round(setupScore),liveScore:Math.round(liveScore),entryThreshold:threshold,
   entryEligible,trigger:trigger.type,triggerQuality:trigger.quality,triggerAgeClosedBars:recency,
   scoreBreakdown:[...baseReasons,trigger.type+" +"+trigger.points,"Trigger recency +"+recencyPoints,inside?"Price inside retest +8":"Price outside retest +0"],
   blockers}};
 const observed=(Array.isArray(args.bars)?args.bars:[]).map(x=>({t:val(x.t),h:val(x.h),l:val(x.l)}))
  .filter(x=>x.t!==null&&x.h!==null&&x.l!==null&&x.t>trigger.bar.t&&x.t-args.offsetSeconds<=k.nowSec);
 const stopTouched=observed.some(x=>d===1?x.l<=plan.invalidation:x.h>=plan.invalidation);
 if(stopTouched||d*(price-plan.invalidation)<=0)return response("AI_INVALIDATED",k,e,{
  ...overlay,reason:"Post-confirmation broker wick/quote breached the original adaptive structure invalidation."});
 const targetTouched=observed.some(x=>d===1?x.h>=plan.tp1:x.l<=plan.tp1);
 if(targetTouched)return response("AI_COMPLETED_STUDY",k,e,{...overlay,reason:"TP1 touched since confirmation; the old AI setup is retired and never reactivated."});
 if(elapsed>expiry)return response("AI_EXPIRED",k,e,{...overlay,reason:"Adaptive entry window expired after "+expiry+" fully closed candles; wait for a new trigger."});
 const chased=d===1?price>plan.entryHigh+.65*p:price<plan.entryLow-.65*p;
 if(chased)return response("AI_MISSED_ENTRY",k,e,{...overlay,reason:"Price moved beyond adaptive retest tolerance; no chasing. Wait for a new trigger."});
 if(macroConflict)return response(d===1?"AI_BUY_BLOCKED_MACRO":"AI_SELL_BLOCKED_MACRO",k,e,{
  ...overlay,reason:"Technical "+(d===1?"BUY":"SELL")+" setup exists, but verified Gold macro is opposite. The setup remains visible for study but entry is blocked."});
 if(!entryEligible){
  return response(d===1?"AI_BUY_WATCH":"AI_SELL_WATCH",k,e,{...overlay,
   reason:inside?
    "Price is in the adaptive retest zone, but the confluence threshold/context is not strong enough for ENTRY READY.":
    "Adaptive "+(d===1?"BUY":"SELL")+" setup is confirmed; wait for price to enter the retest zone and for the live confluence threshold to be satisfied."});
 }
 return response(inside?(d===1?"AI_BUY_READY":"AI_SELL_READY"):d===1?"AI_BUY_CONFIRMED":"AI_SELL_CONFIRMED",k,e,{
  ...overlay,canEnter:inside&&entryEligible,entryState:inside?"AI_ADAPTIVE_RETEST_VALIDATED":"WAIT_ADAPTIVE_RETEST",
  reason:inside?
   "Fresh Vantage broker quote entered the adaptive retest zone with sufficient MTF/momentum/trigger confluence. "+(fullGoldEvidence?"Verified Gold macro does not oppose the setup.":"Technical-only mode is disclosed because full Gold macro evidence is unavailable."):
   "AI direction is confirmed with sufficient confluence; wait for the adaptive retest zone. Do not chase."});
}
