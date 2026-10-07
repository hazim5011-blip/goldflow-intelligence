// GF-AI LIVE ANALYST v1.20 • MARKET INTELLIGENCE
// Multi-engine market reader: market structure, BOS/CHOCH, liquidity sweeps,
// SND/SNR/SBR/RBS, order blocks, FVG, chart/candle patterns, MTF and macro.
// Fibonacci is OPTIONAL overlap evidence only; it is never the primary brain.
// Auditable rule-based market research, NOT trained ML and NOT broker execution.
import {context,publicFields,rnd,isGold,val,clamp} from "./_researchInputs.js";
import {impactForType} from "./_v8Impact.js";
import {readMarketBrain,buildMarketPlan} from "./_aiMarketBrain.js";

const ids=["CPI","COREPCE","PAYEMS","UNRATE","FEDUPPER","US2Y","US10Y","REAL10Y","USDBROAD","NETLIQ"];
const TFSEC={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
const EXPIRY={M1:7,M5:6,M15:5,M30:5,H1:4,H4:3,D1:3};
const side=d=>d===1?"BUY":d===-1?"SELL":"NEUTRAL";

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
   "Gold macro is derived context from verified observations. It modifies conviction/risk but does not replace price structure.":
   "Available US macro is cross-asset context only; no fake asset-specific fundamental is invented."};
}
function macroDirection(e){return e.bias==="PRESSURE"?-1:e.bias==="SUPPORTIVE"?1:0}
function compactBrain(b){
 if(!b?.ok)return {ok:false,reason:b?.reason||"UNAVAILABLE"};
 return {ok:true,atr:b.atr,structure:{bias:b.structure.bias,highClass:b.structure.highClass,lowClass:b.structure.lowClass,
   lastHigh:b.structure.lastHigh?{price:rnd(b.structure.lastHigh.price),time:b.structure.lastHigh.time}:null,
   lastLow:b.structure.lastLow?{price:rnd(b.structure.lastLow.price),time:b.structure.lastLow.time}:null},
  breakEvent:b.breakEvent,liquidity:b.liquidity,zones:b.zones,chartPattern:b.chartPattern,candlePattern:b.candlePattern,
  regime:b.regime,buy:{score:b.buy.score,evidence:b.buy.evidence,blockers:b.buy.blockers},
  sell:{score:b.sell.score,evidence:b.sell.evidence,blockers:b.sell.blockers}};
}
function mtfScores(k,s,h1,h4,e,fullGold){
 let buy=.54*s.buy.score+.24*h1.buy.score+.14*h4.buy.score;
 let sell=.54*s.sell.score+.24*h1.sell.score+.14*h4.sell.score;
 const notes=[];
 const trend=(d,label,w)=>{if(d===1){buy+=w;notes.push(label+" bullish +"+w+" BUY")}else if(d===-1){sell+=w;notes.push(label+" bearish +"+w+" SELL")}};
 trend(k.h1Trend,"H1 trend",5);trend(k.h4Trend,"H4 trend",7);
 if(h1.breakEvent?.direction===1){buy+=5;notes.push("H1 "+h1.breakEvent.type+" +5 BUY")}
 if(h1.breakEvent?.direction===-1){sell+=5;notes.push("H1 "+h1.breakEvent.type+" +5 SELL")}
 if(h4.breakEvent?.direction===1){buy+=6;notes.push("H4 "+h4.breakEvent.type+" +6 BUY")}
 if(h4.breakEvent?.direction===-1){sell+=6;notes.push("H4 "+h4.breakEvent.type+" +6 SELL")}
 const md=fullGold?macroDirection(e):0;
 if(md===1){buy+=8;sell-=3;notes.push("Verified Gold macro supportive +8 BUY / -3 SELL")}
 if(md===-1){sell+=8;buy-=3;notes.push("Verified Gold macro pressure +8 SELL / -3 BUY")}
 return {buy:clamp(buy,0,100),sell:clamp(sell,0,100),macroDirection:md,notes};
}
function chooseDirection(scores){
 const gap=Math.abs(scores.buy-scores.sell),max=Math.max(scores.buy,scores.sell);
 if(max<25||gap<6)return {direction:0,gap:rnd(gap,1),score:rnd(max,1),reason:max<25?"INSUFFICIENT_EVIDENCE":"BUY_SELL_EVIDENCE_TOO_CLOSE"};
 const d=scores.buy>scores.sell?1:-1;
 return {direction:d,gap:rnd(gap,1),score:rnd(d===1?scores.buy:scores.sell,1),opposite:rnd(d===1?scores.sell:scores.buy,1),reason:"DOMINANT_MULTI_ENGINE_EVIDENCE"};
}
function thesis(brain,d,h1,h4){
 const br=brain.breakEvent,liq=brain.liquidity?.sweep,cp=brain.chartPattern;
 if(br?.direction===d&&br.type==="CHOCH")return {type:"REVERSAL_CHOCH",quality:"HIGH",reason:"Selected TF CHOCH changed recent swing structure."};
 if(liq?.direction===d&&cp?.direction===d)return {type:"LIQUIDITY_PATTERN_REVERSAL",quality:"HIGH",reason:"Liquidity sweep and chart pattern point the same way."};
 if(br?.direction===d&&br.type==="BOS")return {type:"BOS_CONTINUATION_RETEST",quality:"HIGH",reason:"Selected TF BOS supports continuation/retest."};
 if(cp?.direction===d&&cp.state==="CONFIRMED")return {type:"CHART_PATTERN_BREAK_RETEST",quality:"MEDIUM_HIGH",reason:cp.type+" has confirmed through its neckline/structure."};
 if(liq?.direction===d)return {type:"LIQUIDITY_SWEEP_REVERSAL",quality:"MEDIUM_HIGH",reason:liq.type+" rejected external liquidity."};
 if(brain.structure.bias===d&&(h1.structure.bias===d||h4.structure.bias===d))return {type:"MTF_TREND_CONTINUATION",quality:"MEDIUM",reason:"Selected TF structure and at least one HTF structure agree."};
 return {type:"DIRECTIONAL_MARKET_WATCH",quality:"EARLY",reason:"Evidence has a directional edge but no dominant structural trigger yet."};
}
function triggerFor(brain,d){
 const candidates=[];
 if(brain.breakEvent?.direction===d)candidates.push({rank:100,type:brain.breakEvent.type,index:brain.breakEvent.index,time:brain.breakEvent.time,level:brain.breakEvent.level});
 if(brain.liquidity?.sweep?.direction===d)candidates.push({rank:94,type:brain.liquidity.sweep.type,index:brain.liquidity.sweep.index,time:brain.liquidity.sweep.time,level:brain.liquidity.sweep.level});
 if(brain.chartPattern?.direction===d&&brain.chartPattern.state==="CONFIRMED")candidates.push({rank:90,type:brain.chartPattern.type+"_CONFIRMED",index:null,time:null,level:brain.chartPattern.neckline});
 if(brain.candlePattern?.direction===d)candidates.push({rank:72,type:brain.candlePattern.type,index:null,time:null,level:null});
 candidates.sort((a,b)=>b.rank-a.rank);return candidates[0]||null;
}
function contradiction(k,s,h1,h4,d){
 const flags=[];
 if(k.h1Trend===-d&&k.h4Trend===-d)flags.push("H1_H4_TREND_BOTH_OPPOSE");
 if(h1.structure.bias===-d&&h4.structure.bias===-d)flags.push("H1_H4_STRUCTURE_BOTH_OPPOSE");
 if(h4.breakEvent?.direction===-d&&h4.breakEvent?.type==="CHOCH")flags.push("H4_CHOCH_OPPOSES");
 if(s.breakEvent?.direction===-d&&s.breakEvent?.type==="CHOCH")flags.push("SELECTED_TF_CHOCH_OPPOSES");
 return flags;
}
function reversalException(s,h1,d){
 const sweep=s.liquidity?.sweep?.direction===d,choch=s.breakEvent?.direction===d&&s.breakEvent.type==="CHOCH";
 const h1Turn=h1.breakEvent?.direction===d&&["CHOCH","BOS"].includes(h1.breakEvent.type);
 return {strong:Boolean(choch&&sweep&&h1Turn),choch,sweep,h1Turn};
}
function thresholds(thesisType,macroHeadwind,counterTrend){
 let confirm=55,ready=66;
 if(/REVERSAL/.test(thesisType)){confirm=62;ready=74}
 if(counterTrend){confirm+=5;ready+=7}
 if(macroHeadwind){confirm+=4;ready+=6}
 return {confirm:Math.min(confirm,82),ready:Math.min(ready,90)};
}
function observedSince(args,k,t){
 return (Array.isArray(args.bars)?args.bars:[]).map(x=>({t:val(x.t),h:val(x.h),l:val(x.l)}))
  .filter(x=>x.t!==null&&x.h!==null&&x.l!==null&&x.t>t&&x.t-args.offsetSeconds<=k.nowSec);
}
function response(status,k,e,extra={}){
 const aiPolicy={version:"1.20",entryPolicy:"MARKET_INTELLIGENCE_MULTI_ENGINE",
  primaryEngines:["MARKET_STRUCTURE_HH_HL_LH_LL","BOS_CHOCH","LIQUIDITY_SWEEP_EQUAL_HIGHS_LOWS","SND_SNR_SBR_RBS",
   "ORDER_BLOCK","FVG","CHART_PATTERNS","CANDLE_FORENSICS","MTF_CONTEXT","MACRO_CONTEXT"],
  chartPatterns:["DOUBLE_TOP_BOTTOM","HEAD_AND_SHOULDERS","INVERSE_HEAD_AND_SHOULDERS","ASCENDING_DESCENDING_TRIANGLE"],
  entryModels:["BOS_RBS_SBR_RETEST","CHOCH_RETEST","LIQUIDITY_SWEEP_ZONE_RETEST","PATTERN_NECKLINE_RETEST","ORDER_BLOCK_RETEST","FVG_REBALANCE","SUPPLY_DEMAND_REACTION"],
  fibonacciRole:"OPTIONAL_OVERLAP_BONUS_ONLY_NOT_REQUIRED",
  scoreMeaning:"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY",persistent24hSignalArchive:false,
  hardSafety:["STALE_BROKER_DATA","STRUCTURE_INVALIDATION","TARGET_ALREADY_REACHED","AMBIGUOUS_OHLC_PATH"],
  note:"AI reads market evidence first and chooses the entry model that matches the current setup. It never forces every setup into Fibonacci."};
 return {ok:true,engine:"GF_AI_MARKET_INTELLIGENCE_V4",mode:"ai",modeProfile:"STRUCTURE_LIQUIDITY_PATTERN_MTF_MACRO",
  modelType:"AUDITABLE_MARKET_INTELLIGENCE_RULES_NOT_TRAINED_ML",marketResearchOnly:true,canEnter:false,isExecutedTrade:false,
  source:"VANTAGE_MT5",...publicFields(k),macroBias:e.bias,macroScore:e.score,macroEvidence:e,fundamentalApplied:!!(e.assetSpecific&&e.available),aiPolicy,
  caution:"Confluence score is not win probability and cannot guarantee market direction.",status,...extra};
}
export function evaluateAILive(args={}){
 const k=context(args),gold=isGold(args.symbol),e=macroEvidence(args.macro,gold);
 if(!k.ok)return response(k.status,k,e,{reason:k.reason});
 const price=(k.bid+k.ask)/2,selected=readMarketBrain(k.c,price),h1=readMarketBrain(k.a1,price),h4=readMarketBrain(k.a4,price);
 if(!selected.ok||!h1.ok||!h4.ok)return response("DATA_UNVERIFIED",k,e,{reason:"MARKET_BRAIN_INPUT_INCOMPLETE"});
 const fullGold=gold&&e.available,scores=mtfScores(k,selected,h1,h4,e,fullGold),pick=chooseDirection(scores);
 const map={selected:compactBrain(selected),h1:compactBrain(h1),h4:compactBrain(h4)};
 if(!pick.direction)return response("AI_MARKET_BALANCED",k,e,{direction:0,researchScope:fullGold?"VERIFIED_GOLD_MACRO_PLUS_MARKET_BRAIN":"TECHNICAL_MARKET_BRAIN",
  reason:pick.reason==="BUY_SELL_EVIDENCE_TOO_CLOSE"?
   "BUY and SELL evidence are too balanced. AI will not invent a trade when structure/liquidity/pattern evidence has no clear edge.":
   "Market evidence is too weak for a directional thesis.",
  marketBrain:map,analysis:{buyScore:rnd(scores.buy,1),sellScore:rnd(scores.sell,1),scoreGap:pick.gap,scoreMeaning:"NOT_WIN_PROBABILITY",
   mtfEvidence:scores.notes,blockers:[pick.reason]}});
 const d=pick.direction,th=thesis(selected,d,h1,h4),trigger=triggerFor(selected,d),macroDir=scores.macroDirection,
  macroHeadwind=Boolean(macroDir&&macroDir!==d),contra=contradiction(k,selected,h1,h4,d),rev=reversalException(selected,h1,d),
  counterTrend=contra.length>0&&!rev.strong,limits=thresholds(th.type,macroHeadwind,counterTrend);
 const dirEvidence=d===1?selected.buy:selected.sell,htfEvidence=[
  ...(d===1?h1.buy.evidence:h1.sell.evidence).slice(0,4).map(x=>({tf:"H1",...x})),
  ...(d===1?h4.buy.evidence:h4.sell.evidence).slice(0,4).map(x=>({tf:"H4",...x}))
 ];
 let confluence=pick.score;
 if(trigger)confluence+=trigger.rank>=94?7:trigger.rank>=85?5:3;
 if(macroHeadwind)confluence-=6;
 if(counterTrend)confluence-=8;
 const plan=buildMarketPlan(k.c,selected,d,d===1?k.ask:k.bid);
 if(plan?.fibConfluence?.overlap)confluence+=4;
 confluence=clamp(confluence,0,100);
 const blockers=[];
 if(!trigger)blockers.push("NO_SELECTED_TF_STRUCTURAL_TRIGGER");
 if(!plan)blockers.push("NO_VALID_MARKET_DRIVEN_RETEST_ZONE");
 if(counterTrend)blockers.push(...contra);
 if(macroHeadwind)blockers.push("VERIFIED_GOLD_MACRO_HEADWIND");
 if(confluence<limits.confirm)blockers.push("CONFLUENCE_BELOW_CONFIRM_"+limits.confirm);
 const analysis={buyScore:rnd(scores.buy,1),sellScore:rnd(scores.sell,1),directionScore:rnd(confluence,1),scoreGap:pick.gap,
  scoreMeaning:"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY",thesis:th,trigger,confirmThreshold:limits.confirm,readyThreshold:limits.ready,
  macroHeadwind,counterTrend,reversalException:rev,strongReversalOverride:rev.strong,mtfEvidence:scores.notes,
  selectedEvidence:dirEvidence.evidence,htfEvidence,blockers,entryModel:plan?.entryMethod||null,
  fibonacci:plan?.fibConfluence||{overlap:false,bonus:0,role:"OPTIONAL_ONLY"},marketRegime:selected.regime};
 const scope=fullGold?"VERIFIED_GOLD_MACRO_PLUS_MARKET_BRAIN":"TECHNICAL_MARKET_BRAIN";
 if(!trigger||!plan||confluence<limits.confirm||counterTrend){
  const status=d===1?"AI_BUY_WATCH":"AI_SELL_WATCH";
  return response(status,k,e,{direction:d,researchScope:scope,marketBrain:map,analysis,
   candidatePlan:plan?{...plan,researchOnly:true,status:"WATCH_NOT_ENTRY_READY"}:null,
   reason:counterTrend?
    side(d)+" evidence exists, but both higher-timeframe structure/trend still oppose it. AI keeps a reversal WATCH and requires stronger structural transition before entry.":
    !trigger?side(d)+" directional thesis exists from structure/liquidity/MTF evidence, but no fresh selected-TF BOS/CHOCH/sweep/pattern/candle trigger is confirmed yet.":
    !plan?"A valid "+side(d)+" trigger exists, but no clean structure/liquidity/zone retest can produce defensible SL/TP geometry.":
    side(d)+" thesis exists, but confluence "+rnd(confluence,1)+"/100 is below confirmation threshold "+limits.confirm+".",
   nextCandleCloseUTC:new Date((k.last.t-k.brokerUtcOffsetSeconds+2*(TFSEC[k.tf]||900))*1000).toISOString()});
 }
 const triggerIndex=Number.isInteger(trigger.index)?trigger.index:k.c.length-1,triggerBar=k.c[triggerIndex]||k.last,
  closeEpoch=triggerBar.t-k.brokerUtcOffsetSeconds+(TFSEC[k.tf]||900),expiry=EXPIRY[k.tf]||5;
 const conf={...plan,direction:d,confirmationType:trigger.type,confirmationCloseUTC:new Date(closeEpoch*1000).toISOString(),
  signalCandleTime:triggerBar.t,targetMethod:plan.targetMethod,score:rnd(confluence,1),expiresAfterClosedBars:expiry,
  verifiedForecastSurprise:false,explanation:[
   "Thesis: "+th.type+" • "+th.reason,
   "Structure: "+selected.structure.highClass+"/"+selected.structure.lowClass,
   selected.breakEvent?"Structure event: "+selected.breakEvent.label+" @ "+selected.breakEvent.level:null,
   selected.liquidity.sweep?"Liquidity: "+selected.liquidity.sweep.type+" @ "+selected.liquidity.sweep.level:null,
   selected.chartPattern?"Chart pattern: "+selected.chartPattern.type+" • "+selected.chartPattern.state:null,
   selected.candlePattern?"Candle evidence: "+selected.candlePattern.type:null,
   "Entry model selected by market context: "+plan.entryMethod,
   plan.fibConfluence?.overlap?"Fibonacci overlaps the chosen market zone (+4 confluence); Fib did NOT create the setup.":"Fibonacci does not overlap; setup remains valid because Fib is optional.",
   "Confluence "+rnd(confluence,1)+"/100 (NOT win probability)"
  ].filter(Boolean)};
 const elapsed=k.c.length-1-triggerIndex,entryPx=d===1?k.ask:k.bid,overlay={direction:d,researchScope:scope,marketBrain:map,
  analysis,confirmation:conf,entryQuote:entryPx,entryQuoteSide:d===1?"ASK":"BID",elapsedClosedBars:elapsed,
  explanation:{headline:(gold?"GOLD":String(args.symbol||"SYMBOL"))+" "+side(d)+" • "+th.type,
   drivers:conf.explanation,basis:plan.entryMethod,researchScope:scope}};
 const later=observedSince(args,k,triggerBar.t),stopped=later.some(x=>d===1?x.l<=plan.invalidation:x.h>=plan.invalidation),
  reached=later.some(x=>d===1?x.h>=plan.tp1:x.l<=plan.tp1);
 if(stopped&&reached)return response("AI_AMBIGUOUS_PATH",k,e,{...overlay,reason:"The same observable OHLC path touched both TP1 and structural invalidation; trade path cannot be proven."});
 if(stopped||d*(entryPx-plan.invalidation)<=0)return response("AI_INVALIDATED",k,e,{...overlay,reason:"Market invalidated the original structure/zone stop. Previous AI thesis is retired."});
 if(reached)return response("AI_COMPLETED_STUDY",k,e,{...overlay,reason:"TP1 was already reached after confirmation. AI will not reactivate the old setup."});
 if(elapsed>expiry)return response("AI_EXPIRED",k,e,{...overlay,reason:"Market-driven retest window expired after "+expiry+" closed candles. Wait for new structure."});
 const inside=entryPx>=plan.entryLow&&entryPx<=plan.entryHigh,far=d===1?entryPx>plan.entryHigh+.75*selected.atr:entryPx<plan.entryLow-.75*selected.atr;
 if(far)return response("AI_MISSED_ENTRY",k,e,{...overlay,reason:"Price has moved too far beyond the selected market-structure retest zone. Do not chase."});
 const ready=inside&&confluence>=limits.ready&&!macroHeadwind;
 if(macroHeadwind&&inside&&confluence>=limits.ready){
  return response(d===1?"AI_BUY_WATCH":"AI_SELL_WATCH",k,e,{...overlay,
   reason:"Price reached the technical entry zone, but verified Gold macro remains a headwind. AI does not upgrade to ENTRY READY until macro conflict clears or a new stronger thesis forms."});
 }
 return response(ready?(d===1?"AI_BUY_READY":"AI_SELL_READY"):d===1?"AI_BUY_CONFIRMED":"AI_SELL_CONFIRMED",k,e,{
  ...overlay,canEnter:ready,entryState:ready?"MARKET_INTELLIGENCE_ENTRY_ZONE_VALIDATED":"WAIT_MARKET_DRIVEN_RETEST",
  reason:ready?
   side(d)+" ENTRY READY: market structure/liquidity/pattern thesis is confirmed and fresh Vantage price is inside the selected "+plan.entryMethod+" zone.":
   side(d)+" thesis is CONFIRMED by "+trigger.type+". Wait for the market-driven "+plan.entryMethod+" zone; Fibonacci is optional only."});
}
