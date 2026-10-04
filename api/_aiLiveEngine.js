// GF-AI LIVE: independent GOLD macro/news + multi-timeframe + pattern confluence.
// This is auditable conditional reasoning, NOT ML training, future release prediction or execution.
// Deliberately DOES NOT import or call Market Study or legacy evaluateStudy().
import {context,publicFields,riskLevels,rnd,isGold,val} from "./_researchInputs.js";
import {impactForType} from "./_v8Impact.js";
const ids=["CPI","COREPCE","PAYEMS","UNRATE","FEDUPPER","US2Y","US10Y","REAL10Y","USDBROAD","NETLIQ"];
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
function pattern(c,i,d,p){
 const bar=c[i],prior=c.slice(Math.max(0,i-9),i),previous=c[i-1];
 if(prior.length<8||!previous)return null;
 const high=Math.max(...prior.map(b=>b.h)),low=Math.min(...prior.map(b=>b.l));
 const range=bar.h-bar.l,body=Math.abs(bar.c-bar.o);
 const location=range>0?d===1?(bar.c-bar.l)/range:(bar.h-bar.c)/range:0;
 const breakout=d===1?bar.c>high+.045*p:bar.c<low-.045*p;
 const engulf=d===1?
  previous.c<previous.o&&bar.c>bar.o&&bar.c>=previous.o&&bar.o<=previous.c:
  previous.c>previous.o&&bar.c<bar.o&&bar.c<=previous.o&&bar.o>=previous.c;
 const valid=(d*(bar.c-bar.o)>0)&&(body>=.32*p)&&(location>=.67)&&(breakout||engulf);
 if(!valid)return null;
 return {type:breakout?"CLOSED_IMPULSE_BREAKOUT":"ENGULFING_MTF_CONFIRMATION",level:breakout?(d===1?high:low):previous.c,
  location:rnd(location,3),bodyAtr:rnd(body/p,2)};
}
function macroDirection(e){
 return e.bias==="PRESSURE"?-1:e.bias==="SUPPORTIVE"?1:0;
}
function response(status,k,e,extra={}){
 return {ok:true,engine:"GF_AI_LIVE_MACRO_MTF_V2",mode:"ai",modeProfile:"MACRO_NEWS_PATTERN_CONFLUENCE",
  modelType:"AUDITABLE_MULTI_FACTOR_RULES_NOT_TRAINED_ML",marketResearchOnly:true,canEnter:false,isExecutedTrade:false,
  source:"VANTAGE_MT5",...publicFields(k),macroBias:e.bias,macroScore:e.score,macroEvidence:e,
  caution:"Macro score is contextual, not guaranteed Gold direction, news surprise or calibrated win probability.",
  status,...extra};
}
export function evaluateAILive(args={}){
 const k=context(args),gold=isGold(args.symbol),e=macroEvidence(args.macro,gold);
 if(!k.ok)return response(k.status,k,e,{reason:k.reason});
 if(!e.available)return response("AI_WAIT_VERIFIED_MACRO",k,e,{
  reason:"Full independently validated 16/16 Macro Regime is required by AI Live. No fabricated observations.",
  direction:0,confirmation:null});
 if(!gold)return response("AI_ASSET_FUNDAMENTAL_UNAVAILABLE",k,e,{
  reason:"No verified "+String(args.symbol||"")+"-specific fundamental/derivatives/on-chain feed. US macro alone cannot authorise an AI LIVE trade.",
  technicalScenario:k.h1Trend===k.h4Trend?k.h1Trend:0,confirmation:null});
 const macroDir=macroDirection(e);
 if(!macroDir)return response("AI_WAIT_MACRO_CONFLUENCE",k,e,{reason:"Gold Macro Regime is MIXED/neutral; no directional macro confirmation.",direction:0});
 if(k.h1Trend!==macroDir||k.h4Trend!==macroDir){
  return response("AI_WAIT_MTF_ALIGNMENT",k,e,{direction:macroDir,
   reason:"Derived Gold macro bias and BOTH closed-candle H1/H4 structures must align. A conflicting timeframe vetoes new entry.",
   analysis:{macroDirection:macroDir,h1Direction:k.h1Trend,h4Direction:k.h4Trend}});
 }
 const d=macroDir,c=k.c,p=k.atr,latest=c.at(-1),n=c.length;
 let trigger=null;
 for(let i=n-1;i>=Math.max(n-3,10);i--){
  const v=pattern(c,i,d,p);if(v){trigger={...v,index:i,bar:c[i]};break}
 }
 if(!trigger)return response("AI_WAIT_PATTERN",k,e,{direction:d,
  reason:"Macro/H1/H4 align, but no new fully CLOSED MTF impulse breakout or validated engulfing within the last three candles.",
  nextCandleCloseUTC:new Date((latest.t-args.offsetSeconds+2*({"M1":60,"M5":300,"M15":900,"M30":1800,"H1":3600,"H4":14400,"D1":86400}[args.tf]||900))*1000).toISOString()});
 // AI entry: independent impulse Fibonacci 38.2%-61.8% retracement, NOT legacy ATR band
 // and NOT Market Study pivot/reaction zone.
 const base=c.slice(Math.max(0,trigger.index-12),trigger.index);
 const origin=d===1?Math.min(...base.map(x=>x.l)):Math.max(...base.map(x=>x.h));
 const impulse=d*(trigger.bar.c-origin);
 if(!(impulse>=.70*p&&impulse<=9*p))return response("AI_WAIT_PATTERN",k,e,{
  reason:"Closed impulse size is outside the ATR reliability window."});
 const retraceA=trigger.bar.c-d*.618*impulse,retraceB=trigger.bar.c-d*.382*impulse;
 const stop=d===1?Math.min(origin,trigger.bar.l)-.18*p:Math.max(origin,trigger.bar.h)+.18*p;
 const entryLow=Math.min(retraceA,retraceB),entryHigh=Math.max(retraceA,retraceB);
 const mid=(entryLow+entryHigh)/2,risk=d*(mid-stop);
 const strong=Boolean(k.h1Trend===d&&k.h4Trend===d&&macroDir===d);
 const targetScale=strong?[1.25,2.2,3.2]:[1,1.75,2.6];
 const plan=riskLevels({side:d===1?"BUY":"SELL",entryLow,entryHigh,stop,
  targets:targetScale.map(t=>mid+d*risk*t)});
 if(!plan)return response("AI_WAIT_PATTERN",k,e,{reason:"Independent Fibonacci/structure risk geometry failed validation."});
 const explain={
  headline:"GOLD "+(d===1?"bullish":"bearish")+" conditional macro/MTF scenario",
  drivers:["Derived Macro Regime: "+e.bias+" (score "+e.score+"/100; NOT win probability)",
   "H1 trend: "+(k.h1Trend===1?"BULLISH":"BEARISH"),
   "H4 trend: "+(k.h4Trend===1?"BULLISH":"BEARISH"),
   "Last closed pattern: "+trigger.type,
   "Price confirmation is required; official CPI/NFP observation dates are NOT intraday release times."],
  releaseTimingVerified:false,newsSurpriseVerified:false,
  basis:"Independent impulse Fibonacci retracement + pre-trigger structural invalidation"};
 const signalClose=trigger.bar.t-args.offsetSeconds+({"M1":60,"M5":300,"M15":900,"M30":1800,"H1":3600,"H4":14400,"D1":86400}[args.tf]||900);
 const conf={...plan,direction:d,confirmationType:trigger.type,confirmationCloseUTC:new Date(signalClose*1000).toISOString(),
  signalCandleTime:trigger.bar.t,entryMethod:"AI_IMPULSE_FIB_0382_TO_0618",targetMethod:"AI_MACRO_MTF_RISK_SCALED",
  score:Math.min(90,50+10+8+8+Math.round(10*trigger.location)),expiresAfterClosedBars:2,
  verifiedForecastSurprise:false,explanation:explain.drivers};
 const elapsed=n-1-trigger.index,price=d===1?k.ask:k.bid;
 const overlay={direction:d,confirmation:conf,explanation:explain,entryQuote:price,entryQuoteSide:d===1?"ASK":"BID",
  elapsedClosedBars:elapsed};
 // OHLC can invalidate this idea, but it cannot prove fill/order inside a bar.
 const observed=(Array.isArray(args.bars)?args.bars:[]).map(x=>({t:val(x.t),h:val(x.h),l:val(x.l)}))
  .filter(x=>x.t!==null&&x.h!==null&&x.l!==null&&x.t>trigger.bar.t&&x.t-args.offsetSeconds<=k.nowSec);
 const stopTouched=observed.some(x=>d===1?x.l<=plan.invalidation:x.h>=plan.invalidation);
 if(stopTouched||d*(price-plan.invalidation)<=0)return response("AI_INVALIDATED",k,e,{
  ...overlay,reason:"Post-confirmation broker wick/quote breached original AI structure invalidation."});
 const targetTouched=observed.some(x=>d===1?x.h>=plan.tp1:x.l<=plan.tp1);
 if(targetTouched)return response("AI_COMPLETED_STUDY",k,e,{...overlay,reason:"TP1 touched since confirmation; never reactivate old idea."});
 if(elapsed>2)return response("AI_EXPIRED",k,e,{...overlay,reason:"AI retracement not reached within two fully closed trigger candles."});
 const inside=price>=plan.entryLow&&price<=plan.entryHigh;
 const chased=d===1?price>plan.entryHigh+.50*p:price<plan.entryLow-.50*p;
 return response(inside?(d===1?"AI_BUY_READY":"AI_SELL_READY"):chased?"AI_MISSED_ENTRY":d===1?"AI_BUY_CONFIRMED":"AI_SELL_CONFIRMED",k,e,{
  ...overlay,canEnter:inside,entryState:inside?"AI_FIB_RETRACE_VALIDATED":chased?"NO_CHASE":"WAIT_FIB_RETEST",
  reason:inside?"Fresh Vantage broker quote entered independently derived AI retracement after CLOSED macro/MTF/pattern confirmation.":
   chased?"Price advanced beyond AI retracement tolerance; no chasing.":"AI direction confirmed; wait for 38.2%-61.8% impulse pullback."});
}
