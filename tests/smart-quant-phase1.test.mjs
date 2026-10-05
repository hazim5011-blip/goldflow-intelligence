import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {buildSmartFeatures,assessDataHealth} from "../api/_sqFeatures.js";
import {classifySmartRegime} from "../api/_sqRegime.js";
import {buildDecisionFunnel} from "../api/_sqDecisionFunnel.js";
import {buildDirectionalEdge} from "../api/_sqFairValue.js";
import {buildRiskReference} from "../api/_sqRisk.js";
import {runMonteCarlo} from "../api/_sqMonteCarlo.js";
import {parseBlsSchedule,parseBeaSchedule,parseFomcMeetings} from "../api/_sqNewsRisk.js";
import {buildForwardCalibration} from "../api/_sqCalibration.js";
import {calibrationSamplePath} from "../api/_v8Ledger.js";
import {buildMtfMatrix,TFS as SMART_TFS} from "../api/_sqMtf.js";
import {buildResearchTradePlan} from "../api/_sqTradePlan.js";
import {buildSmartAnalyst} from "../api/_sqAnalyst.js";
import {buildSessionLiquidity} from "../api/_sqSession.js";
import {buildAlertPreview} from "../api/_sqAlert.js";
import {buildMacroContributionMap} from "../api/_sqMacroMap.js";

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
  assert.equal(d.probabilityStatus,"UNVERIFIED");
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
  for(const id of ["smartQuantPage","sqRefresh","sqDecision","sqConfidence","sqProbability","sqSessionRadar","sqMacroMap","sqAlertPreview","sqTradePlan","sqAnalyst","sqFunnel","sqMtfMatrix","sqTechnical","sqMacroDrivers"]){
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"',"g"))].length,1,id);
  }
  assert.ok(html.includes('src="/smart-quant.js"'));
  assert.match(html,/RESEARCH_READY requires verified official-news timing, validated forward probability/i);
  assert.match(js,/UNVERIFIED/);
});


test("Directional Edge Index stays separate from calibrated probability",()=>{
  const a=analysis(1),m=macro("SUPPORTIVE"),f=buildSmartFeatures(a),r=classifySmartRegime(f,a);
  const e=buildDirectionalEdge({analysis:a,features:f,regime:r,macro:m});
  assert.equal(e.bias,"BULLISH");
  assert.ok(e.directionalEdgeIndex>0);
  assert.ok(e.coverage>=80);
  assert.match(e.interpretation,/not a fair-value price target or calibrated probability/i);
});

test("Risk reference uses Wilson-lower probability, fractional Kelly and a hard cap",()=>{
  const dist=Array.from({length:60},(_,i)=>i%5<3?1.5:-1);
  const hist={sufficientForRiskModel:true,sampleCount:60,nonzeroCount:60,winRateWilson95:{low:.50},avgWinR:1.5,avgLossRAbs:1,rDistribution:dist};
  const r=buildRiskReference(hist,{hardCapPct:.50,kellyFraction:.25});
  assert.equal(r.status,"AVAILABLE_CONSERVATIVE");
  assert.ok(r.suggestedRiskPct>=0&&r.suggestedRiskPct<=.50);
  assert.equal(r.hardRiskCapPct,.50);
  assert.match(r.probabilityBasis,/HISTORICAL_RECONSTRUCTION_ONLY/);
});

test("Monte Carlo bootstrap is deterministic and explicitly reconstruction-based",()=>{
  const dist=Array.from({length:80},(_,i)=>i%5<3?1.4:-1);
  const hist={rDistribution:dist};
  const risk={suggestedRiskPct:.25};
  const a=runMonteCarlo(hist,risk,{paths:600,trades:80,seedKey:"TEST"});
  const b=runMonteCarlo(hist,risk,{paths:600,trades:80,seedKey:"TEST"});
  assert.deepEqual(a,b);
  assert.equal(a.status,"AVAILABLE_RECONSTRUCTION_BOOTSTRAP");
  for(const k of ["dd5","dd10","dd20","ruin50","lossStreak5"])assert.ok(a.probabilities[k]>=0&&a.probabilities[k]<=100,k);
  assert.match(a.warning,/reconstructed historical R outcomes/i);
});


