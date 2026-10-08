import test from "node:test";
import assert from "node:assert/strict";
import {buildDynamicTradePlan,applyDynamicPlanToSignal,UNIVERSAL_MANAGEMENT} from "../api/_dynamicTradeManagement.js";

function bars(n=90){
  const out=[];
  for(let i=0;i<n;i++){
    const wave=Math.sin(i/4)*2,base=100+wave+i*.03;
    out.push({t:1000+i*300,o:base-.15,h:base+.7,l:base-.7,c:base+.15});
  }
  return out;
}
function sig(extra={}){
  return {time:1000+60*300,direction:1,code:"B",status:"VALID",entry:102,
    invalidation:96,tp1:105,tp2:108,tp3:111,
    zone:{low:100.4,high:101.5,source:"DEMAND"},...extra};
}

test("universal BE and trailing policy matches approved settings",()=>{
  assert.deepEqual(UNIVERSAL_MANAGEMENT,{
    beTriggerR:.50,beLockR:.05,trailTriggerR:.75,trailDistanceR:.35,
    policy:"GOLDFLOW_DYNAMIC_ATR_STRUCTURE_CLOSED_OHLC_CONSERVATIVE"
  });
});

test("PVT v1.02 fixed-point native stop/targets are replaced by dynamic ATR + structure plan",()=>{
  const s=sig({invalidation:96,tp1:102.3,tp2:102.6,tp3:102.9});
  const p=buildDynamicTradePlan({signal:s,bars:bars(),tf:"M5",mode:"pvt102",point:.01});
  assert.equal(p.valid,true);
  assert.notEqual(p.sl,96);
  assert.notEqual(p.tp1,102.3);
  assert.match(p.origin,/PVT_102/);
  assert.match(p.stopSource,/ZONE|PIVOT|CANDLE/);
  assert.equal(p.management.beTriggerR,.5);
  assert.equal(p.management.trailTriggerR,.75);
});

test("future candles cannot change a historical plan",()=>{
  const a=bars(),s=sig();
  const p1=buildDynamicTradePlan({signal:s,bars:a,tf:"M5",mode:"snd107",point:.01});
  const mutated=a.map((x,i)=>i>60?{...x,h:x.h+100,l:x.l-100,c:x.c+50}:x);
  const p2=buildDynamicTradePlan({signal:s,bars:mutated,tf:"M5",mode:"snd107",point:.01});
  assert.deepEqual(
    {sl:p1.sl,tp1:p1.tp1,tp2:p1.tp2,tp3:p1.tp3,origin:p1.origin},
    {sl:p2.sl,tp1:p2.tp1,tp2:p2.tp2,tp3:p2.tp3,origin:p2.origin}
  );
});

test("all legacy indicator profiles produce complete dynamic plans from their own valid setup geometry",()=>{
  const a=bars();
  for(const mode of ["105","103","owl101","pvt102","pvtchart101","pattern132","snd107","fund104"]){
    const p=buildDynamicTradePlan({signal:sig(),bars:a,tf:"M5",mode,point:.01});
    assert.equal(p.valid,true,mode);
    for(const k of ["entry","sl","tp1","tp2","tp3","risk","atr"])assert.equal(Number.isFinite(Number(p[k])),true,mode+" "+k);
    assert.equal(p.direction,1);
    assert.ok(p.sl<p.entry,mode+" stop direction");
    assert.ok(p.tp1>p.entry&&p.tp2>p.tp1&&p.tp3>p.tp2,mode+" targets");
  }
});

test("live overlay keeps native signal auditable while exposing managed geometry",()=>{
  const native=sig({tp1:null,tp2:null,tp3:null});
  const x=applyDynamicPlanToSignal(native,bars(),"M5","pattern132",.01);
  assert.equal(x.plan.valid,true);
  assert.notEqual(x.signal.invalidation,null);
  assert.ok(x.signal.tp1>x.signal.entry);
  assert.ok(x.signal.reasons.includes("GOLDFLOW DYNAMIC ATR + STRUCTURE MANAGEMENT"));
});

test("locked forward plan is never recalculated",()=>{
  const s=sig({lockedTradePlan:true,invalidation:95,tp1:106,tp2:110,tp3:115});
  const p=buildDynamicTradePlan({signal:s,bars:bars(),tf:"M5",mode:"gf-news",point:.01});
  assert.equal(p.origin,"LOCKED_ALREADY_DYNAMIC_PLAN");
  assert.equal(p.sl,95);assert.equal(p.tp1,106);assert.equal(p.tp2,110);assert.equal(p.tp3,115);
});
