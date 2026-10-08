// GF-AI LIVE ANALYST v1.40 • PROFESSIONAL TRADER PLAYBOOK
// Reads M1/M5/M15/M30/H1/H4/D1 as one hierarchy, then compares BUY/SELL/NO_TRADE scenarios.
// Selected TF owns the entry trigger/zone; every other TF is contextual evidence.
// Market structure, BOS/CHOCH, liquidity, SND/SNR/SBR/RBS, OB/FVG,
// chart/candle patterns and macro context are combined audibly.
// Retrospective Experience Learning is capped and descriptive only. Fibonacci remains optional. No trained-ML or execution claims.
import {context,publicFields,rnd,isGold,val,clamp,normalizedClosedBars,trend,TF_SECONDS} from "./_researchInputs.js";
import {impactForType} from "./_v8Impact.js";
import {readMarketBrain,buildMarketPlan} from "./_aiMarketBrain.js";
import {learnFromClosedBars} from "./_aiLearningBrain.js";
import {buildReasoningBrain} from "./_aiReasoningBrain.js";
import {buildProfessionalPlaybook} from "./_aiTraderPlaybook.js";

const ids=["CPI","COREPCE","PAYEMS","UNRATE","FEDUPPER","US2Y","US10Y","REAL10Y","USDBROAD","NETLIQ"];
const ALL_TFS=["M1","M5","M15","M30","H1","H4","D1"];
const TF_ROLE={M1:"MICRO_EXECUTION",M5:"SCALP_ENTRY",M15:"INTRADAY_ENTRY",M30:"INTRADAY_STRUCTURE",H1:"TREND_CONTEXT",H4:"SWING_CONTEXT",D1:"REGIME_CONTEXT"};
const BASE_WEIGHT={M1:.07,M5:.12,M15:.16,M30:.15,H1:.18,H4:.19,D1:.13};
const EXPIRY={M1:7,M5:6,M15:5,M30:5,H1:4,H4:3,D1:3};
const side=d=>d===1?"BUY":d===-1?"SELL":"NEUTRAL";

function macroEvidence(macro,assetGold){
 const q=macro?.quality||null;
 const complete=!!q&&q.total===16&&q.available===16&&!q.errors?.length&&!q.stale?.length&&q.strictPrimaryReady!==false&&!q.secondaryMirror?.length;
 const cards=(macro?.cards||[]).filter(x=>ids.includes(x.id)).map(x=>{
  const impact=impactForType(x.id);
  return {id:x.id,display:x.display||null,period:x.date||null,source:x.source||null,status:x.status||"UNKNOWN",
   impactCategory:impact.impact,verifiedReleaseTimestamp:false,consensusSurprise:null,
   note:"Observation period is NOT a verified news publication time."};
 });
 const bias=assetGold?macro?.gold?.bias||"UNAVAILABLE":"USD_CROSS_ASSET_CONTEXT_ONLY";
 return {available:complete,assetSpecific:assetGold,scope:assetGold?"GOLD_MACRO":"USD_MACRO_CONTEXT_NOT_BTC_SPECIFIC",
  bias,score:assetGold&&Number.isFinite(Number(macro?.gold?.score))?Number(macro.gold.score):null,observations:cards,
  releaseTimeVerified:false,forecastSurpriseVerified:false,sourceHealth:q?.primarySourceHealth||"UNAVAILABLE",
  explanation:assetGold?"Gold macro changes conviction/risk; it does not replace price structure.":"No fake asset-specific fundamental is invented."};
}
function macroDirection(e){return e.bias==="PRESSURE"?-1:e.bias==="SUPPORTIVE"?1:0}

