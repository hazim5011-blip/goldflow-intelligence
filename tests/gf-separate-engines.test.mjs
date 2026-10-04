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
const verified=()=>({
 quality:{available:16,total:16,errors:[],stale:[],strictPrimaryReady:true,secondaryMirror:[],primarySourceHealth:"RECOVERED_OFFICIAL_VIA_LOCAL_BRIDGE"},
 gold:{bias:"SUPPORTIVE",score:74},
 cards:[{id:"CPI",value:3.4,display:"3.4% YoY",date:"2026-08-01",source:"BLS",status:"OFFICIAL"},
  {id:"US10Y",value:5.28,display:"5.28%",date:"2026-10-02",source:"US Treasury",status:"OFFICIAL"}]
});
function fixture(){
 const bars=feed(),last=bars.at(-2),prior=bars.at(-3);
 last.o=prior.c+.15;last.c=prior.h+2.1;last.l=last.o-.23;last.h=last.c+.30;
 const px=last.c+.1;
 return {symbol:"XAUUSD247",tf:"M15",bars,h1:feed(95,3600,.13),h4:feed(95,14400,.13),
  quote:{bid:px,ask:px+.05,tickTime:now+offset,observedAt:now},offsetSeconds:offset,macro:verified(),nowSec:now};
}
test("identical Gold inputs go through genuinely separate engines, methods, entries and target construction",()=>{
 const f=fixture(),a=evaluateAILive(f),s=evaluateMarketStudy(f);
 assert.equal(a.engine,"GF_AI_LIVE_MACRO_MTF_V2");
 assert.equal(s.engine,"GF_MARKET_STRUCTURE_SCENARIO_V2");
 assert.ok(a.confirmation,JSON.stringify({status:a.status,reason:a.reason}));
 assert.ok(s.confirmation,JSON.stringify({status:s.status,reason:s.reason}));
 assert.equal(a.confirmation.entryMethod,"AI_IMPULSE_FIB_0382_TO_0618");
 assert.equal(s.confirmation.entryMethod,"BROKEN_PIVOT_RETEST");
 assert.notEqual(a.confirmation.entryLow,s.confirmation.entryLow);
 assert.notDeepEqual(
  [a.confirmation.entryLow,a.confirmation.entryHigh,a.confirmation.invalidation,a.confirmation.tp1,a.confirmation.tp2,a.confirmation.tp3],
  [s.confirmation.entryLow,s.confirmation.entryHigh,s.confirmation.invalidation,s.confirmation.tp1,s.confirmation.tp2,s.confirmation.tp3]);
 assert.equal(a.macroEvidence.assetSpecific,true);
 assert.equal(s.macroContext.appliedAsGate,false);
 assert.ok(s.structureLevels.support<s.structureLevels.resistance);
 assert.ok(s.projectedTargets?.length===3);
});
test("AI Gold downgrades to verifiable technical-only mode with incomplete 13/16 macro; Market Study remains independent",()=>{
 const f=fixture(),bad={...verified(),quality:{...verified().quality,available:13,strictPrimaryReady:false,errors:["BLS block"]}};
 const a=evaluateAILive({...f,macro:bad});
 const s=evaluateMarketStudy({...f,macro:bad});
 assert.equal(a.researchScope,"TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE");
 assert.notEqual(a.status,"AI_WAIT_VERIFIED_MACRO");
 assert.equal(s.engine,"GF_MARKET_STRUCTURE_SCENARIO_V2");
 assert.equal(s.macroContext.available,false);
 assert.ok(s.structureLevels);
 assert.equal(s.macroContext.appliedAsGate,false);
});
test("AI BTC uses valid technical candles without asserting fake BTC fundamentals",()=>{
 const f=fixture(),r=evaluateAILive({...f,symbol:"BTCUSD",macro:verified()});
 assert.notEqual(r.status,"AI_ASSET_FUNDAMENTAL_UNAVAILABLE");
 assert.equal(r.researchScope,"TECHNICAL_ONLY_FUNDAMENTAL_UNAVAILABLE");
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
 assert.equal(x.modelType,"AUDITABLE_MULTI_FACTOR_RULES_NOT_TRAINED_ML");
});
