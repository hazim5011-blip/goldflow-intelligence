import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {impactForType,classifyReleaseEvent} from "../api/_v8Impact.js";
import {runFund104,fund104InvalidatedByClosedBars,fund104InvalidationAtByClosedBars,fund104WilderRSI} from "../api/_indicatorFund104.js";
import {replayOutcome} from "../api/_v8Core.js";

const source = p=>readFileSync(new URL(p,import.meta.url),"utf8");
const bar=(t,o,h,l,c,v=100)=>({t,o,h,l,c,v});
const gen=(n=260,secs=300)=>{
 const a=[];for(let i=0;i<n;i++){const mid=4100+i*.11+Math.sin(i*.2)*1.8,open=mid-.08,close=mid+.1; a.push(bar(1700000000+i*secs,open,mid+.6,mid-.7,close,100+i%40))}
 return a;
};
test("impact categories are explicitly potential, not realized market moves",()=>{
 assert.equal(impactForType("CPI").impact,"HIGH");
 assert.equal(impactForType("PAYEMS").impact,"HIGH");
 assert.equal(impactForType("IP").impact,"MEDIUM");
 assert.equal(impactForType("ONRRP").impact,"LOW");
 assert.equal(impactForType("US10Y").impact,"CONTEXT");
 assert.equal(impactForType("unknown").realizedImpactMeasured,false);
 assert.equal(classifyReleaseEvent({type:"CPI",verifiedReleaseTimestamp:false}).newsTimingVerified,false);
});
test("Fund104 is ready for clean broker window and excludes last forming candle",()=>{
 const trigger=gen(300),end=trigger.at(-1).t;
 const setup=gen(550,3600).map((b,i)=>({...b,t:end-(550-1-i)*3600}));
 const bias=gen(560,14400).map((b,i)=>({...b,t:end-(560-1-i)*14400}));
 const x=runFund104({triggerBars:trigger,setupBars:setup,biasBars:bias,triggerTF:"M5",setupTF:"H1",biasTF:"H4",symbol:"XAUUSD247"});
 assert.equal(x.ready,true);
 assert.deepEqual(x.activeZones.swap,[]);
 assert.equal(x.studyCoverage,"CLOSED_CANDLE_PATTERNS_SND_STRUCTURE_RSI_STOCH_MTF_ONLY");
 assert.ok(x.limitations.includes("A_PLUS_PLUS_DISABLED"));
 assert.ok(x.history.every(h=>h.time<trigger.at(-1).t && h.tp1===null&&h.tp2===null&&h.grade!=="A++"));
 if(x.latestSignal.code!=="WAIT") assert.ok(x.latestSignal.time>=trigger.at(-5).t);
 const forming=[...trigger];forming[forming.length-1]={...forming.at(-1),c:9999,h:9999,l:1,o:4000};
 const y=runFund104({triggerBars:forming,setupBars:setup,biasBars:bias,triggerTF:"M5",setupTF:"H1",biasTF:"H4",symbol:"XAUUSD247"});
 assert.deepEqual(y.history,x.history);
 assert.deepEqual(y.activeZones,x.activeZones);
 // The last higher-timeframe bar is still forming at trigger close; changing it
 // must not alter current or historical signal calculations (no MTF lookahead).
 const futureSetup=setup.slice();futureSetup[futureSetup.length-1]={...futureSetup.at(-1),c:999999};
 const futureBias=bias.slice();futureBias[futureBias.length-1]={...futureBias.at(-1),c:1};
 const z=runFund104({triggerBars:trigger,setupBars:futureSetup,biasBars:futureBias,triggerTF:"M5",setupTF:"H1",biasTF:"H4",symbol:"XAUUSD247"});
 assert.deepEqual(z.history,x.history);
 assert.deepEqual(z.latestSignal,x.latestSignal);
});
test("Fund104 does not claim broker trade outcomes or retrospective TP/SL",()=>{
 const h=source("../api/_v8Core.js");
 assert.ok(h.includes('"fund104"'));
 const rec={time:1700000000,closeTime:1700000300,direction:1,entry:4100,invalidation:4090,tp1:null};
 const bars=[bar(1700000000,4100,4103,4099,4102),bar(1700000300,4102,4110,4080,4090)];
 const outcome=replayOutcome(rec,bars,"M5","fund104");
 assert.equal(outcome.outcome,"VALID_ONLY");
});
test("Blog has valid articles with non-fabricated release provenance",()=>{
 const j=JSON.parse(source("../blog/posts.json"));
 assert.ok(j.posts.length>=3);
 assert.ok(j.posts.every(p=>p.published&&p.dateUTC&&p.titleMS&&p.titleEN&&p.qualityNote));
});
test("Pending zones have no broker-order action; button is chart-view only",()=>{
 const a=source("../app.js"),markup=source("../index.html");
 assert.ok(a.includes('var action=st.live?'));
 assert.ok(a.includes('LIVE TRADE • VIEW CHART'));
 assert.ok(a.includes('lastLiveTick=null;'));
 assert.ok(markup.includes('No automatic trade execution'));
 assert.ok(markup.includes('data-page="blogPage"'));
 assert.ok(markup.includes('value="fund104"'));
});


