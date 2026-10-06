// GF-MARKET STUDY: price-level scenario research, NOT GF-AI or legacy engine.
// Independent swing/pivot support-resistance, rejection / breakdown, structural
// reclaim invalidation, next-liquidity targets and LIVE retest tracking.
// Historical examples (4300 etc.) are NEVER hard-coded to the current market.
import {context,publicFields,protective,pivotLevels,nearestAbove,nearestBelow,
 movingAverage,volatility,rnd,riskLevels,isGold} from "./_researchInputs.js";
const tfSecs={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
function output(status,k,data={},canEnter=false){
 return {ok:k.ok!==false,mode:"study",engine:"GF_MARKET_STRUCTURE_SCENARIO_V2",
  modeProfile:"STRUCTURE_CONTINUATION_REACTION_RECLAIM",
  modelType:"PRICE_STRUCTURE_RULES_NOT_TRAINED_ML",marketResearchOnly:true,
  canEnter,isExecutedTrade:false,source:"VANTAGE_MT5",...publicFields(k),status,...data};
}
function marketMacro(macro,symbol){
 if(!isGold(symbol))return {appliedAsGate:false,available:false,
  explanation:"No asset-specific macro context connected. Structure, not Gold macro, determines these zones.",observations:[]};
 const q=macro?.quality||null,available=!!q&&q.available===q.total&&!(q.errors||[]).length&&!(q.stale||[]).length;
 const pick=["US10Y","US2Y","REAL10Y","USDBROAD","CPI","FEDUPPER"];
 return {appliedAsGate:false,available,bias:available?macro.gold?.bias||"MIXED":"UNVERIFIED",
  observations:(macro?.cards||[]).filter(x=>pick.includes(x.id)).map(x=>({id:x.id,display:x.display,date:x.date,source:x.source,status:x.status})),
  explanation:available?"Gold fundamental and yields are SECONDARY context in Market Study, NEVER an entry trigger. Observation period is not a verified release timestamp.":
   "Macro unavailable or incomplete; technical scenario can be studied but no fundamental claim is made."};
}
function pivotPrice(a,d,ref,p){
 const levels=pivotLevels(a,2);
 const highs=levels.high.map(x=>x.price),lows=levels.low.map(x=>x.price);
 const prior=a.slice(-34,-1);
 const high=nearestAbove(highs,ref)??Math.max(...prior.map(x=>x.h));
 const low=nearestBelow(lows,ref)??Math.min(...prior.map(x=>x.l));
 const fallback={high,low,highs,lows};return fallback;
}
function targetsFromLiquidity({d,entry,atr,support,resistance,highs,lows}){
 const all=(d===1?highs:lows).filter(p=>d*(p-entry)>.35*atr)
  .sort((a,b)=>d*(a-b));
 const structure=d===1?resistance:support;
 if(Number.isFinite(structure)&&d*(structure-entry)>.35*atr)all.push(structure);
 const u=[...new Set(all.map(x=>rnd(x,6)))].sort((a,b)=>d*(a-b));
 const targets=[];
 for(const p of u){if(!targets.length||d*(p-targets.at(-1))>.35*atr)targets.push(p);if(targets.length>=3)break}
 const base=Number.isFinite(structure)&&d*(structure-entry)>.35*atr?structure:entry+d*1.05*atr;
 const increments=[1.0,2.0,3.0,4.0,5.0,6.0];
 for(const x of increments){
  if(targets.length>=3)break;
  const trial=base+d*x*atr;
  if(d*(trial-entry)>.35*atr&&(!targets.length||d*(trial-targets.at(-1))>.35*atr))targets.push(trial);
 }
 return targets.slice(0,3);
}
function levelResearch(k,dir,macro){
 const px=dir===1?k.ask:k.bid,p=k.atr,sw=pivotPrice(k.c,dir,k.last.c,p);
 const reference=dir===1?sw.low:sw.high;
 const zone=dir===1?{low:reference-.12*p,high:reference+.30*p}:
  {low:reference-.30*p,high:reference+.12*p};
 // Breakdown/reclaim confirmation refers to prior CLOSED levels, never developing high/low.
 const prior=k.c.slice(-17,-1);
 const breakLevel=dir===1?Math.max(...prior.map(x=>x.h)):Math.min(...prior.map(x=>x.l));
 const invalidationLevel=dir===1?sw.low-.18*p:sw.high+.18*p;
 const scenario=dir===1?"BULLISH_CONTINUATION":"BEARISH_CONTINUATION";
 const tf=k.tf;
 const rules=dir===1?
  {reaction:"Bullish rejection near demand zone; closed "+tf+" candle must hold above zone.",
   breakdown:"Closed "+tf+" candle above prior resistance "+rnd(breakLevel)+", then retest the broken level.",
   invalidation:"Closed "+tf+"/H1 reclaim BELOW "+rnd(invalidationLevel)+" invalidates bullish structure. Live breach blocks entry."}:
  {reaction:"Bearish rejection in supply/reaction zone; a "+tf+" candle must CLOSE below the area.",
   breakdown:"Closed "+tf+" candle below prior support "+rnd(breakLevel)+", then retest broken support from underneath.",
   invalidation:"Closed "+tf+"/H1 reclaim ABOVE "+rnd(invalidationLevel)+" invalidates bearish structure. Live breach blocks entry."};
 const projectionTargets=targetsFromLiquidity({d:dir,entry:(zone.low+zone.high)/2,atr:p,support:sw.low,resistance:sw.high,highs:sw.highs,lows:sw.lows}).map(x=>rnd(x));
 const levels={support:rnd(sw.low),resistance:rnd(sw.high),reactionZoneLow:rnd(zone.low),
  reactionZoneHigh:rnd(zone.high),breakoutLevel:rnd(breakLevel),invalidationLevel:rnd(invalidationLevel),
  referenceTimeframe:tf,triggerTimeframe:tf};
 return {scenario,levels,rules,sw,reference,zone,breakLevel,invalidationLevel,projectionTargets,macroContext:macro,
  commentary:(dir===1?"Bullish continuation remains a technical scenario while structure is held.":"Bearish continuation remains a technical scenario below structural resistance.")+
   " Do not chase current quote "+rnd(px)+". WAIT for verified reaction-zone rejection or closed-candle break and retest."};
}
function directionalRejection(b,dir,zone,atr){
 const width=Math.max(b.h-b.l,1e-9),body=Math.abs(b.c-b.o);
 const wick=dir===1?(Math.min(b.o,b.c)-b.l)/width:(b.h-Math.max(b.o,b.c))/width;
 const touched=dir===1?b.l<=zone.high&&b.h>=zone.low:b.h>=zone.low&&b.l<=zone.high;
 const closedAway=dir===1?b.c>=zone.high-.06*atr:b.c<=zone.low+.06*atr;
 return touched&&closedAway&&dir*(b.c-b.o)>0&&wick>=.18&&body>=.13*atr;
}
function brokenSupport(b,dir,level,atr){
 return dir===1?b.c>level+.07*atr&&b.c>b.o:b.c<level-.07*atr&&b.c<b.o;
}
function chooseBias(k){
 if(k.h1Trend===1&&k.h4Trend===1)return 1;
 if(k.h1Trend===-1&&k.h4Trend===-1)return -1;
 // A single HTF can be neutral, but NEVER approve opposite directional biases.
 if(k.h1Trend===0&&k.h4Trend!==0)return k.h4Trend;
 if(k.h4Trend===0&&k.h1Trend!==0)return k.h1Trend;
 return 0;
}
export function evaluateMarketStudy(args={}){
 const k=context(args),mc=marketMacro(args.macro,args.symbol);
 if(!k.ok)return output(k.status,k,{reason:k.reason,macroContext:mc});
 const d=chooseBias(k);
 if(!d)return output("STUDY_WAIT_STRUCTURE",k,{direction:0,reason:"H1/H4 oppose or both neutral: cannot select continuation direction.",
  macroContext:mc,scenarioNarrative:"WAIT for clear price structure. No BUY/SELL inferred."});
 const r=levelResearch(k,d,mc),p=k.atr,c=k.c,px=d===1?k.ask:k.bid;
 const base={direction:d,scenario:r.scenario,scenarioNarrative:r.commentary,structureLevels:r.levels,projectedTargets:r.projectionTargets,
  confirmationRules:r.rules,macroContext:mc,technicalSource:"VANTAGE_CLOSED_CANDLES",
  caution:"Technical zones and derived fundamental context do not guarantee BUY/SELL direction."};
 // A close beyond the prior structural invalidation cancels the continuation thesis.
 if(d*(k.last.c-r.invalidationLevel)<=0||d*(px-r.invalidationLevel)<=0){
  return output(d===1?"BUY_INVALID":"SELL_INVALID",k,{...base,
   reason:"Current closed structure or verified live broker quote breached structural invalidation.",confirmation:null});
 }
 // Evaluate last 3 completed trigger candles. Breakout references their OWN prior 16
 // closed candles: avoid validating the same candle against a future level.
 let event=null;
 for(let i=c.length-1;i>=Math.max(18,c.length-3);i--){
  const bar=c[i],prior=c.slice(Math.max(0,i-16),i);
  const oldBreak=d===1?Math.max(...prior.map(x=>x.h)):Math.min(...prior.map(x=>x.l));
  const rejection=directionalRejection(bar,d,r.zone,p);
  const breakout=brokenSupport(bar,d,oldBreak,p);
  if(!rejection&&!breakout)continue;
  const kind=rejection?"STRUCTURAL_ZONE_REJECTION":"CLOSED_BREAK_AND_RETEST";
  // Supply/demand reaction and break-retest use STRUCTURE levels, NOT AI Fib levels.
  const anchor=rejection?r.reference:oldBreak;
  const low=rejection?r.zone.low:anchor-.13*p,high=rejection?r.zone.high:anchor+.13*p;
  const stop=d===1?Math.min(bar.l,r.invalidationLevel,anchor-.40*p)-.07*p:
    Math.max(bar.h,r.invalidationLevel,anchor+.40*p)+.07*p;
  const mid=(low+high)/2;
  const liquidity=targetsFromLiquidity({d,entry:mid,atr:p,support:r.sw.low,resistance:r.sw.high,
   highs:r.sw.highs,lows:r.sw.lows});
  const plan=riskLevels({side:d===1?"BUY":"SELL",entryLow:low,entryHigh:high,stop,targets:liquidity});
  if(!plan)continue;
  const closeEpoch=bar.t-k.brokerUtcOffsetSeconds+tfSecs[k.tf];
  event={i,bar,plan:{...plan,direction:d,confirmationType:kind,
    confirmationCloseUTC:new Date(closeEpoch*1000).toISOString(),
    signalCandleTime:bar.t,expiresAfterClosedBars:3,
    entryMethod:rejection?"SUPPLY_DEMAND_REJECTION_ZONE":"BROKEN_PIVOT_RETEST",
    targetMethod:"INDEPENDENT_NEXT_SWING_LIQUIDITY_LEVELS_THEN_DISCLOSED_ATR_EXTENSION",
    score:null,verifiedForecastSurprise:false},kind};break;
 }
 if(!event){
  const stance=d===1?"STUDY_WAIT_BUY_CONFIRMATION":"STUDY_WAIT_SELL_CONFIRMATION";
  return output(stance,k,{...base,reason:"Continuation is a SCENARIO, not permission to enter. Await CLOSED "+k.tf+" rejection in reaction zone OR break of "+rnd(r.breakLevel)+" followed by retest.",
   entryState:"WAIT_CLOSED_CANDLE_CONFIRMATION",confirmation:null,
   reactionZone:{low:r.levels.reactionZoneLow,high:r.levels.reactionZoneHigh},
   nextCandleCloseUTC:new Date((k.last.t-k.brokerUtcOffsetSeconds+2*tfSecs[k.tf])*1000).toISOString()});
 }
 const plan=event.plan,elapsed=c.length-1-event.i;
 const overlay={...base,confirmation:plan,entryQuote:px,entryQuoteSide:d===1?"ASK":"BID",
  elapsedClosedBars:elapsed,
  explanation:{headline:(d===1?"BULLISH":"BEARISH")+" continuation confirmed by "+event.kind,
   detail:r.commentary,trigger:plan.confirmationType,levels:r.levels,rules:r.rules,
   targetType:plan.targetMethod,
   evidence:["Vantage MT5 CLOSED "+k.tf+" candles","H1 trend "+k.h1Trend,"H4 trend "+k.h4Trend,
    "Macro/yields are observational context only; they do not produce this zone or prove news surprise."]}};
 const laterClosed=c.slice(event.i+1);
 const forming=(Array.isArray(args.bars)?args.bars:[]).filter(b=>Number.isFinite(Number(b.t))&&Number(b.t)>event.bar.t&&
  Number(b.t)-k.brokerUtcOffsetSeconds<=k.nowSec&&Number(b.t)-k.brokerUtcOffsetSeconds+tfSecs[k.tf]>k.nowSec-1);
 const later=[...laterClosed,...forming];
 const stopped=later.some(b=>d===1?Number(b.l)<=plan.invalidation:Number(b.h)>=plan.invalidation);
 const reached=later.some(b=>d===1?Number(b.h)>=plan.tp1:Number(b.l)<=plan.tp1);
 if(stopped&&reached)return output("STUDY_AMBIGUOUS_PATH",k,{...overlay,reason:"Same observable OHLC path could touch TP and structural invalidation; entry barred."});
 if(stopped||d*(px-plan.invalidation)<=0)return output(d===1?"BUY_INVALID":"SELL_INVALID",k,{
  ...overlay,reason:"Market-structure setup invalidated by price/closed or forming wick reclaim."});
 if(reached)return output("STUDY_TARGET_TOUCHED",k,{...overlay,reason:"First liquidity target already touched; previous setup retired."});
 // H1 or setup timeframe close crossing the level invalidates the scenario.
 const h1After=k.a1.filter(b=>b.t-k.brokerUtcOffsetSeconds+3600>
  event.bar.t-k.brokerUtcOffsetSeconds+tfSecs[k.tf]);
 if(h1After.some(b=>d*(b.c-plan.invalidation)<=0))
  return output(d===1?"BUY_INVALID":"SELL_INVALID",k,{...overlay,reason:"H1 closed beyond structural reclaim invalidation."});
 if(elapsed>3)return output("STUDY_EXPIRED",k,{...overlay,reason:"Three CLOSED candles elapsed without valid reaction/retest."});
 const inside=px>=plan.entryLow&&px<=plan.entryHigh;
 const moved=d===1?px>plan.entryHigh+.55*p:px<plan.entryLow-.55*p;
 const status=inside?(d===1?"BUY_ENTRY_READY":"SELL_ENTRY_READY"):moved?"STUDY_MISSED_ENTRY":
  d===1?"BUY_CONFIRMED":"SELL_CONFIRMED";
 return output(status,k,{...overlay,canEnter:inside,
  entryState:inside?"STRUCTURE_ZONE_RETEST_AND_CLOSED_CONFIRMATION":moved?"DO_NOT_CHASE":"WAIT_REACTION_ZONE_RETEST",
  reason:inside?"Verified CLOSED structural confirmation and fresh bid/ask in independent pivot reaction/retest zone.":
   moved?"Market moved away from structural retest band; do not chase.":"Direction confirmed but current price is outside structural retest range. WAIT reaction."},inside);
}
