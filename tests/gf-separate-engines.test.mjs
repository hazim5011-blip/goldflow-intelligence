import test from "node:test";
import assert from "node:assert/strict";
import {evaluateAILive} from "../api/_aiLiveEngine.js";
import {evaluateMarketStudy} from "../api/_marketStudyEngine.js";

const now=1900000000,offset=10800;
function feed(n=95,tf=900,step=.13){
 const arr=[];
 for(let i=0;i<n;i++){
  const price=4300+i*step;
  arr.push({t:now+offset-(n-i)*tf+700,o:price,c:price+.13,h:price+.67,l:price-.45,v:180+i});
 }
 return arr;
}
function allFrames(step=.13){
 return {M1:feed(95,60,step),M5:feed(95,300,step),M15:feed(95,900,step),M30:feed(95,1800,step),H1:feed(95,3600,step),H4:feed(95,14400,step),D1:feed(95,86400,step)};
}
const verified=()=>({
 quality:{available:16,total:16,errors:[],stale:[],strictPrimaryReady:true,secondaryMirror:[],primarySourceHealth:"RECOVERED_OFFICIAL_VIA_LOCAL_BRIDGE"},
 gold:{bias:"SUPPORTIVE",score:74},
 cards:[{id:"CPI",value:3.4,display:"3.4% YoY",date:"2026-08-01",source:"BLS",status:"OFFICIAL"},
  {id:"US10Y",value:5.28,display:"5.28%",date:"2026-10-02",source:"US Treasury",status:"OFFICIAL"}]
});
function fixture(){
 const bars=feed(),last=bars.at(-2),prior=bars.at(-3);
 last.o=prior.c+.15;last.c=prior.h+2.1;last.l=last.o-.23;last.h=last.c+.30;
 const px=last.c+.1,frames=allFrames(.13);frames.M15=bars;
 return {symbol:"XAUUSD247",tf:"M15",bars,h1:frames.H1,h4:frames.H4,frames,
  quote:{bid:px,ask:px+.05,tickTime:now+offset,observedAt:now},offsetSeconds:offset,macro:verified(),nowSec:now};
}
test("identical Gold inputs go through genuinely separate engines, methods, entries and target construction",()=>{
 const f=fixture(),a=evaluateAILive(f),s=evaluateMarketStudy(f);
 assert.equal(a.engine,"GF_AI_REASONING_SCENARIO_LEARNING_V6");
 assert.ok(a.aiPolicy.primaryEngines.includes("BOS_CHOCH"));
 assert.ok(a.aiPolicy.primaryEngines.includes("LIQUIDITY_SWEEP_EQUAL_HIGHS_LOWS"));
 assert.equal(a.aiPolicy.fibonacciRole,"OPTIONAL_OVERLAP_BONUS_ONLY_NOT_REQUIRED");
 assert.deepEqual(a.aiPolicy.reasoningModel.scenarios,["BUY","SELL","NO_TRADE"]);
 assert.equal(a.aiPolicy.learningModel.trainedML,false);
 assert.equal(a.aiPolicy.learningModel.maxScoreAdjustment,5);
 assert.equal(a.aiPolicy.persistent24hSignalArchive,false);
 assert.equal(s.engine,"GF_MARKET_STRUCTURE_SCENARIO_V2");
 assert.ok(s.confirmation,JSON.stringify({status:s.status,reason:s.reason}));
 assert.equal(s.confirmation.entryMethod,"BROKEN_PIVOT_RETEST");
 assert.equal(s.structureFlip?.type,"RBS");
 assert.match(s.confirmation.confirmationType,/^RBS_/);
 assert.ok(a.marketBrain?.selected?.structure);
 assert.notEqual(a.engine,s.engine);
 if(a.confirmation){
  assert.ok(a.aiPolicy.entryModels.includes(a.confirmation.entryMethod));
  assert.ok(!/FIB/i.test(a.confirmation.entryMethod),"Fibonacci must not be the primary AI entry method");
 }
 assert.equal(a.macroEvidence.assetSpecific,true);
 assert.equal(s.macroContext.appliedAsGate,false);
 assert.ok(s.structureLevels.support<s.structureLevels.resistance);
 assert.ok(s.projectedTargets?.length===3);
});
test("bearish Market Study names broken support retest as SBR",()=>{
 const bars=feed(95,900,-.13),last=bars.at(-2),prior=bars.at(-3);
 last.o=prior.c-.15;last.c=prior.l-2.1;last.h=last.o+.23;last.l=last.c-.30;
 const px=last.c-.10;
 const f={symbol:"XAUUSD247",tf:"M15",bars,h1:feed(95,3600,-.13),h4:feed(95,14400,-.13),
  quote:{bid:px-.05,ask:px,tickTime:now+offset,observedAt:now},offsetSeconds:offset,macro:verified(),nowSec:now};
 const s=evaluateMarketStudy(f);
 assert.ok(s.confirmation,JSON.stringify({status:s.status,reason:s.reason}));
 assert.equal(s.confirmation.entryMethod,"BROKEN_PIVOT_RETEST");
 assert.equal(s.structureFlip?.type,"SBR");
 assert.match(s.confirmation.confirmationType,/^SBR_/);
});
test("AI Gold downgrades to verifiable technical-only mode with incomplete 13/16 macro; Market Study remains independent",()=>{
 const f=fixture(),bad={...verified(),quality:{...verified().quality,available:13,strictPrimaryReady:false,errors:["BLS block"]}};
 const a=evaluateAILive({...f,macro:bad});
 const s=evaluateMarketStudy({...f,macro:bad});
 assert.equal(a.researchScope,"ALL_TF_TECHNICAL_MARKET_BRAIN");
 assert.notEqual(a.status,"AI_WAIT_VERIFIED_MACRO");
 assert.equal(s.engine,"GF_MARKET_STRUCTURE_SCENARIO_V2");
 assert.equal(s.macroContext.available,false);
 assert.ok(s.structureLevels);
 assert.equal(s.macroContext.appliedAsGate,false);
});
test("AI BTC uses valid technical candles without asserting fake BTC fundamentals",()=>{
 const f=fixture(),r=evaluateAILive({...f,symbol:"BTCUSD",macro:verified()});
 assert.notEqual(r.status,"AI_ASSET_FUNDAMENTAL_UNAVAILABLE");
 assert.equal(r.researchScope,"ALL_TF_TECHNICAL_MARKET_BRAIN");
 assert.equal(r.fundamentalApplied,false);
 assert.equal(r.macroEvidence.scope,"USD_MACRO_CONTEXT_NOT_BTC_SPECIFIC");
 assert.equal(r.macroEvidence.assetSpecific,false);
});
test("Market Study dynamic zone and no hard-coded September 2026 example levels",()=>{
 const f=fixture(),a=evaluateMarketStudy(f),shift=1000;
 const change=(list)=>list.map(b=>({...b,o:b.o+shift,h:b.h+shift,l:b.l+shift,c:b.c+shift}));
 const z=evaluateMarketStudy({...f,bars:change(f.bars),h1:change(f.h1),h4:change(f.h4),
  quote:{...f.quote,bid:f.quote.bid+shift,ask:f.quote.ask+shift}});
 assert.ok(a.structureLevels&&z.structureLevels);
 assert.equal(Math.round(z.structureLevels.resistance-a.structureLevels.resistance),shift);
 assert.equal(Math.round(z.structureLevels.support-a.structureLevels.support),shift);
 assert.notEqual(a.structureLevels.resistance,4300);
 assert.match(z.confirmationRules.invalidation,/Closed M15\/H1 reclaim/);
});
test("stale broker quote forces both independent engines to MARKET_OFFLINE with no entry",()=>{
 const f=fixture(),bad={...f,quote:{...f.quote,tickTime:now+offset-120}};
 for(const engine of [evaluateAILive,evaluateMarketStudy]){
  const x=engine(bad);
  assert.equal(x.status,"MARKET_OFFLINE");assert.equal(x.canEnter,false);
 }
});
test("release period is never promoted to verified news timestamp or fake surprise in AI",()=>{
 const f=fixture(),x=evaluateAILive(f);
 assert.equal(x.macroEvidence.releaseTimeVerified,false);
 assert.equal(x.macroEvidence.forecastSurpriseVerified,false);
 assert.ok(x.macroEvidence.observations.every(o=>o.verifiedReleaseTimestamp===false&&o.consensusSurprise===null));
 assert.equal(x.modelType,"AUDITABLE_MARKET_INTELLIGENCE_RULES_NOT_TRAINED_ML");
});


