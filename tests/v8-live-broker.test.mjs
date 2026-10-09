// Real-market smoke test: fetch only PUBLIC, READ-ONLY Cloudflare proxy endpoints.
// This exercises current Vantage broker candles with the proposed Fund104
// staging module without exposing bridge credentials or modifying Production.
import test from "node:test";
import assert from "node:assert/strict";
import {runFund104} from "../api/_indicatorFund104.js";
import {LIVE_BASE as BASE} from "./_liveBase.mjs";
const SYM="XAUUSD247";
const expectLive=process.env.GOLDFLOW_LIVE_SMOKE==="1";

async function brokerBars(tf){
  const u=BASE+"/api/bars?symbol="+SYM+"&tf="+tf+"&limit=500&t="+Date.now();
  const res=await fetch(u,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(48000),cache:"no-store"});
  assert.equal(res.status,200,tf+" HTTP");
  const p=await res.json();
  assert.equal(p.ok,true,tf+" response: "+String(p.error||""));
  assert.equal(p.symbol,SYM,tf+" exact Vantage symbol");
  assert.equal(p.tf,tf);
  assert.ok(Array.isArray(p.bars)&&p.bars.length>=260,tf+" closed+forming candles");
  assert.ok(Number.isFinite(p.bid)&&p.bid>0&&Number.isFinite(p.ask)&&p.ask>=p.bid,tf+" live quote");
  const b=p.bars;
  for(let i=0;i<b.length;i++){
    const q=b[i];
    assert.ok([q.t,q.o,q.h,q.l,q.c].every(v=>Number.isFinite(Number(v))),tf+" finite OHLC");
    assert.ok(q.h>=Math.max(q.o,q.c)&&q.l<=Math.min(q.o,q.c)&&q.h>=q.l,tf+" OHLC shape");
    if(i>0)assert.ok(Number(q.t)>Number(b[i-1].t),tf+" strictly increasing broker bars");
  }
  console.log(tf+" fetched "+b.length+" Vantage OHLC; last timestamp "+b.at(-1).t+"; bid/ask "+p.bid+"/"+p.ask);
  return p;
}
test("Cloudflare History endpoint never falls through to HTML",{timeout:70000},async()=>{
  const u=BASE+"/api/history?symbol="+SYM+"&tf=M15&indicator=105&limit=5&t="+Date.now();
  const res=await fetch(u,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(65000),cache:"no-store"});
  const ct=String(res.headers.get("content-type")||"").toLowerCase();
  const txt=await res.text();
  assert.match(ct,/application\/json/,"History endpoint must always return JSON content-type");
  assert.ok(!/^\s*<!doctype|^\s*<html/i.test(txt),"History endpoint must never return app-shell/Cloudflare HTML");
  const body=JSON.parse(txt);
  assert.equal(typeof body.ok,"boolean");
  if(body.ok===false)assert.ok(body.error,"Fail-closed History response must explain the broker/API error");
});

test("Fund104 staging processes live Vantage XAUUSD247 M5/H1/H4 without fabricated outcomes",{skip:!expectLive,timeout:170000},async()=>{
  const healthResponse=await fetch(BASE+"/api/bridge-health?t="+Date.now(),{signal:AbortSignal.timeout(22000),cache:"no-store"});
  const health=await healthResponse.json();
  assert.equal(health.online,true,"Named Tunnel must be currently MT5 LIVE");
  assert.equal(health.broker,"Vantage");
  assert.equal(health.bridgeRoute,"PERMANENT_NAMED_TUNNEL");
  const [m5,h1,h4]=await Promise.all(["M5","H1","H4"].map(brokerBars));
  const params={triggerBars:m5.bars,setupBars:h1.bars,biasBars:h4.bars,triggerTF:"M5",setupTF:"H1",biasTF:"H4",symbol:SYM,point:m5.point};
  const r=runFund104(params);
  assert.equal(r.ready,true,String(r.error||"not ready"));
  assert.equal(r.symbol,SYM);
  assert.match(r.engine,/WEB STUDY SUBSET/);
  assert.equal(r.profile.triggerTF,"M5");
  assert.ok(r.limitations.includes("A_PLUS_PLUS_DISABLED"));
  assert.ok(r.history.every(x=>x.tp1===null&&x.tp2===null&&x.grade!=="A++"&&x.time<m5.bars.at(-1).t));
  assert.equal(r.stats.wins,0,"no synthetic wins");
  assert.equal(r.stats.losses,0,"no synthetic losses");
  const altered=[...m5.bars],last=altered.at(-1);
  altered[altered.length-1]={...last,o:last.o,c:last.c+999,h:last.h+1000,l:Math.max(.01,last.l-1000)};
  const stable=runFund104({...params,triggerBars:altered});
  assert.deepEqual(stable.history,r.history,"last forming M5 candle cannot affect history");
  assert.deepEqual(stable.latestSignal,r.latestSignal,"last forming M5 candle cannot affect current confirmed signal");
  const changedH1=[...h1.bars],changedH4=[...h4.bars];
  changedH1[changedH1.length-1]={...changedH1.at(-1),c:changedH1.at(-1).c+1000};
  changedH4[changedH4.length-1]={...changedH4.at(-1),c:changedH4.at(-1).c-1000};
  const unchanged=runFund104({...params,setupBars:changedH1,biasBars:changedH4});
  assert.deepEqual(unchanged.latestSignal,r.latestSignal,"last forming H1/H4 bars must not look ahead");
  console.log(JSON.stringify({vantage:true,symbol:SYM,profile:r.profile,historyCount:r.history.length,lastSignal:r.latestSignal?.code,grade:r.latestSignal?.grade,limits:r.limitations}));
});