test("Official schedule parsers normalize Eastern time without inventing event times",()=>{
  const bls=parseBlsSchedule("Reference Month Release Date Release Time September 2026 Oct. 14, 2026 08:30 AM","CPI","Consumer Price Index","HIGH","bls");
  assert.equal(bls.length,1);
  assert.equal(bls[0].scheduledAtUTC,"2026-10-14T12:30:00.000Z");

  const bea=parseBeaSchedule("October 29 8:30 AM News GDP (Advance Estimate), 3rd Quarter 2026 October 29 8:30 AM News Personal Income and Outlays, September 2026",2026,"bea");
  assert.equal(bea.length,2);
  assert.ok(bea.some(x=>x.type==="GDP"));
  assert.ok(bea.some(x=>x.type==="PCE"));
  assert.ok(bea.every(x=>x.scheduledAtUTC==="2026-10-29T12:30:00.000Z"));

  const fed=parseFomcMeetings("2026 FOMC Meetings October 27-28 December 8-9* 2025 FOMC Meetings December 9-10*", [2026],"fed");
  assert.equal(fed.length,2);
  assert.equal(fed[0].scheduledAtUTC,"2026-10-28T18:00:00.000Z");
  assert.equal(fed[1].scheduledAtUTC,"2026-12-09T19:00:00.000Z");
});

test("Verified high-impact news inside hard window blocks the decision funnel",()=>{
  const a=analysis(1),m=macro("SUPPORTIVE"),f=buildSmartFeatures(a),h=assessDataHealth(a,m,f),r=classifySmartRegime(f,a);
  const newsRisk={verification:"VERIFIED_OFFICIAL_SCHEDULES",status:"BLOCK_HIGH_IMPACT",block:true,nextHighImpact:{type:"CPI"},minutesToNextHigh:12};
  const d=buildDecisionFunnel({analysis:a,macro:m,features:f,regime:r,dataHealth:h,newsRisk});
  const g=d.gates.find(x=>x.id==="NEWS_RISK");
  assert.equal(g.status,"FAIL");
  assert.equal(g.hard,true);
  assert.equal(d.decision,"WAIT");
});


function calibrationRows(n=120,mode="skill"){
  const rows=[];
  for(let i=0;i<n;i++){
    const score=35+(i%14)*4.5;
    let win;
    if(mode==="skill"){
      const threshold=(i*37%100)/100;
      const p=Math.max(.12,Math.min(.90,.18+(score-35)/70*.68));
      win=threshold<p;
    }else{
      win=(i*37%100)<55;
    }
    rows.push({timestampKey:"202610"+String(1+Math.floor(i/24)).padStart(2,"0")+"T"+String(i%24).padStart(2,"0")+"0000Z",
      score,direction:1,outcome:win?"TP1":"SL",signalId:String(i).padStart(32,"0")});
  }
  return rows;
}
test("Forward calibration refuses small or unreliable samples and publishes only after holdout validation",()=>{
  const small=buildForwardCalibration(calibrationRows(30,"skill"),{score:80,direction:1});
  assert.equal(small.calibratedProbability,null);
  assert.equal(small.status,"INSUFFICIENT_FORWARD_SAMPLE");

  const good=buildForwardCalibration(calibrationRows(160,"skill"),{score:80,direction:1});
  assert.equal(good.status,"CALIBRATED_FORWARD");
  assert.ok(good.calibratedProbability>.5&&good.calibratedProbability<1);
  assert.equal(good.provenance,"FORWARD_LOGGED_ONLY");
  assert.ok(good.holdout.brierSkill>=.01);
  assert.ok(good.reliabilityBins.length>0);
});

test("Calibration index pathname is immutable, scoped and metadata-readable",()=>{
  const published={signalId:"a".repeat(32),symbolResolved:"XAUUSD247",indicatorId:"105",tf:"M5",direction:1,score:82.4,
    signalCandleCloseUTC:"2026-10-05T10:00:00Z",recordHash:"r"};
  const event={signalId:published.signalId,outcome:"TP1",rMultiple:1.4,exitTimeUTC:"2026-10-05T10:15:00Z",
    receivedAtUTC:"2026-10-05T10:15:02.123Z",eventHash:"e"};
  const path=calibrationSamplePath(published,event);
  assert.match(path,/^goldflow-calibration\/v1\/XAUUSD247\/105\/M5\/20261005T101502Z-/);
  assert.match(path,/-0824-B-TP1-/);
  assert.match(path,/a{32}\.json$/);
});

