import test from "node:test";
import assert from "node:assert/strict";
import {getEffectiveDynamicProfile,buildDynamicTradePlan} from "../api/_dynamicTradeManagement.js";

test("candidate profile override is bounded and symbol-scoped profile machinery preserves defaults",()=>{
  const p=getEffectiveDynamicProfile("pvt102","XAUUSD247",{params:{bufferATR:9,minRiskATR:-4,lookback:999,t1FallbackR:.1}});
  assert.equal(p.bufferATR,.50);
  assert.equal(p.minRiskATR,.15);
  assert.equal(p.lookback,120);
  assert.equal(p.t1FallbackR,.70);
  assert.equal(p.profileKey,"pvt102|XAUUSD247");
});

test("replace candidate starts from default rather than active-profile semantics",()=>{
  const p=getEffectiveDynamicProfile("105","EURUSD",{__replace:true,params:{bufferATR:.12}});
  assert.equal(p.bufferATR,.12);
  assert.equal(p.minRiskATR,.25);
  assert.equal(p.profileSource,"CANDIDATE_REPLACE");
});

test("dynamic plan exposes profile audit metadata",()=>{
  const bars=Array.from({length:80},(_,i)=>({t:1000+i*300,o:100+i*.02,h:101+i*.02,l:99+i*.02,c:100.2+i*.02}));
  const signal={time:1000+55*300,direction:1,entry:101.5,invalidation:99,zone:{low:100,high:101,source:"DEMAND"},status:"VALID"};
  const p=buildDynamicTradePlan({signal,bars,tf:"M5",mode:"snd107",symbol:"XAUUSD247",point:.01,profileOverride:{params:{lookback:52}}});
  assert.equal(p.valid,true);
  assert.equal(p.profileKey,"snd107|XAUUSD247");
  assert.equal(p.profileParams.lookback,52);
  assert.ok(Array.isArray(p.targetSources));
});