test("Market Intelligence exposes a directional WATCH with market-brain evidence instead of meaningless WAIT PATTERN",()=>{
 const bars=feed(),px=bars.at(-2).c;
 const frames=allFrames(.13);frames.M15=bars;
 const f={symbol:"XAUUSD247",tf:"M15",bars,h1:frames.H1,h4:frames.H4,frames,
  quote:{bid:px,ask:px+.05,tickTime:now+offset,observedAt:now},offsetSeconds:offset,macro:verified(),nowSec:now};
 const a=evaluateAILive(f);
 assert.ok(["AI_BUY_WATCH","AI_SELL_WATCH","AI_MARKET_BALANCED","AI_BUY_CONFIRMED","AI_SELL_CONFIRMED"].includes(a.status),JSON.stringify(a));
 assert.ok(a.marketBrain?.selected);
 assert.ok(a.analysis);
 assert.equal(a.analysis.scoreMeaning,"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY");
 assert.equal(a.canEnter,false);
});

test("Market Intelligence policy contains structure, BOS/CHOCH, liquidity, SND/SNR/SBR/RBS, OB/FVG and chart-pattern engines",()=>{
 const a=evaluateAILive(fixture()),e=a.aiPolicy.primaryEngines;
 for(const id of ["MARKET_STRUCTURE_HH_HL_LH_LL","BOS_CHOCH","LIQUIDITY_SWEEP_EQUAL_HIGHS_LOWS","SND_SNR_SBR_RBS","ORDER_BLOCK","FVG","CHART_PATTERNS","CANDLE_FORENSICS","ALL_TF_CONTEXT"]){
  assert.ok(e.includes(id),id);
 }
 assert.ok(a.aiPolicy.entryModels.includes("BOS_RBS_SBR_RETEST"));
 assert.ok(a.aiPolicy.entryModels.includes("CHOCH_STRUCTURE_RETEST"));
 assert.equal(a.aiPolicy.fibonacciRole,"OPTIONAL_OVERLAP_BONUS_ONLY_NOT_REQUIRED");
});

