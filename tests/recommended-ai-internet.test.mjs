import test from "node:test";
import assert from "node:assert/strict";
import {sanitizeInternetHypothesis,reasonWithInternet} from "../api/_internetResearchScout.js";

test("internet hypothesis can only carry bounded management keys and http sources",()=>{
  const h=sanitizeInternetHypothesis({
    indicator:"PVT102",symbol:"xauusd247",title:"test",hypothesis:"test hypothesis",confidence:1.7,
    patch:{bufferATR:.14,lookback:55,evilCode:999},
    sources:["https://www.federalreserve.gov/test","javascript:alert(1)"]
  });
  assert.equal(h.indicator,"pvt102");
  assert.equal(h.symbol,"XAUUSD247");
  assert.equal(h.confidence,1);
  assert.deepEqual(h.patch,{bufferATR:.14,lookback:55});
  assert.deepEqual(h.sources,["https://www.federalreserve.gov/test"]);
  assert.equal(h.status,"TESTABLE");
});

test("internet evidence alone cannot impersonate a reasoning model when no API key exists",async()=>{
  const old=process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try{
    const r=await reasonWithInternet({evidence:{items:[],macro:[]},recommendedArchive:{recommendations:{}}});
    assert.equal(r.enabled,false);
    assert.equal(r.status,"OFFLINE_NO_OPENAI_API_KEY");
    assert.deepEqual(r.hypotheses,[]);
  }finally{
    if(old===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=old;
  }
});
