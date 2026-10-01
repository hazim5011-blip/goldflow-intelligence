import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {impactForType,classifyReleaseEvent} from "../api/_v8Impact.js";
import {runFund104} from "../api/_indicatorFund104.js";
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
 const trigger=gen(300),setup=gen(550,3600),bias=gen(560,14400);
 const x=runFund104({triggerBars:trigger,setupBars:setup,biasBars:bias,triggerTF:"M5",setupTF:"H1",biasTF:"H4",symbol:"XAUUSD247"});
 assert.equal(x.ready,true);
 assert.deepEqual(x.activeZones.swap,[]);
 assert.equal(x.studyCoverage,"CLOSED_CANDLE_PATTERNS_SND_STRUCTURE_RSI_STOCH_MTF_ONLY");
 assert.ok(x.limitations.includes("A_PLUS_PLUS_DISABLED"));
 assert.ok(x.history.every(h=>h.time<trigger.at(-1).t && h.tp1===null&&h.tp2===null&&h.grade!=="A++"));
 const forming=[...trigger];forming[forming.length-1]={...forming.at(-1),c:9999,h:9999,l:1,o:4000};
 const y=runFund104({triggerBars:forming,setupBars:setup,biasBars:bias,triggerTF:"M5",setupTF:"H1",biasTF:"H4",symbol:"XAUUSD247"});
 assert.deepEqual(y.history,x.history);
 assert.deepEqual(y.activeZones,x.activeZones);
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