test("Fund104 default invalidation follows later CLOSED candle, not wick-only touches",()=>{
 const closed=[
  bar(1000,100,101,99,100),
  bar(1300,100,101.5,98.9,99.8),
  bar(1600,99.8,100,98.7,98.8)
 ];
 // ATR of signal bar at t=1000 is 2, so BUY invalid threshold=98.9.
 assert.equal(fund104InvalidatedByClosedBars(closed.slice(0,2),{time:1000,direction:1}),false,"wick touch alone cannot invalidate default closed-candle mode");
 assert.equal(fund104InvalidatedByClosedBars(closed,{time:1000,direction:1}),true);
 assert.equal(fund104InvalidationAtByClosedBars(closed,{time:1000,direction:1}),1600);
 const sells=[
  bar(1000,100,101,99,100),
  bar(1300,100,101.5,99,100.4),
  bar(1600,101,102.5,100,102)
 ];
 assert.equal(fund104InvalidatedByClosedBars(sells.slice(0,2),{time:1000,direction:-1}),false);
 assert.equal(fund104InvalidatedByClosedBars(sells,{time:1000,direction:-1}),true);
});
test("Full API routes to Fund104; LIVE lite tick refuses stale or mismatched symbols",async()=>{
 process.env.BROKER_BRIDGE_URL="https://bridge.hazim5011.com";
 process.env.BROKER_BRIDGE_KEY="test-key-not-a-real-credential";
 const realFetch=global.fetch;
 const {default:statusHandler}=await import("../api/status.js");
 const {default:analysisHandler}=await import("../api/analyze.js");
 const api=(fn,q)=>new Promise(async(resolve,reject)=>{
  let status=200;
  const res={setHeader(){return this},status(c){status=c;return this},json(o){resolve({status,body:o});return this},end(){resolve({status});return this}};
  try{await fn({method:"GET",query:q},res)}catch(e){reject(e)}
 });
 let mockedTime=Math.floor(Date.now()/1000);
 global.fetch=async url=>{
  const u=new URL(String(url));
  let payload={};
  if(u.pathname==="/snapshot"){
   payload={ok:true,ts:mockedTime,data:{XAUUSD247:{symbol:"XAUUSD247",bid:4200,ask:4200.2,time:mockedTime,digits:2}}};
  }else if(u.pathname==="/multi-bars"){
   const frames={};for(const tf of u.searchParams.get("tfs").split(",")){
    const period={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400}[tf]||300;
    const n=tf==="M5"?350:tf==="H1"?500:550;
    frames[tf]=gen(n,period);
   }
   payload={ok:true,symbol:"XAUUSD247",broker:"Vantage",server:"Mock Test",bid:4200,ask:4200.2,
     digits:2,point:.01,serverTime:mockedTime,frames};
  }else throw Error("Unexpected mock route "+u.pathname);
  return {ok:true,status:200,text:async()=>JSON.stringify(payload),json:async()=>payload};
 };
 try{
  const tick=await api(statusHandler,{lite:"1",pair:"XAUUSD247"});
  assert.equal(tick.body.bridgeOnline,true);
  assert.equal(tick.body.ask,4200.2);
  mockedTime-=65;
  const stale=await api(statusHandler,{lite:"1",pair:"XAUUSD247"});
  assert.equal(stale.body.bridgeOnline,false);
  assert.equal(stale.body.status,"QUOTE_STALE_OR_INVALID");
  const wrong=await api(statusHandler,{lite:"1",pair:"EURUSD"});
  assert.equal(wrong.body.bridgeOnline,false,"NEVER use XAUUSD247 tick for requested EURUSD");
  mockedTime=Math.floor(Date.now()/1000);
  const analyzed=await api(analysisHandler,{symbol:"XAUUSD247",tf:"M5",indicator:"fund104"});
  assert.equal(analyzed.body.ok,true);
  assert.equal(analyzed.body.ready,true);
  assert.equal(analyzed.body.indicatorMode,"fund104");
  assert.match(analyzed.body.indicator.engine,/WEB STUDY/);
  assert.ok(analyzed.body.indicator.history.every(x=>x.tp1===null&&x.tp2===null));
 }finally{global.fetch=realFetch}
});


