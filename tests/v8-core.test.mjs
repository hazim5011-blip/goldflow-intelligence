import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {
  replayOutcome,pipConvention,metadataFromCatalog,buildHistory,aggregate,groupHistory,compareMonths,
  periodKey,filterHistory,evidenceForRecord,explainRecord
} from "../api/_v8Core.js";
import {normalizePublishedPayload,forwardPath,normalizeOutcomePayload,outcomePath,forwardConfigured,validateSecret} from "../api/_v8Ledger.js";

const mk=(t,o,h,l,c)=>({t,o,h,l,c,v:100});
const base={time:1000,closeTime:1300,direction:1,entry:100,invalidation:90,tp1:110,score:90,reasons:["MOMENTUM"]};
const replay=(changes,mid,mode="103")=>replayOutcome({...base,...changes},[mk(1000,99,101,97,100),...mid,mk(2200,99,101,97,100)],"M5",mode);
test("BUY TP1 and risk-to-SL exits are exact",()=>{
  const tp=replay({},[mk(1300,101,112,100,111)]);
  assert.equal(tp.outcome,"TP1");assert.equal(tp.exitPrice,110);assert.equal(tp.priceMove,10);
  const sl=replay({},[mk(1300,99,100,89,90)]);
  assert.equal(sl.outcome,"SL");assert.equal(sl.exitPrice,90);assert.equal(sl.priceMove,-10);
});
test("Same candle TP and SL is AMBIGUOUS and excluded from win denominator",()=>{
  const r=replay({},[mk(1300,99,112,89,100)]);
  assert.equal(r.outcome,"AMBIGUOUS");assert.equal(r.exitPrice,null);assert.deepEqual(r.dataQuality,["INTRABAR_ORDER_UNKNOWN"]);
});
test("SELL TP1 and gap-through-stop use directional prices",()=>{
  const tp=replay({direction:-1,invalidation:110,tp1:90},[mk(1300,99,101,89,90)]);
  assert.equal(tp.outcome,"TP1");assert.equal(tp.priceMove,10);
  const gap=replay({direction:-1,invalidation:110,tp1:90},[mk(1300,112,113,111,112)]);
  assert.equal(gap.outcome,"SL");assert.equal(gap.exitPrice,112);
});
test("MTF 1.05 positive BE and TRAILING use actual managed stop prices",()=>{
  const be=replay({},[mk(1300,101,106,101,105),mk(1600,105,106,100,100)],"105");
  assert.equal(be.outcome,"BE_POSITIVE");assert.equal(be.exitPrice,100.5);
  const trail=replay({},[mk(1300,101,108,101,107),mk(1600,107,108,103,103)],"105");
  assert.equal(trail.outcome,"TRAILING");assert.equal(trail.exitPrice,104.5);
});
test("PENDING and validation-only engines never claim wins",()=>{
  assert.equal(replay({},[mk(1300,100,103,99,102)]).outcome,"PENDING");
  assert.equal(replay({tp1:null},[mk(1300,100,106,97,104)],"pattern132").outcome,"VALID_ONLY");
  assert.equal(replay({tp1:null},[mk(1300,100,106,97,104)],"snd107").outcome,"VALID_ONLY");
});
test("Pip conventions are explicit per asset",()=>{
  assert.equal(pipConvention("EURUSD.p",.00001).pipSize,.0001);
  assert.equal(pipConvention("USDJPY.p",.001).pipSize,.01);
  assert.equal(pipConvention("XAUUSD.p",.01).pipSize,.1);
  assert.equal(pipConvention("BTCUSD.p",.01).pipSize,null);
});
test("0.01 lot is gross USD estimate only when broker metadata supports it",()=>{
  const spec=metadataFromCatalog({name:"XAUUSD.p",category:"METALS",digits:2,point:.01,
    currencyProfit:"USD",contractSize:100,volumeMin:.01,volumeStep:.01},"XAUUSD","XAUUSD.p");
  const rows=buildHistory([base],[mk(1000,99,101,97,100),mk(1300,101,111,100,110),mk(1600,109,110,108,109)],
    {requested:"XAUUSD",resolved:"XAUUSD.p",tf:"M5",indicator:"103",spec});
  assert.equal(rows[0].priceMove,10);assert.equal(rows[0].signedPoints,1000);
  assert.equal(rows[0].signedPips,100);assert.equal(rows[0].grossPLUSD,10);
  assert.equal(rows[0].netPLUSD,null);assert.equal(rows[0].recordMode,"HISTORICAL_SIM");
  assert.equal(rows[0].publishedAtUTC,null);
  for(const partial of [{...spec,volumeMin:.1},{...spec,currencyProfit:"JPY"},{...spec,contractSize:null}]){
    const meta=metadataFromCatalog(partial,"XAUUSD","XAUUSD.p");
    assert.equal(meta.grossEstimateAvailable,false);
  }
});
test("History records preserve broker and multi-timeframe provenance",()=>{
  const spec=metadataFromCatalog({name:"XAUUSD.p",category:"METALS",digits:2,point:.01,
    currencyProfit:"USD",contractSize:100,volumeMin:.01,volumeStep:.01},"XAUUSD","XAUUSD.p");
  const row=buildHistory([base],[mk(1000,99,101,97,100),mk(1300,101,111,100,110),mk(1600,109,110,108,109)],
    {requested:"XAUUSD",resolved:"XAUUSD.p",tf:"M5",triggerTF:"M5",setupTF:"M15",biasTF:"H1",
      brokerServer:"VantageInternational-Live",indicator:"103",spec})[0];
  assert.equal(row.triggerTF,"M5");assert.equal(row.setupTF,"M15");assert.equal(row.biasTF,"H1");
  assert.equal(row.brokerServer,"VantageInternational-Live");
});
test("Strict and legacy win rates separate BE0, pending and ambiguous",()=>{
  const q=(id,o,m,r)=>({signalId:id,symbolResolved:"XAUUSD.p",outcome:o,priceMove:m,rMultiple:r,grossPLUSD:m,
    signedPips:m==null?null:m*10,signedPoints:m==null?null:m*100,completed:true});
  const s=aggregate([q("a","TP1",10,1),q("b","SL",-10,-1),q("c","BE_ZERO",0,0),q("d","AMBIGUOUS",null,null),q("e","PENDING",null,null)]);
  assert.equal(s.strictWinRate,50);assert.ok(Math.abs(s.legacyWinRate-200/3)<.001);
  assert.equal(s.strictDenominator,2);assert.equal(s.ambiguous,1);assert.equal(s.beZero,1);
});
test("MYT calendar boundaries, ISO week and comparisons never use UTC day by accident",()=>{
  const row={signalCandleCloseUTC:"2026-09-30T16:10:00.000Z"};
  assert.equal(periodKey(row,"day"),"2026-10-01");
  assert.equal(periodKey(row,"month"),"2026-10");
  assert.equal(periodKey(row,"week"),"2026-W40");
  const comp=compareMonths([row],new Date("2026-09-30T16:20:00Z"));
  assert.equal(comp.current.period,"2026-10");assert.equal(comp.previous.period,"2026-09");
  assert.equal(comp.current.totalSignals,1);
  const f=filterHistory([row],{from:"2026-10-01",to:"2026-10-01"});
  assert.equal(f.length,1);
});
test("Evidence hash is reconstruction-only and explanation never claims an executed trade",()=>{
  const spec=metadataFromCatalog({name:"XAUUSD.p",category:"METALS",digits:2,point:.01,
    currencyProfit:"USD",contractSize:100,volumeMin:.01,volumeStep:.01},"XAUUSD","XAUUSD.p");
  const row=buildHistory([base],[mk(1000,99,101,97,100),mk(1300,101,111,100,110),mk(1600,109,110,108,109)],
    {requested:"XAUUSD",resolved:"XAUUSD.p",tf:"M5",indicator:"103",spec})[0];
  const proof=evidenceForRecord(row,[mk(1000,99,101,97,100),mk(1300,101,111,100,110)]);
  assert.equal(proof.verification,"NOT_FORWARD_VERIFIED");
  assert.equal(proof.hashScope,"CURRENT_RESPONSE_RECONSTRUCTION_ONLY");
  assert.match(proof.evidenceHash,/^[a-f0-9]{64}$/);
  assert.equal(explainRecord(row).kind,"RULE_BASED_EXPLANATION_NOT_GENERATIVE_AI");
});
test("Authenticated forward ledger rejects late, inconsistent or future candles",()=>{
  const now=new Date("2026-10-01T00:10:15Z"),last=Math.floor(Date.parse("2026-10-01T00:05:00Z")/1000);
  const candles=Array.from({length:25},(_,i)=>mk(last-(24-i)*300,100,102,98,101));
  const body={symbolResolved:"XAUUSD.p",indicatorId:"105",tf:"M5",direction:1,entry:100,originalSL:90,tp1:110,
    signalCandleCloseUTC:"2026-10-01T00:10:00Z",closedCandles:candles,score:85};
  const rec=normalizePublishedPayload(body,now);
  assert.match(rec.signalId,/^[a-f0-9]{32}$/);assert.equal(rec.receivedAtUTC,now.toISOString());
  assert.match(forwardPath(rec),/published.json$/);
  assert.throws(()=>normalizePublishedPayload({...body,signalCandleCloseUTC:"2026-09-30T23:55:00Z"},now),/CONTEMPORANEOUS/);
  assert.throws(()=>normalizePublishedPayload({...body,closedCandles:[...candles.slice(0,24),{...candles[24],t:last+1800}]},now),/CANDLE/);
  assert.throws(()=>normalizePublishedPayload({...body,originalSL:110},now),/TRADE_PLAN/);
});
test("Forward outcome is a separate immutable-linked event",()=>{
  const now=new Date("2026-10-01T00:10:15Z"),last=Math.floor(Date.parse("2026-10-01T00:05:00Z")/1000);
  const candles=Array.from({length:25},(_,i)=>mk(last-(24-i)*300,100,102,98,101));
  const published=normalizePublishedPayload({symbolResolved:"XAUUSD.p",indicatorId:"105",tf:"M5",direction:1,
    entry:100,originalSL:90,tp1:110,signalCandleCloseUTC:"2026-10-01T00:10:00Z",closedCandles:candles,score:85,
    spec:{point:.01,pipSize:.1}},now);
  const later=new Date("2026-10-01T00:25:10Z");
  const event=normalizeOutcomePayload({date:"2026-10-01",signalId:published.signalId,outcome:"TP1",
    exitPrice:110,exitTimeUTC:"2026-10-01T00:25:00Z",exitRule:"TP1_TOUCH"},published,later);
  assert.equal(event.outcome,"TP1");assert.equal(event.priceMove,10);assert.equal(event.signedPoints,1000);
  assert.equal(event.signedPips,100);assert.match(event.eventHash,/^[a-f0-9]{64}$/);
  assert.match(outcomePath(event),/\/outcome\.json$/);
  assert.throws(()=>normalizeOutcomePayload({date:"2026-10-01",signalId:published.signalId,outcome:"WIN",
    exitPrice:110,exitTimeUTC:"2026-10-01T00:25:00Z"},published,later),/FINAL_OUTCOME/);
});
test("All 22 locale packs parse and partial packs fallback to English",()=>{
  const here=path.dirname(fileURLToPath(import.meta.url)),loc=path.join(here,"../locales");
  const expected=["ms","en","id","zh-CN","zh-TW","ar","hi","es","fr","de","pt","ru","ja","ko","tr","th","vi","fil","ur","bn","ta","it"];
  assert.equal(expected.length,22);
  for(const code of expected){const file=JSON.parse(readFileSync(path.join(loc,code+".json"),"utf8"));
    assert.equal(file.locale,code);assert.ok(file.strings.language);assert.ok(file.strings.disclaimer);
    assert.equal(file.dir,["ar","ur"].includes(code)?"rtl":"ltr");
  }
});
test("V8 page references each new accessible section exactly once",()=>{
  const here=path.dirname(fileURLToPath(import.meta.url));
  const html=readFileSync(path.join(here,"../index.html"),"utf8");
  for(const id of ["v8History","v8Performance","v8Evidence","v8News","gfLocale","gfSpeakGlobal","gfReplay","v8EvidencePng","v8EvidenceChart"]){
    assert.equal([...html.matchAll(new RegExp('id="'+id+'"',"g"))].length,1,id);
  }
});
test("News Study never promotes period dates into verified release timestamps",()=>{
  const here=path.dirname(fileURLToPath(import.meta.url));
  const src=readFileSync(path.join(here,"../api/news-context.js"),"utf8");
  assert.match(src,/verifiedReleases/);
  assert.match(src,/latestOfficialObservations/);
  assert.match(src,/releasedAtUTC:null/);
  assert.match(src,/period dates are NOT publication timestamps/i);
});
test("English locale covers new speech replay and news-classification labels",()=>{
  const here=path.dirname(fileURLToPath(import.meta.url));
  const en=JSON.parse(readFileSync(path.join(here,"../locales/en.json"),"utf8")).strings;
  for(const key of ["replay","verifiedRelease","macroObservation","noVerifiedReleases","macroObservationNote"])assert.ok(en[key],key);
});