test("Decision funnel requires validated forward probability before RESEARCH_READY",()=>{
  const a=analysis(1),m=macro("SUPPORTIVE"),f=buildSmartFeatures(a),h=assessDataHealth(a,m,f),r=classifySmartRegime(f,a);
  const newsRisk={verification:"VERIFIED_OFFICIAL_SCHEDULES",status:"CLEAR",block:false,nextHighImpact:null};
  const noCal=buildDecisionFunnel({analysis:a,macro:m,features:f,regime:r,dataHealth:h,newsRisk,calibration:{status:"INSUFFICIENT_FORWARD_SAMPLE",minSample:50}});
  assert.notEqual(noCal.decision,"RESEARCH_READY");
  assert.equal(noCal.calibratedProbability,null);
  const cal={status:"CALIBRATED_FORWARD",calibratedProbability:.64};
  const yes=buildDecisionFunnel({analysis:a,macro:m,features:f,regime:r,dataHealth:h,newsRisk,calibration:cal});
  const pg=yes.gates.find(x=>x.id==="PROBABILITY_VALID");
  assert.equal(pg.status,"PASS");
  assert.equal(yes.calibratedProbability,.64);
});


test("MTF matrix calculates each timeframe independently from closed broker candles",()=>{
  const frames={};
  for(const [i,tf] of SMART_TFS.entries())frames[tf]=trendBars(120+i*3,i===6?-1:1);
  const m=buildMtfMatrix(frames,0,1);
  assert.equal(m.total,7);
  assert.equal(m.readyCount,7);
  assert.equal(m.rows.length,7);
  assert.ok(m.rows.every(x=>x.ready&&x.confidenceMeaning==="STATE_CONFIDENCE_NOT_WIN_PROBABILITY"));
  assert.equal(m.rows.find(x=>x.tf==="D1").direction,-1,"D1 is derived from its own bearish candles, not copied from M5");
  assert.ok(m.alignment.opposed>=1);
  assert.match(m.note,/does not reuse a lower-timeframe signal/i);
});


test("Forward calibration never publishes a directional probability for WAIT",()=>{
  const x=buildForwardCalibration(calibrationRows(160,"skill"),{score:80,direction:0});
  assert.equal(x.status,"NO_CURRENT_DIRECTION");
  assert.equal(x.calibratedProbability,null);
});


test("Trade plan blocks chasing and invalidated plans before showing readiness",()=>{
  const a=analysis(1),f=buildSmartFeatures(a);
  const d={decision:"RESEARCH_READY"};
  const base=buildResearchTradePlan({analysis:a,features:f,decision:d,risk:{suggestedRiskPct:.25},newsRisk:{block:false}});
  assert.ok(["READY_NEAR_ENTRY","NEAR_ENTRY_WATCH","WAIT_PULLBACK","IN_ZONE_WATCH"].includes(base.status),base.status);
  assert.equal(base.invalidated,false);

  const chaseAnalysis=analysis(1);
  chaseAnalysis.price=chaseAnalysis.indicator.latestSignal.entry+2*f.atr14;
  const chase=buildResearchTradePlan({analysis:chaseAnalysis,features:f,decision:d,risk:{},newsRisk:{block:false}});
  assert.equal(chase.status,"WAIT_NO_CHASE");
  assert.equal(chase.noChase,true);

  const invalid=analysis(1);
  invalid.price=invalid.indicator.latestSignal.invalidation-0.1;
  const inv=buildResearchTradePlan({analysis:invalid,features:f,decision:d,risk:{},newsRisk:{block:false}});
  assert.equal(inv.status,"INVALIDATED");
  assert.equal(inv.invalidated,true);
});

test("Trade plan honors official news hard block",()=>{
  const a=analysis(1),f=buildSmartFeatures(a);
  const p=buildResearchTradePlan({analysis:a,features:f,decision:{decision:"RESEARCH_READY"},risk:{},newsRisk:{block:true}});
  assert.equal(p.status,"BLOCK_NEWS");
  assert.equal(p.newsBlocked,true);
});


test("Smart Analyst only summarizes structured engine evidence and cannot override decision",()=>{
  const analyst=buildSmartAnalyst({
    decision:{decision:"WAIT",side:"BUY",gates:[{label:"Forward probability calibration",status:"UNVERIFIED",reason:"Need more samples"}]},
    regime:{name:"TREND_BULL",confidence:72},
    mtfMatrix:{readyCount:7,netBias:"BULLISH",netScore:48,alignment:{aligned:5,opposed:2}},
    directionalEdge:{bias:"BULLISH",directionalEdgeIndex:55,coverage:100},
    calibration:{status:"INSUFFICIENT_FORWARD_SAMPLE",sampleCount:20},
    tradePlan:{status:"WAIT_PULLBACK",action:"Wait for pullback.",noChase:false,invalidated:false},
    risk:{suggestedRiskPct:null},monteCarlo:{status:"INSUFFICIENT_SAMPLE"},
    newsRisk:{status:"CLEAR",nextHighImpact:null},dataHealth:{status:"GOOD",score:96}
  });
  assert.equal(analyst.kind,"RULE_BASED_STRUCTURED_ANALYST_NOT_LLM");
  assert.match(analyst.headline,/WAIT/);
  assert.ok(analyst.blockers.some(x=>/probability/i.test(x)));
  assert.match(analyst.note,/cannot.*override|tidak boleh.*menukar/i);
});