function compactBrain(b){
 if(!b?.ok)return {ok:false,reason:b?.reason||"UNAVAILABLE"};
 return {ok:true,atr:b.atr,structure:{bias:b.structure?.bias||0,highClass:b.structure?.highClass||"N/A",lowClass:b.structure?.lowClass||"N/A",
   lastHigh:b.structure?.lastHigh?{price:rnd(b.structure.lastHigh.price),time:b.structure.lastHigh.time}:null,
   lastLow:b.structure?.lastLow?{price:rnd(b.structure.lastLow.price),time:b.structure.lastLow.time}:null},
  breakEvent:b.breakEvent||null,liquidity:b.liquidity||null,zones:b.zones||null,chartPattern:b.chartPattern||null,candlePattern:b.candlePattern||null,
  regime:b.regime||null,buy:{score:Number(b.buy?.score)||0,evidence:Array.isArray(b.buy?.evidence)?b.buy.evidence:[],blockers:Array.isArray(b.buy?.blockers)?b.buy.blockers:[]},
  sell:{score:Number(b.sell?.score)||0,evidence:Array.isArray(b.sell?.evidence)?b.sell.evidence:[],blockers:Array.isArray(b.sell?.blockers)?b.sell.blockers:[]}};
}
function fallbackRaw(args,k,tf){
 if(tf===k.tf)return k.c;
 if(tf==="H1")return k.a1;
 if(tf==="H4")return k.a4;
 return Array.isArray(args.frames?.[tf])?args.frames[tf]:[];
}
function buildAllTf(args,k,price){
 const rows={};
 for(const tf of ALL_TFS){
  const raw=fallbackRaw(args,k,tf);
  const bars=tf===k.tf?k.c:tf==="H1"?k.a1:tf==="H4"?k.a4:normalizedClosedBars(raw,tf,k.nowSec,k.brokerUtcOffsetSeconds);
  if(!Array.isArray(bars)||bars.length<55){rows[tf]={tf,role:TF_ROLE[tf],available:false,bars:[],brain:null,trend:0,reason:"INSUFFICIENT_CLOSED_CANDLES"};continue}
  const brain=readMarketBrain(bars,price);
  rows[tf]={tf,role:TF_ROLE[tf],available:!!brain?.ok,bars,brain:brain?.ok?brain:null,trend:brain?.ok?trend(bars):0,reason:brain?.ok?null:brain?.reason||"MARKET_BRAIN_UNAVAILABLE"};
 }
 return rows;
}
function normalizedWeights(rows,selectedTf){
 const valid=ALL_TFS.filter(tf=>rows[tf]?.available);
 const raw={};let sum=0;
 for(const tf of valid){
  let w=BASE_WEIGHT[tf]||.1;
  if(tf===selectedTf)w+=.16;
  const s=TF_SECONDS[selectedTf]||900,t=TF_SECONDS[tf]||900,ratio=Math.max(s,t)/Math.min(s,t);
  if(tf!==selectedTf&&ratio<=4)w+=.025;
  raw[tf]=w;sum+=w;
 }
 const out={};for(const tf of valid)out[tf]=sum?raw[tf]/sum:0;
 return out;
}
function allTfScores(rows,selectedTf,e,fullGold){
 const weights=normalizedWeights(rows,selectedTf),matrix=[];let buy=0,sell=0,trendNet=0,structureNet=0,breakNet=0,coverage=0;
 for(const tf of ALL_TFS){
  const r=rows[tf],w=weights[tf]||0;
  if(!r?.available){matrix.push({tf,role:TF_ROLE[tf],available:false,weight:0});continue}
  coverage++;
  const b=r.brain,bs=Number(b.buy?.score)||0,ss=Number(b.sell?.score)||0,st=Number(b.structure?.bias)||0,td=Number(r.trend)||0,br=Number(b.breakEvent?.direction)||0;
  buy+=w*bs;sell+=w*ss;trendNet+=w*td;structureNet+=w*st;breakNet+=w*br;
  matrix.push({tf,role:r.role,available:true,weight:rnd(w*100,1),trend:td,structure:st,
   structureLabel:(b.structure?.highClass||"N/A")+"/"+(b.structure?.lowClass||"N/A"),buyScore:rnd(bs,1),sellScore:rnd(ss,1),
   breakEvent:b.breakEvent?{type:b.breakEvent.type,direction:b.breakEvent.direction,level:b.breakEvent.level}:null,
   sweep:b.liquidity?.sweep?{type:b.liquidity.sweep.type,direction:b.liquidity.sweep.direction,level:b.liquidity.sweep.level}:null,
   chartPattern:b.chartPattern?{type:b.chartPattern.type,direction:b.chartPattern.direction,state:b.chartPattern.state}:null,regime:b.regime?.type||null});
 }
 if(trendNet>0){buy+=trendNet*8}else sell+=Math.abs(trendNet)*8;
 if(structureNet>0){buy+=structureNet*9}else sell+=Math.abs(structureNet)*9;
 if(breakNet>0){buy+=breakNet*6}else sell+=Math.abs(breakNet)*6;
 const md=fullGold?macroDirection(e):0;
 if(md===1){buy+=6;sell-=2}if(md===-1){sell+=6;buy-=2}
 buy=clamp(buy,0,100);sell=clamp(sell,0,100);
 const bull=matrix.filter(x=>x.available&&(x.structure===1||x.trend===1)).length;
 const bear=matrix.filter(x=>x.available&&(x.structure===-1||x.trend===-1)).length;
 const neutral=Math.max(0,coverage-Math.max(bull,bear));
 const consensusDir=buy-sell>=6?1:sell-buy>=6?-1:0;
 return {buy,sell,macroDirection:md,matrix,weights,coverage,total:ALL_TFS.length,missing:matrix.filter(x=>!x.available).map(x=>x.tf),
  consensus:{direction:consensusDir,buy:rnd(buy,1),sell:rnd(sell,1),gap:rnd(Math.abs(buy-sell),1),bullishTF:bull,bearishTF:bear,neutralTF:neutral,
   trendNet:rnd(trendNet,2),structureNet:rnd(structureNet,2),breakNet:rnd(breakNet,2)}};
}
function chooseDirection(scores){
 const gap=Math.abs(scores.buy-scores.sell),mx=Math.max(scores.buy,scores.sell);
 if(mx<22||gap<5)return {direction:0,gap:rnd(gap,1),score:rnd(mx,1),reason:mx<22?"INSUFFICIENT_EVIDENCE":"BUY_SELL_EVIDENCE_TOO_CLOSE"};
 const d=scores.buy>scores.sell?1:-1;
 return {direction:d,gap:rnd(gap,1),score:rnd(d===1?scores.buy:scores.sell,1),opposite:rnd(d===1?scores.sell:scores.buy,1),reason:"DOMINANT_ALL_TF_EVIDENCE"};
}
function higherRows(rows,selectedTf){
 const sec=TF_SECONDS[selectedTf]||900;
 return ALL_TFS.filter(tf=>(TF_SECONDS[tf]||0)>sec&&rows[tf]?.available).map(tf=>rows[tf]);
}
function contextualOpposition(rows,selectedTf,d){
 const high=higherRows(rows,selectedTf);let support=0,oppose=0;const flags=[];
 for(const r of high){
  const b=r.brain,w=BASE_WEIGHT[r.tf]||.1,signals=[Number(b.structure?.bias)||0,Number(r.trend)||0,Number(b.breakEvent?.direction)||0];
  const local=signals.reduce((a,x)=>a+(x===d?1:x===-d?-1:0),0);
  if(local>0)support+=w*Math.abs(local);if(local<0){oppose+=w*Math.abs(local);flags.push(r.tf+"_OPPOSES_"+side(d))}
 }
 return {support:rnd(support,3),oppose:rnd(oppose,3),flags,counterTrend:oppose>support+.12,frames:high.map(x=>x.tf)};
}
function thesis(selected,d,rows){
 const br=selected.breakEvent,liq=selected.liquidity?.sweep,cp=selected.chartPattern,high=higherRows(rows,rows.__selectedTf||"M15");
 if(br?.direction===d&&br.type==="CHOCH")return {type:"REVERSAL_CHOCH",quality:"HIGH",reason:"Selected TF CHOCH changed recent structure."};
 if(liq?.direction===d&&cp?.direction===d)return {type:"LIQUIDITY_PATTERN_REVERSAL",quality:"HIGH",reason:"Liquidity sweep and chart pattern align."};
 if(br?.direction===d&&br.type==="BOS")return {type:"BOS_CONTINUATION_RETEST",quality:"HIGH",reason:"Selected TF BOS supports continuation."};
 if(cp?.direction===d&&cp.state==="CONFIRMED")return {type:"CHART_PATTERN_BREAK_RETEST",quality:"MEDIUM_HIGH",reason:cp.type+" confirmed."};
 if(liq?.direction===d)return {type:"LIQUIDITY_SWEEP_REVERSAL",quality:"MEDIUM_HIGH",reason:liq.type+" rejected external liquidity."};
 if(selected.structure?.bias===d&&high.some(r=>r.brain?.structure?.bias===d))return {type:"ALL_TF_TREND_CONTINUATION",quality:"MEDIUM",reason:"Selected TF structure agrees with higher-timeframe structure."};
 return {type:"DIRECTIONAL_MARKET_WATCH",quality:"EARLY",reason:"All-TF evidence has an edge but no dominant selected-TF trigger yet."};
}
function triggerFor(brain,d){
 const c=[];
 if(brain.breakEvent?.direction===d)c.push({rank:100,type:brain.breakEvent.type,index:brain.breakEvent.index,time:brain.breakEvent.time,level:brain.breakEvent.level});
 if(brain.liquidity?.sweep?.direction===d)c.push({rank:94,type:brain.liquidity.sweep.type,index:brain.liquidity.sweep.index,time:brain.liquidity.sweep.time,level:brain.liquidity.sweep.level});
 if(brain.chartPattern?.direction===d&&brain.chartPattern.state==="CONFIRMED")c.push({rank:90,type:brain.chartPattern.type+"_CONFIRMED",index:null,time:null,level:brain.chartPattern.neckline});
 if(brain.candlePattern?.direction===d)c.push({rank:72,type:brain.candlePattern.type,index:null,time:null,level:null});
 c.sort((a,b)=>b.rank-a.rank);return c[0]||null;
}
function reversalException(selected,rows,selectedTf,d){
 const sweep=selected.liquidity?.sweep?.direction===d,choch=selected.breakEvent?.direction===d&&selected.breakEvent.type==="CHOCH";
 const higher=higherRows(rows,selectedTf),higherTurn=higher.some(r=>r.brain?.breakEvent?.direction===d&&["CHOCH","BOS"].includes(r.brain.breakEvent.type));
 return {strong:Boolean(choch&&sweep&&higherTurn),choch,sweep,higherTurn};
}
function thresholds(thesisType,macroHeadwind,counterTrend,coverage){
 let confirm=54,ready=66;if(/REVERSAL/.test(thesisType)){confirm=62;ready=74}
 if(counterTrend){confirm+=5;ready+=7}if(macroHeadwind){confirm+=4;ready+=6}if(coverage<6){confirm+=4;ready+=4}
 return {confirm:Math.min(confirm,84),ready:Math.min(ready,92)};
}
function observedSince(args,k,t){
 return (Array.isArray(args.bars)?args.bars:[]).map(x=>({t:val(x.t),h:val(x.h),l:val(x.l)}))
  .filter(x=>x.t!==null&&x.h!==null&&x.l!==null&&x.t>t&&x.t-args.offsetSeconds<=k.nowSec);
}
function response(status,k,e,extra={}){
 const expiry=EXPIRY[k?.tf]||5;
 const aiPolicy={version:"1.40",entryPolicy:"PROFESSIONAL_TRADER_PLAYBOOK_REASONING_LEARNING",timeframes:ALL_TFS,selectedTfOwnsEntry:true,
  primaryEngines:["MARKET_STRUCTURE_HH_HL_LH_LL","BOS_CHOCH","LIQUIDITY_SWEEP_EQUAL_HIGHS_LOWS","SND_SNR_SBR_RBS","ORDER_BLOCK","FVG","CHART_PATTERNS","CANDLE_FORENSICS","ALL_TF_CONTEXT","MACRO_CONTEXT","SCENARIO_REASONING","EXPERIENCE_CALIBRATION","PROFESSIONAL_TRADER_PLAYBOOK","TRADE_IDEA_HIERARCHY"],
  reasoningModel:{scenarios:["BUY","SELL","NO_TRADE"],primaryAlternative:true,whatWouldChangeMyMind:true,evidenceVsContradiction:true},
  learningModel:{type:"RETROSPECTIVE_DIRECTIONAL_FOLLOW_THROUGH",trainedML:false,maxScoreAdjustment:5,minDecidableSamples:5,persistentLongTermMemory:false},
  chartPatterns:["DOUBLE_TOP_BOTTOM","HEAD_AND_SHOULDERS","INVERSE_HEAD_AND_SHOULDERS","ASCENDING_DESCENDING_TRIANGLE"],
  entryModels:["BOS_RBS_SBR_RETEST","CHOCH_STRUCTURE_RETEST","LIQUIDITY_SWEEP_ZONE_RETEST","PATTERN_NECKLINE_RETEST","ORDER_BLOCK_RETEST","FVG_REBALANCE","SUPPLY_DEMAND_REACTION"],
  fibonacciRole:"OPTIONAL_OVERLAP_BONUS_ONLY_NOT_REQUIRED",scoreMeaning:"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY",persistent24hSignalArchive:false,
  hardSafety:["STALE_BROKER_DATA","STRUCTURE_INVALIDATION","TARGET_ALREADY_REACHED","AMBIGUOUS_OHLC_PATH","LOW_TF_COVERAGE"],
  // Backward compatibility for browser clients that still have v1.10 UI cached.
  requiresH1H4Alignment:false,acceptedClosedPatterns:["BOS","CHOCH","LIQUIDITY_SWEEP","CHART_PATTERN","CANDLE_FORENSICS"],
  triggerLookbackClosedBars:6,entryExpiryClosedBars:expiry,entryRetest:"MARKET_DRIVEN",scoreThresholdAligned:66,scoreThresholdPartialMTF:74,
  note:"AI compares BUY, SELL and NO_TRADE, then applies the Professional Trader Playbook: D1/H4 regime, H1/M30 thesis, M15/M5 setup, M1 precision trigger, one parent Trade Idea ID across TFs. Fibonacci never creates the setup."};
 return {ok:true,engine:"GF_AI_PROFESSIONAL_TRADER_PLAYBOOK_V7",mode:"ai",modeProfile:"ALL_TF_PROFESSIONAL_TRADER_REASONING",
  modelType:"AUDITABLE_PROFESSIONAL_TRADER_PLAYBOOK_NOT_TRAINED_ML",marketResearchOnly:true,canEnter:false,isExecutedTrade:false,
  source:"VANTAGE_MT5",...publicFields(k),macroBias:e.bias,macroScore:e.score,macroEvidence:e,fundamentalApplied:!!(e.assetSpecific&&e.available),aiPolicy,
  caution:"Confluence score is not win probability and cannot guarantee direction.",status,...extra};
}
export function evaluateAILive(args={}){
 const k=context(args),gold=isGold(args.symbol),e=macroEvidence(args.macro,gold);
 if(!k.ok)return response(k.status,k,e,{reason:k.reason});
 const price=(k.bid+k.ask)/2,rows=buildAllTf(args,k,price);rows.__selectedTf=k.tf;
 const selectedRow=rows[k.tf],selected=selectedRow?.brain;
 if(!selectedRow?.available||!selected)return response("DATA_UNVERIFIED",k,e,{reason:"SELECTED_TF_MARKET_BRAIN_UNAVAILABLE"});
 const fullGold=gold&&e.available,scores=allTfScores(rows,k.tf,e,fullGold),experience=learnFromClosedBars(selectedRow.bars,k.tf);
 if(experience?.ok){
  scores.buy=clamp(scores.buy+(Number(experience.buyAdjustment)||0),0,100);
  scores.sell=clamp(scores.sell+(Number(experience.sellAdjustment)||0),0,100);
  scores.consensus={...scores.consensus,buy:rnd(scores.buy,1),sell:rnd(scores.sell,1),gap:rnd(Math.abs(scores.buy-scores.sell),1),
   direction:scores.buy-scores.sell>=6?1:scores.sell-scores.buy>=6?-1:0};
 }
 const pick=chooseDirection(scores);
 const compactFrames={};for(const tf of ALL_TFS)compactFrames[tf]=rows[tf]?.available?compactBrain(rows[tf].brain):{ok:false,reason:rows[tf]?.reason||"UNAVAILABLE"};
 const map={selectedTf:k.tf,selected:compactBrain(selected),allTimeframes:compactFrames,coverage:{available:scores.coverage,total:scores.total,missing:scores.missing}};
 if(scores.coverage<4)return response("DATA_UNVERIFIED",k,e,{reason:"ALL_TF_COVERAGE_TOO_LOW",marketBrain:map,experienceLearning:experience,
  analysis:{timeframeMatrix:scores.matrix,allTfConsensus:scores.consensus,blockers:["TF_COVERAGE_"+scores.coverage+"_OF_"+scores.total]}});
 const buyPlan=buildMarketPlan(selectedRow.bars,selected,1,k.ask),sellPlan=buildMarketPlan(selectedRow.bars,selected,-1,k.bid);
 const reasoning=buildReasoningBrain({symbol:args.symbol,selectedTf:k.tf,selected,matrix:scores.matrix,consensus:scores.consensus,
  coverage:map.coverage,buyScore:scores.buy,sellScore:scores.sell,buyPlan,sellPlan,currentPrice:price,macroEvidence:e,
  macroDirection:scores.macroDirection,learning:experience,nowSec:k.nowSec});
 if(!pick.direction||reasoning.primaryScenario==="NO_TRADE"){
  const noTradeAnalysis={buyScore:rnd(scores.buy,1),sellScore:rnd(scores.sell,1),directionScore:rnd(pick.score,1),scoreGap:pick.gap,
   scoreMeaning:"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY",timeframeMatrix:scores.matrix,allTfConsensus:scores.consensus,blockers:[pick.reason||"NO_TRADE_REASONING"]};
  const professionalPlaybook=buildProfessionalPlaybook({symbol:args.symbol,selectedTf:k.tf,matrix:scores.matrix,selected,reasoning,analysis:noTradeAnalysis,
   plan:null,currentPrice:price,macroHeadwind:false});
  return response("AI_MARKET_BALANCED",k,e,{direction:0,researchScope:fullGold?"VERIFIED_GOLD_MACRO_PLUS_ALL_TF_MARKET_BRAIN":"ALL_TF_TECHNICAL_MARKET_BRAIN",
   reason:reasoning.decisionSummary?.whyPrimary||(pick.reason==="BUY_SELL_EVIDENCE_TOO_CLOSE"?"BUY and SELL evidence are too balanced across M1→D1. AI will not force a trade.":"All-TF evidence is too weak for a directional thesis."),
   marketBrain:map,experienceLearning:experience,reasoning,professionalPlaybook,analysis:noTradeAnalysis});
 }
 const d=pick.direction,th=thesis(selected,d,rows),trigger=triggerFor(selected,d),macroDir=scores.macroDirection,
  macroHeadwind=Boolean(macroDir&&macroDir!==d),higher=contextualOpposition(rows,k.tf,d),rev=reversalException(selected,rows,k.tf,d),
  counterTrend=higher.counterTrend&&!rev.strong,limits=thresholds(th.type,macroHeadwind,counterTrend,scores.coverage);
 const selectedEvidence=d===1?selected.buy:selected.sell,allEvidence=[];
 for(const row of scores.matrix){
  if(!row.available)continue;
  const b=rows[row.tf].brain,evi=(d===1?b.buy?.evidence:b.sell?.evidence)||[];
  for(const x of evi.slice(0,3))allEvidence.push({tf:row.tf,points:x.points,text:x.text});
 }
 let confluence=pick.score;if(trigger)confluence+=trigger.rank>=94?7:trigger.rank>=85?5:3;if(macroHeadwind)confluence-=5;if(counterTrend)confluence-=7;
 const plan=d===1?buyPlan:sellPlan;
 if(plan?.fibConfluence?.overlap)confluence+=4;confluence=clamp(confluence,0,100);
 const blockers=[];if(!trigger)blockers.push("NO_SELECTED_TF_STRUCTURAL_TRIGGER");if(!plan)blockers.push("NO_VALID_MARKET_DRIVEN_RETEST_ZONE");
 if(counterTrend)blockers.push(...higher.flags);if(macroHeadwind)blockers.push("VERIFIED_GOLD_MACRO_HEADWIND");
 if(confluence<limits.confirm)blockers.push("CONFLUENCE_BELOW_CONFIRM_"+limits.confirm);
 const analysis={buyScore:rnd(scores.buy,1),sellScore:rnd(scores.sell,1),directionScore:rnd(confluence,1),scoreGap:pick.gap,
  scoreMeaning:"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY",thesis:th,trigger,confirmThreshold:limits.confirm,readyThreshold:limits.ready,
  macroHeadwind,counterTrend,higherContext:higher,reversalException:rev,strongReversalOverride:rev.strong,
  timeframeMatrix:scores.matrix,allTfConsensus:scores.consensus,tfCoverage:{available:scores.coverage,total:scores.total,missing:scores.missing},
  selectedEvidence:Array.isArray(selectedEvidence?.evidence)?selectedEvidence.evidence:[],allTfEvidence:allEvidence.slice(0,18),blockers,entryModel:plan?.entryMethod||null,
  fibonacci:plan?.fibConfluence||{overlap:false,bonus:0,role:"OPTIONAL_ONLY"},marketRegime:selected.regime,
  experienceAdjustment:d===1?(experience?.buyAdjustment||0):(experience?.sellAdjustment||0),reasoningPrimary:reasoning.primaryScenario};
 const professionalPlaybook=buildProfessionalPlaybook({symbol:args.symbol,selectedTf:k.tf,matrix:scores.matrix,selected,reasoning,analysis,
  plan,currentPrice:d===1?k.ask:k.bid,macroHeadwind});
 const scope=fullGold?"VERIFIED_GOLD_MACRO_PLUS_ALL_TF_MARKET_BRAIN":"ALL_TF_TECHNICAL_MARKET_BRAIN";
 if(!trigger||!plan||confluence<limits.confirm||counterTrend||!professionalPlaybook?.tradeIdea?.quality?.eligible){
  return response(d===1?"AI_BUY_WATCH":"AI_SELL_WATCH",k,e,{direction:d,researchScope:scope,marketBrain:map,analysis,experienceLearning:experience,reasoning,professionalPlaybook,
   candidatePlan:plan?{...plan,researchOnly:true,status:"WATCH_NOT_ENTRY_READY",tradeIdeaId:professionalPlaybook?.tradeIdea?.id||null}:null,
   reason:counterTrend?side(d)+" evidence exists, but weighted higher-timeframe structure still opposes it. AI keeps WATCH until structural transition strengthens.":
    !trigger?side(d)+" thesis exists across M1→D1, but selected "+k.tf+" has no fresh BOS/CHOCH/liquidity/pattern/candle trigger yet.":
    !plan?"A selected-TF trigger exists, but there is no defensible structure/liquidity/zone retest for SL/TP geometry.":
    side(d)+" thesis exists, but all-TF confluence "+rnd(confluence,1)+"/100 is below confirmation threshold "+limits.confirm+".",
   nextCandleCloseUTC:new Date((k.last.t-k.brokerUtcOffsetSeconds+2*(TF_SECONDS[k.tf]||900))*1000).toISOString()});
 }
 const triggerIndex=Number.isInteger(trigger.index)?trigger.index:selectedRow.bars.length-1,triggerBar=selectedRow.bars[triggerIndex]||k.last,
  closeEpoch=triggerBar.t-k.brokerUtcOffsetSeconds+(TF_SECONDS[k.tf]||900),expiry=EXPIRY[k.tf]||5;
 const conf={...plan,direction:d,confirmationType:trigger.type,confirmationCloseUTC:new Date(closeEpoch*1000).toISOString(),signalCandleTime:triggerBar.t,
  targetMethod:plan.targetMethod,score:rnd(confluence,1),expiresAfterClosedBars:expiry,verifiedForecastSurprise:false,
  explanation:["Primary scenario: "+reasoning.primaryScenario+" • Alternative: "+reasoning.alternativeScenario,
   "All-TF consensus: BUY "+rnd(scores.buy,1)+" / SELL "+rnd(scores.sell,1)+" • coverage "+scores.coverage+"/"+scores.total,
   experience?.ok?"Experience calibration: BUY "+(experience.buyAdjustment>=0?"+":"")+experience.buyAdjustment+" / SELL "+(experience.sellAdjustment>=0?"+":"")+experience.sellAdjustment+" points (capped; not win probability)":null,
   "Thesis: "+th.type+" • "+th.reason,"Selected "+k.tf+" structure: "+selected.structure.highClass+"/"+selected.structure.lowClass,
   selected.breakEvent?"Selected structure event: "+selected.breakEvent.label+" @ "+selected.breakEvent.level:null,
   selected.liquidity?.sweep?"Liquidity: "+selected.liquidity.sweep.type+" @ "+selected.liquidity.sweep.level:null,
   selected.chartPattern?"Chart pattern: "+selected.chartPattern.type+" • "+selected.chartPattern.state:null,
   "Entry model: "+plan.entryMethod,plan.fibConfluence?.overlap?"Fibonacci overlaps chosen market zone (+4 only).":"Fibonacci not required.",
   "Confluence "+rnd(confluence,1)+"/100 (NOT win probability)"].filter(Boolean)};
 conf.tradeIdeaId=professionalPlaybook?.tradeIdea?.id||null;
 const elapsed=selectedRow.bars.length-1-triggerIndex,entryPx=d===1?k.ask:k.bid,overlay={direction:d,researchScope:scope,marketBrain:map,analysis,experienceLearning:experience,reasoning,professionalPlaybook,confirmation:conf,
  entryQuote:entryPx,entryQuoteSide:d===1?"ASK":"BID",elapsedClosedBars:elapsed,
  explanation:{headline:(gold?"GOLD":String(args.symbol||"SYMBOL"))+" "+side(d)+" • "+th.type,drivers:conf.explanation,basis:plan.entryMethod,researchScope:scope}};
 const later=observedSince(args,k,triggerBar.t),stopped=later.some(x=>d===1?x.l<=plan.invalidation:x.h>=plan.invalidation),reached=later.some(x=>d===1?x.h>=plan.tp1:x.l<=plan.tp1);
 if(stopped&&reached)return response("AI_AMBIGUOUS_PATH",k,e,{...overlay,reason:"Observable OHLC touched TP1 and structural invalidation; path cannot be proven."});
 if(stopped||d*(entryPx-plan.invalidation)<=0)return response("AI_INVALIDATED",k,e,{...overlay,reason:"Market invalidated the original structure/zone stop."});
 if(reached)return response("AI_COMPLETED_STUDY",k,e,{...overlay,reason:"TP1 already reached. Old setup is retired."});
 if(elapsed>expiry)return response("AI_EXPIRED",k,e,{...overlay,reason:"Market-driven retest window expired. Wait for new structure."});
 const inside=entryPx>=plan.entryLow&&entryPx<=plan.entryHigh,far=d===1?entryPx>plan.entryHigh+.75*selected.atr:entryPx<plan.entryLow-.75*selected.atr;
 if(far)return response("AI_MISSED_ENTRY",k,e,{...overlay,reason:"Price moved too far beyond the selected-TF retest zone. Do not chase."});
 const ready=inside&&confluence>=limits.ready&&professionalPlaybook?.tradeIdea?.quality?.eligible===true;
 return response(ready?(d===1?"AI_BUY_READY":"AI_SELL_READY"):d===1?"AI_BUY_CONFIRMED":"AI_SELL_CONFIRMED",k,e,{...overlay,canEnter:ready,
  entryState:ready?"REASONING_SCENARIO_ENTRY_VALIDATED":"WAIT_MARKET_DRIVEN_RETEST",
  reason:ready?side(d)+" ENTRY READY: all-TF context supports the selected "+k.tf+" thesis and Vantage price is inside "+plan.entryMethod+"."+
   (macroHeadwind?" Macro headwind exists; the higher threshold was required and passed.":""):
   side(d)+" thesis is CONFIRMED on "+k.tf+" by "+trigger.type+". Wait for "+plan.entryMethod+"; all other TFs remain context, not separate entries."});
}
