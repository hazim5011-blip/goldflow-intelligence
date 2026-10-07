import test from "node:test";
import assert from "node:assert/strict";
import {buildNewsDecision} from "../api/study.js";

const macro={
  gold:{bias:"PRESSURE",score:31},
  cards:[
    {id:"US10Y",name:"US 10Y Yield",display:"5.21%",date:"2026-10-08",status:"OFFICIAL",goldImpact:"PRESSURE",change:.08,changeLabel:"5-observation change",source:"U.S. Treasury"},
    {id:"REAL10Y",name:"US 10Y Real Yield",display:"2.34%",date:"2026-10-08",status:"OFFICIAL",goldImpact:"PRESSURE",change:.05,changeLabel:"5-observation change",source:"U.S. Treasury"},
    {id:"USDBROAD",name:"Broad USD Index",display:"126.10",date:"2026-10-08",status:"OFFICIAL",goldImpact:"PRESSURE",change:.22,changeLabel:"5-day change",source:"Federal Reserve H.10"},
    {id:"NETLIQ",name:"Net Liquidity Proxy",display:"$5.91T",date:"2026-10-08",status:"DERIVED",goldImpact:"SUPPORTIVE",change:12000,changeLabel:"weekly proxy change, USD mn",source:"Derived Fed/NY Fed"}
  ]
};

test("News Impact explains WAIT CONFLICT instead of implying the opposite macro side is an entry",()=>{
  const d=buildNewsDecision({
    mode:"news",status:"WAIT_CONFLICT",canEnter:false,direction:1,h1Trend:-1,h4Trend:-1,
    confirmation:null,reason:"Verified Gold macro bias opposes this technical setup."
  },macro);
  assert.equal(d.decision,"WAIT_CONFLICT");
  assert.match(d.headline,/TECHNICAL BUY vs MACRO SELL PRESSURE/);
  assert.match(d.summary,/BUY technical candidate/);
  assert.match(d.summary,/NOT an automatic SELL entry/);
  assert.ok(d.pressureDrivers.some(x=>x.id==="US10Y"));
  assert.ok(d.macroReasons.some(x=>x.includes("US 10Y Yield")));
});

test("News Impact explains SELL when technical confirmation and Gold macro pressure agree",()=>{
  const d=buildNewsDecision({
    mode:"news",status:"SELL_ENTRY_READY",canEnter:true,direction:-1,h1Trend:-1,h4Trend:-1,
    confirmation:{direction:-1,confirmationType:"CLOSED_CANDLE_BREAKDOWN",entryLow:4108,entryHigh:4111}
  },macro);
  assert.equal(d.decision,"SELL_ENTRY_READY");
  assert.match(d.headline,/WHY SELL/);
  assert.match(d.summary,/macro agrees: SELL PRESSURE/);
  assert.ok(d.technicalReasons.some(x=>x.includes("CLOSED_CANDLE_BREAKDOWN")));
});

test("Macro pressure alone stays WAIT when no closed-candle technical side exists",()=>{
  const d=buildNewsDecision({
    mode:"news",status:"WAIT_CONFIRMATION",canEnter:false,direction:0,h1Trend:-1,h4Trend:-1,confirmation:null
  },macro);
  assert.equal(d.decision,"WAIT_TECHNICAL_CONFIRMATION");
  assert.match(d.headline,/MACRO SELL PRESSURE BUT NO CLOSED-CANDLE ENTRY/);
  assert.match(d.summary,/macro context alone cannot create an entry/);
});