test("Market Intelligence never forces a trade when BUY/SELL evidence is balanced",()=>{
 const flat=feed(95,900,0),px=flat.at(-2).c;
 const frames=allFrames(0);frames.M15=flat;
 const a=evaluateAILive({symbol:"XAUUSD247",tf:"M15",bars:flat,h1:frames.H1,h4:frames.H4,frames,
  quote:{bid:px,ask:px+.05,tickTime:now+offset,observedAt:now},offsetSeconds:offset,macro:null,nowSec:now});
 assert.ok(["AI_MARKET_BALANCED","AI_BUY_WATCH","AI_SELL_WATCH"].includes(a.status),JSON.stringify(a));
 assert.equal(a.canEnter,false);
});

test("GF-AI v1.30 reads all seven broker timeframes and exposes a visible matrix",()=>{
 const a=evaluateAILive(fixture());
 assert.deepEqual(a.aiPolicy.timeframes,["M1","M5","M15","M30","H1","H4","D1"]);
 assert.equal(a.aiPolicy.selectedTfOwnsEntry,true);
 assert.equal(a.marketBrain.coverage.available,7);
 assert.equal(a.marketBrain.coverage.total,7);
 assert.equal(a.analysis.timeframeMatrix.length,7);
 for(const tf of ["M1","M5","M15","M30","H1","H4","D1"]){
  assert.ok(a.analysis.timeframeMatrix.some(x=>x.tf===tf&&x.available),tf);
  assert.ok(a.marketBrain.allTimeframes[tf].ok,tf);
 }
});
test("GF-AI v1.30 fails closed when fewer than four timeframes are available",()=>{
 const f=fixture(),frames={M15:f.frames.M15,H1:f.frames.H1,H4:f.frames.H4};
 const a=evaluateAILive({...f,frames});
 assert.equal(a.status,"DATA_UNVERIFIED");
 assert.equal(a.reason,"ALL_TF_COVERAGE_TOO_LOW");
 assert.equal(a.canEnter,false);
});
test("Backward-compatibility fields prevent cached v1.10 UI from crashing on acceptedClosedPatterns.length",()=>{
 const a=evaluateAILive(fixture());
 assert.ok(Array.isArray(a.aiPolicy.acceptedClosedPatterns));
 assert.ok(a.aiPolicy.acceptedClosedPatterns.length>0);
 assert.ok(Number.isInteger(a.aiPolicy.triggerLookbackClosedBars));
 assert.ok(Number.isInteger(a.aiPolicy.entryExpiryClosedBars));
});

test("GF-AI v1.30 returns auditable primary/alternative/no-trade reasoning",()=>{
 const a=evaluateAILive(fixture());
 assert.ok(a.reasoning,JSON.stringify({status:a.status,reason:a.reason}));
 assert.equal(a.reasoning.version,"1.30");
 assert.ok(["BUY","SELL","NO_TRADE"].includes(a.reasoning.primaryScenario));
 assert.ok(["BUY","SELL"].includes(a.reasoning.alternativeScenario));
 assert.ok(a.reasoning.scenarios.BUY);
 assert.ok(a.reasoning.scenarios.SELL);
 assert.ok(a.reasoning.scenarios.NO_TRADE);
 assert.ok(Array.isArray(a.reasoning.decisionSummary.whatWouldChangeMyMind));
 assert.ok(a.reasoning.decisionSummary.whatWouldChangeMyMind.length>=2);
});
test("GF-AI v1.30 Experience Learning is capped and cannot masquerade as win probability",()=>{
 const a=evaluateAILive(fixture());
 assert.ok(a.experienceLearning);
 if(a.experienceLearning.ok){
  assert.ok(Math.abs(Number(a.experienceLearning.buyAdjustment)||0)<=5);
  assert.ok(Math.abs(Number(a.experienceLearning.sellAdjustment)||0)<=5);
  assert.match(a.experienceLearning.disclaimer,/not win probability/i);
  assert.match(a.experienceLearning.sampleDefinition,/NOT an entry simulation/);
 }
 assert.equal(a.aiPolicy.scoreMeaning,"AUDITABLE_CONFLUENCE_NOT_WIN_PROBABILITY");
});