test("Fund104 RSI is Wilder-smoothed, not a 14-candle moving average",()=>{
 const closes=Array.from({length:16},(_,i)=>({c:i<15?100+i:113}));
 assert.equal(fund104WilderRSI(closes,13),null);
 assert.equal(fund104WilderRSI(closes,14),100);
 // After 14 gains of 1, one loss of 1 yields 13/14 gain and 1/14 loss.
 assert.ok(Math.abs(fund104WilderRSI(closes,15)-92.85714285714286)<.000001);
});

test("Browser zone-state math uses BUY ASK, SELL BID and expires old quotes",()=>{
 const src=source("../app.js"),a=src.indexOf("function quoteForZone("),b=src.indexOf("function renderZones(",a);
 assert.ok(a>0&&b>a);
 const context=vm.createContext({finite:v=>v!==null&&v!==undefined&&Number.isFinite(Number(v)),Number,Date,Math});
 vm.runInContext(src.slice(a,b),context);
 const quote={bid:100.5,ask:101.2,seenAtMs:Date.now()};
 const z={low:100,high:101};
 assert.equal(context.zoneEntryState(z,1,quote).label,"PENDING","BUY requires ASK to be inside");
 assert.equal(context.zoneEntryState(z,-1,quote).label,"LIVE ENTRY","SELL uses BID");
 const freshBuy={...quote,ask:100.9};
 assert.equal(context.zoneEntryState(z,1,freshBuy).label,"LIVE ENTRY");
 assert.equal(context.zoneEntryState(z,1,{...freshBuy,seenAtMs:Date.now()-20000}).label,"QUOTE OFFLINE");
 assert.equal(context.zoneEntryState(z,-1,null).live,false);
});

test("Fund104 audit retains later invalidated studies without claiming trade wins",()=>{
 const trigger=gen(420);
 const setup=gen(600,3600).map((b,i)=>({...b,t:trigger.at(-1).t-(599-i)*3600}));
 const bias=gen(600,14400).map((b,i)=>({...b,t:trigger.at(-1).t-(599-i)*14400}));
 const study=runFund104({triggerBars:trigger,setupBars:setup,biasBars:bias,symbol:"XAUUSD247"});
 assert.equal(study.ready,true);
 assert.ok(study.studyDiagnostics.studyWindowBars>0);
 assert.ok(study.studyDiagnostics.patternCandidates>=study.studyDiagnostics.confirmedAtClose);
 assert.equal(study.studyDiagnostics.confirmedAtClose,study.stats.total);
 assert.equal(study.stats.total,study.stats.validOnly+study.stats.invalidated);
 assert.ok(study.history.every(h=>["WEB_VALIDATION","WEB_INVALIDATED"].includes(h.status)));
 assert.ok(study.history.every(h=>h.tp1===null&&h.tp2===null));
 assert.equal(study.stats.wins,0);
 assert.equal(study.stats.losses,0);
 assert.equal(study.stats.winRate,null);
 if(study.latestSignal.status?.includes("WATCH"))assert.equal(study.latestSignal.confirmed,false);
});
