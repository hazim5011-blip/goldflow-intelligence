import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSmartFeatures,assessDataHealth} from "../api/_sqFeatures.js";
import {classifySmartRegime} from "../api/_sqRegime.js";
import {buildDecisionFunnel} from "../api/_sqDecisionFunnel.js";

const bar=(t,o,h,l,c)=>({t,o,h,l,c,v:100});
function trendBars(n=140,dir=1){
  const out=[];for(let i=0;i<n;i++){
    const mid=4100+dir*i*.18;
    out.push(bar(1700000000+i*300,mid-.06,mid+.42,mid-.38,mid+.10*dir));
  }
  // final bar is forming and must be ignored by feature calculations.
  out.push(bar(1700000000+n*300,9999,10000,1,2));
  return out;
}
function analysis(direction=1){
  return {
    ok:true,ready:true,requested:"XAUUSD247",symbol:"XAUUSD247",marketState:"MT5_LIVE",price:4125,
    tick:{bid:4125,ask:4125.2,spread:.2},chartBars:trendBars(160,direction),
    indicator:{
      latestSignal:{code:direction>0?"BUY":"SELL",direction,score:82,entry:4125,invalidation:direction>0?4118:4132,tp1:direction>0?4134:4116,reasons:["TEST"]},
      setupState:{trend:direction,strength:78},biasState:{trend:direction,strength:74},
      activeZones:{buy:direction>0?[{low:4123,high:4126,sourceEvent:"DEMAND"}]:[],sell:direction<0?[{low:4124,high:4127,sourceEvent:"SUPPLY"}]:[]}
    }
  };
}
const macro=(bias="SUPPORTIVE")=>({ok:true,gold:{bias,score:bias==="SUPPORTIVE"?66:34},quality:{fresh:12,total:15},regime:{name:"GOLDILOCKS"}});

test("Smart features use closed candles only and ignore forming-candle corruption",()=>{
  const a=analysis(1);
  const f1=buildSmartFeatures(a);
  a.chartBars[a.chartBars.length-1]={...a.chartBars.at(-1),o:1,h:99999,l:-99999,c:77777};
  const f2=buildSmartFeatures(a);
  assert.equal(f1.ready,true);
  assert.equal(f1.closedBars,160);
  assert.equal(f2.atr14,f1.atr14);
  assert.equal(f2.ema20,f1.ema20);
  assert.equal(f2.lastClose,f1.lastClose);
});

test("Bull trend regime is directional and confidence is explicitly not win probability",()=>{
  const a=analysis(1),f=buildSmartFeatures(a),r=classifySmartRegime(f,a);
  assert.ok(["TREND_BULL","BREAKOUT_EXPANSION","LIQUIDITY_SWEEP"].includes(r.name),r.name);
  assert.equal(r.direction,1);
  assert.match(r.confidenceMeaning,/NOT_WIN_PROBABILITY/);
  assert.ok(r.confidence<=95);
});

test("Data health hard-blocks stale broker state",()=>{
  const a=analysis(1),f=buildSmartFeatures(a);
  a.marketState="MT5_STALE";
  const h=assessDataHealth(a,macro(),f);
  assert.equal(h.hardBlock,true);
  assert.equal(h.status,"BAD");
  assert.ok(h.checks.some(x=>x.id==="BROKER_FRESHNESS"&&x.status==="FAIL"));
});

test("Decision funnel never fabricates probability or EXECUTION_READY in Phase 1",()=>{
  const a=analysis(1),f=buildSmartFeatures(a),h=assessDataHealth(a,macro(),f),r=classifySmartRegime(f,a);
  const d=buildDecisionFunnel({analysis:a,macro:macro(),features:f,regime:r,dataHealth:h});
  assert.equal(d.calibratedProbability,null);
  assert.equal(d.probabilityStatus,"UNVERIFIED_PHASE_1");
  assert.equal(d.executionReady,false);
  assert.notEqual(d.decision,"EXECUTION_READY");
  assert.ok(d.gates.some(g=>g.id==="NEWS_RISK"&&g.status==="UNVERIFIED"));
});

test("Fresh opposing Gold macro bias can block a directional setup",()=>{
  const a=analysis(1),m=macro("PRESSURE"),f=buildSmartFeatures(a),h=assessDataHealth(a,m,f),r=classifySmartRegime(f,a);
  const d=buildDecisionFunnel({analysis:a,macro:m,features:f,regime:r,dataHealth:h});
  const g=d.gates.find(x=>x.id==="MACRO_VALID");
  assert.equal(g.status,"FAIL");
  assert.equal(d.decision,"WAIT");
});

test("Smart Quant UI contains unique critical controls and research-only warnings",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const js=readFileSync(new URL("../smart-quant.js",import.meta.url),"utf8");
  for(const id of ["smartQuantPage","sqRefresh","sqDecision","sqConfidence","sqProbability","sqFunnel","sqTechnical","sqMacroDrivers"]){
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"',"g"))].length,1,id);
  }
  assert.ok(html.includes('src="/smart-quant.js"'));
  assert.match(html,/cannot produce EXECUTION_READY/i);
  assert.match(js,/UNVERIFIED/);
});