function m5Bars(startIso,count,offsetSeconds=0,base=4100){
  const start=Date.parse(startIso)/1000,out=[];
  for(let i=0;i<count;i++){
    const mid=base+i*.03;
    out.push({t:start+i*300+offsetSeconds,o:mid,h:mid+.18,l:mid-.16,c:mid+.04,v:100});
  }
  return out;
}

test("Session radar is timezone/DST aware and detects London/New York overlap",()=>{
  const now=new Date("2026-10-05T12:30:00Z");
  const bars=m5Bars("2026-10-04T10:00:00Z",330,0,4100);
  const s=buildSessionLiquidity({bars,brokerServerUTCOffsetSeconds:0,price:4107,atr14:2.5,now});
  assert.equal(s.ready,true);
  assert.ok(s.currentSessions.includes("LONDON"));
  assert.ok(s.currentSessions.includes("NEW_YORK"));
  assert.equal(s.overlap,true);
  assert.equal(s.primarySession,"NEW_YORK");
  assert.ok(s.pools.some(x=>x.id==="PDH"));
  assert.ok(s.pools.some(x=>x.id==="PDL"));
  assert.match(s.note,/DST-aware IANA time zones/);
});

test("Macro contribution map separates supportive and pressure drivers without claiming causation",()=>{
  const m=buildMacroContributionMap({ok:true,drivers:[
    {id:"REAL10Y",name:"Real yield",display:"1.8%",goldImpact:"PRESSURE",stale:false},
    {id:"NETLIQ",name:"Net liquidity",display:"$6T",goldImpact:"SUPPORTIVE",stale:false},
    {id:"USDBROAD",name:"USD",display:"100",goldImpact:"PRESSURE",stale:true}
  ]});
  assert.equal(m.ok,true);
  assert.ok(m.pressureScore>0);
  assert.ok(m.supportScore>0);
  assert.ok(m.rows.find(x=>x.id==="USDBROAD").freshnessMultiplier===.5);
  assert.match(m.note,/not a causal attribution or price forecast/i);
});

test("Alert preview is deterministic and never sends from the polling API",()=>{
  const x=buildAlertPreview({
    analysis:{symbol:"XAUUSD247",selectedTF:"M5"},
    decision:{decision:"WAIT",side:"BUY",modelConfidence:71},
    tradePlan:{status:"BLOCK_NEWS",side:"BUY",entry:4200,sl:4190,tp1:4215},
    newsRisk:{status:"BLOCK_HIGH_IMPACT",block:true,nextHighImpact:{type:"CPI",scheduledAtUTC:"2026-10-14T12:30:00Z"}},
    sessionLiquidity:{recentSweeps:[]},
    calibration:{status:"INSUFFICIENT_FORWARD_SAMPLE"},
    dataHealth:{status:"GOOD"}
  });
  const y=buildAlertPreview({
    analysis:{symbol:"XAUUSD247",selectedTF:"M5"},
    decision:{decision:"WAIT",side:"BUY",modelConfidence:71},
    tradePlan:{status:"BLOCK_NEWS",side:"BUY",entry:4200,sl:4190,tp1:4215},
    newsRisk:{status:"BLOCK_HIGH_IMPACT",block:true,nextHighImpact:{type:"CPI",scheduledAtUTC:"2026-10-14T12:30:00Z"}},
    sessionLiquidity:{recentSweeps:[]},
    calibration:{status:"INSUFFICIENT_FORWARD_SAMPLE"},
    dataHealth:{status:"GOOD"}
  });
  assert.equal(x.code,"HIGH_IMPACT_NEWS_BLOCK");
  assert.equal(x.notify,true);
  assert.equal(x.dedupeKey,y.dedupeKey);
  assert.match(x.policy,/Preview only/);
  assert.match(x.telegramText,/no broker order sent/i);
});
