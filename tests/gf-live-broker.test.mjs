// Read-only cross-check of staging GF engine against REAL public Vantage broker proxy.
// Runs from GitHub Actions; never writes Production, never touches orders or bridge secrets.
import test from "node:test";
import assert from "node:assert/strict";
import {evaluateStudy,normalizedClosedBars} from "../api/_studyEngine.js";
const BASE="https://goldflow-intelligence.vercel.app",OFFSET=10800;
async function read(path,timeout=90000){
 const response=await fetch(BASE+path+(path.includes("?")?"&":"?")+"t="+Date.now(),
  {headers:{Accept:"application/json"},signal:AbortSignal.timeout(timeout),cache:"no-store"});
 assert.equal(response.status,200,path+" HTTP");
 const j=await response.json();
 assert.equal(j.ok,true,path+" payload: "+String(j.error||"unknown"));
 return j;
}
async function bars(symbol,tf){
 const j=await read("/api/bars?symbol="+symbol+"&tf="+tf+"&limit=150",60000);
 assert.equal(j.symbol,symbol,"Exact requested Vantage symbol must resolve, not an alias");
 assert.ok(j.bars.length>=50,tf+" OHLC samples");
 for(let i=0;i<j.bars.length;i++){
  const b=j.bars[i];
  assert.ok([b.t,b.o,b.h,b.l,b.c].every(v=>Number.isFinite(Number(v))),tf+" finite OHLC");
  assert.ok(b.h>=Math.max(b.o,b.c,b.l)&&b.l<=Math.min(b.o,b.c),tf+" valid OHLC");
  if(i>0)assert.ok(b.t>j.bars[i-1].t,tf+" ascending time");
 }
 return j;
}
const active=process.env.GF_LIVE_SMOKE==="1";
test("GF-AI on actual XAUUSD247 closed M15, H1/H4, 16/16 official macro and Vantage tick",
 {skip:!active,timeout:270000},async()=>{
 const h=await read("/api/bridge-health",25000);
 assert.equal(h.online,true,"MT5 must currently be live");
 assert.equal(h.bridgeRoute,"PERMANENT_NAMED_TUNNEL");
 const [m15,h1,h4,macro]=await Promise.all([
  bars("XAUUSD247","M15"),bars("XAUUSD247","H1"),bars("XAUUSD247","H4"),read("/api/macro",100000)
 ]);
 const officialReady=macro.quality.total===16&&macro.quality.available===16&&
  Array.isArray(macro.quality.errors)&&macro.quality.errors.length===0&&
  Array.isArray(macro.quality.stale)&&macro.quality.stale.length===0;
 assert.equal(macro.quality.total,16,"Stable 16-card schema must remain");
 if(process.env.GF_RELEASE_GATE==="1")assert.equal(officialReady,true,"RELEASE BLOCKED: macro primary sources must be 16/16 error-free and non-stale");
 const now=Math.floor(Date.now()/1000);
 const args={symbol:"XAUUSD247",tf:"M15",bars:m15.bars,h1:h1.bars,h4:h4.bars,
  quote:{bid:m15.bid,ask:m15.ask,tickTime:m15.serverTime,observedAt:now},macro,offsetSeconds:OFFSET,nowSec:now,mode:"ai"};
 const result=evaluateStudy(args);
 assert.equal(result.ok,true);
 if(result.status==="MARKET_OFFLINE"){
  // On Saturday/Sunday the MT5 *terminal* may be LIVE while XAUUSD247 is CLOSED.
  // An old Friday gold tick must fail closed, not incorrectly fail the safety test.
  assert.equal(result.canEnter,false,"A closed Gold market cannot have an entry-ready signal");
  console.log("GF-GOLD-MARKET-CLOSED: "+String(result.reason||"STALE_GOLD_TICK"));
 }else if(officialReady)assert.notEqual(result.status,"DATA_UNVERIFIED",result.reason);
 else {
  assert.equal(result.status,"DATA_UNVERIFIED","GF-AI MUST fail closed when primary macro sources temporarily degrade");
  assert.equal(result.reason,"OFFICIAL_MACRO_INCOMPLETE_OR_STALE");
  assert.equal(result.canEnter,false,"No synthetic READY while macro degraded");
 }
 if(!officialReady)console.log("GF-RELEASE-BLOCKER: official macro quality "+macro.quality.available+"/16; source errors "+JSON.stringify(macro.quality.errors||[]));
 assert.ok(normalizedClosedBars(m15.bars,"M15",now,OFFSET).length>=40);
 assert.ok(result.canEnter?["BUY_ENTRY_READY","SELL_ENTRY_READY"].includes(result.status):true);
 assert.equal(result.isExecutedTrade,false);
 const last=m15.bars.at(-1),modified=structuredClone(m15.bars);
 if(last.t-OFFSET+900>now){
  modified.at(-1).c+=500;
  modified.at(-1).h=Math.max(modified.at(-1).h,modified.at(-1).c+1);
  const unchanged=evaluateStudy({...args,bars:modified});
  assert.deepEqual(unchanged.confirmation,result.confirmation,"Forming bar must not change a closed signal");
  assert.equal(unchanged.isExecutedTrade,false);
  if(["COMPLETED_STUDY","BUY_INVALID","SELL_INVALID","AMBIGUOUS_PATH"].includes(unchanged.status))assert.equal(unchanged.canEnter,false,"Forming bar extremes may invalidate but cannot form a new trade");
 }
 console.log("GF-LIVE-GOLD "+JSON.stringify({status:result.status,canEnter:result.canEnter,closed:result.closedCandleCount,
  quoteAgeSeconds:result.quoteAgeSeconds,macro:macro.quality.available+"/"+macro.quality.total}));
});
test("GF MARKET STUDY on LIVE weekend BTCUSD, no fabricated order", {skip:!active,timeout:150000},async()=>{
 // Production Study/Chart paths intentionally pace broker work. Do not create an
 // artificial three-request burst against the single local MT5 terminal/tunnel.
 const m5=await bars("BTCUSD","M5");
 const h1=await bars("BTCUSD","H1");
 const h4=await bars("BTCUSD","H4");
 const now=Math.floor(Date.now()/1000);
 const d=evaluateStudy({symbol:"BTCUSD",tf:"M5",bars:m5.bars,h1:h1.bars,h4:h4.bars,
  quote:{bid:m5.bid,ask:m5.ask,tickTime:m5.serverTime,observedAt:now},offsetSeconds:OFFSET,nowSec:now,mode:"study"});
 assert.equal(d.ok,true);assert.notEqual(d.status,"DATA_UNVERIFIED",d.reason);
 assert.notEqual(d.status,"MARKET_OFFLINE",d.reason);
 assert.equal(d.isExecutedTrade,false);
 console.log("GF-LIVE-BTCUSD "+JSON.stringify({status:d.status,canEnter:d.canEnter,closed:d.closedCandleCount}));
});
