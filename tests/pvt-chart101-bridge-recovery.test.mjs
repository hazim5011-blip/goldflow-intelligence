import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runPVTChart101} from "../api/_indicatorPVTChart101.js";
import {buildHistory,metadataFromCatalog} from "../api/_v8Core.js";

const bar=(t,o,h,l,c,v=100)=>({t,o,h,l,c,v});
function gen(n=260){
  const out=[];
  for(let i=0;i<n;i++){
    const c=4100+i*.08+Math.sin(i/5)*1.4,o=c-.15,h=Math.max(o,c)+.55,l=Math.min(o,c)-.60;
    out.push(bar(1700000000+i*300,o,h,l,c,100+i%31));
  }
  return out;
}

test("PVT Chart Confluence v1.01 is an independent selected-TF MQ5 source port",()=>{
  const bars=gen(300);
  const a=runPVTChart101({triggerBars:bars,triggerTF:"M5",symbol:"XAUUSD247",point:.01});
  assert.equal(a.ready,true);
  assert.match(a.engine,/PVT_Chart_Confluence_XAU_v1\.01/);
  assert.equal(a.profile.triggerTF,"M5");
  assert.equal(a.profile.setupTF,"M5");
  assert.equal(a.profile.biasTF,"M5");
  assert.equal(a.sourceAudit.closedCandleSignals,true);
  assert.equal(a.sourceAudit.nextBarContinuation,true);
  assert.equal(a.sourceAudit.scoreIsProbability,false);
  assert.equal(a.sourceAudit.management.tp1R,1);
  assert.equal(a.sourceAudit.management.tp2R,1.8);
  assert.equal(a.sourceAudit.management.tp3R,3);
  assert.equal(a.sourceAudit.management.trailStartTP1,1);
  assert.equal(a.sourceAudit.management.trailDistanceTP1,.5);
  const forming=bars.slice();forming[forming.length-1]={...forming.at(-1),o:1,h:99999,l:1,c:99999,v:99999};
  const b=runPVTChart101({triggerBars:forming,triggerTF:"M5",symbol:"XAUUSD247",point:.01});
  assert.deepEqual(b.history,a.history,"forming candle must not rewrite closed-candle history");
});

test("History Pro uses Dynamic ATR + Structure for PVT Chart while retaining native MQ5 plan in audit",()=>{
  const spec=metadataFromCatalog({name:"XAUUSD247",category:"METALS",digits:2,point:.01,currencyProfit:"USD",contractSize:100,volumeMin:.01,volumeStep:.01},"XAUUSD247","XAUUSD247");
  const t0=1700000000;
  const bars=Array.from({length:24},(_,i)=>bar(t0+i*300,100,101,99,100));
  const raw={time:t0+20*300,closeTime:t0+21*300,direction:1,code:"B",score:85,entry:100,invalidation:90,tp1:110,tp2:118,tp3:130,
    nativeOutcome:"TP3",status:"TP3",exitPrice:130,exitTime:t0+23*300,reasons:["TEST"]};
  // Future closed candle reaches the managed TP1. Native TP1/TP2/TP3 remain
  // visible in nativePlan for audit but do not force a native-outcome shortcut.
  bars[21]=bar(t0+21*300,100,111,99,108);
  const rows=buildHistory([raw],bars,{
    requested:"XAUUSD247",resolved:"XAUUSD247",tf:"M5",indicator:"pvtchart101",spec,brokerServerUTCOffsetSeconds:0
  });
  const row=rows[0];
  assert.equal(row.outcome,"TP1");
  assert.equal(row.priceMove,10);
  assert.equal(row.rMultiple,1);
  assert.equal(row.planOrigin,"GOLDFLOW_DYNAMIC_ATR_STRUCTURE_PVT_CHART_101");
  assert.equal(row.managementPlan.trailTriggerR,.75);
  assert.equal(row.managementPlan.trailDistanceR,.35);
  assert.deepEqual(row.nativePlan,{entry:100,sl:90,tp1:110,tp2:118,tp3:130});
  assert.ok(row.dataQuality.includes("PVT101_NATIVE_PLAN_RETAINED_IN_AUDIT_ONLY"));
  assert.ok(row.dataQuality.includes("GOLDFLOW_DYNAMIC_ATR_STRUCTURE_MANAGED_PLAN"));
});

test("UI exposes both uploaded indicator sources without duplicating protected Pattern engine",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
  const v8=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
  const pattern=readFileSync(new URL("../api/_indicatorPattern132.js",import.meta.url),"utf8");
  assert.ok(html.includes('value="pvtchart101"'));
  assert.ok(html.includes("PVT Chart Confluence XAU v1.01 • MQ5 Source"));
  assert.ok(html.includes("Pattern Zone Tutor v1.32 • MQ5 Verified"));
  assert.ok(app.includes('"pvtchart101":"PVT CHART CONFLUENCE 1.01"'));
  assert.ok(v8.includes('{id:"pvtchart101"'));
  assert.ok(pattern.includes("Bullish Engulfing"));
  assert.ok(pattern.includes("RBS Retest"));
  assert.ok(pattern.includes("SBR Retest"));
  assert.ok(pattern.includes("Bull Flag Breakout"));
  assert.ok(pattern.includes("minZonePressure:5.8"));
});

test("Bridge transport errors are fail-closed, readable, and History comparison no longer hammers origin concurrently",()=>{
  const broker=readFileSync(new URL("../api/_broker.js",import.meta.url),"utf8");
  const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
  const health=readFileSync(new URL("../api/bridge-health.js",import.meta.url),"utf8");
  const v8=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
  assert.ok(broker.includes("BRIDGE_TIMEOUT"));
  assert.ok(broker.includes("BRIDGE_TUNNEL_ORIGIN_UNAVAILABLE"));
  assert.ok(app.includes("NO BROKER DATA"));
  assert.ok(app.includes("NO VERIFIED DATA"));
  assert.ok(app.includes("BRIDGE TUNNEL OFFLINE"));
  assert.ok(health.includes('brokerGet("/health",{},8000,2)'));
  assert.ok(v8.includes("mapLimit(HISTORY_IDS,1"));
});
