import test from "node:test";
import assert from "node:assert/strict";

test("runtime Recommended AI profile state is symbol scoped and sanitized", async()=>{
  const old=global.fetch;
  global.fetch=async url=>{
    const s=String(url);
    if(s.includes("profile-state.json"))return new Response(JSON.stringify({profiles:{
      "pvt102|XAUUSD247":{params:{bufferATR:.14,lookback:55,evilCode:999},promotedAtUTC:"2026-10-09T00:00:00Z"}
    }}),{status:200,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({research:{reasoning:{hypotheses:[]}}}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const m=await import("../api/_recommendedAIRuntimeState.js?profile-test="+Date.now());
    const row=await m.runtimeAIProfileRecord("pvt","xauusd247");
    assert.equal(row.source,"GITHUB_RUNTIME_PROFILE_STATE");
    assert.deepEqual(row.params,{bufferATR:.14,lookback:55});
    const ov=await m.runtimeManagementOverride("pvt102","XAUUSD247");
    assert.equal(ov.__replace,true);
    assert.deepEqual(ov.params,{bufferATR:.14,lookback:55});
  }finally{global.fetch=old}
});

test("runtime Internet hypotheses remain bounded and source linked", async()=>{
  const old=global.fetch;
  global.fetch=async url=>{
    const s=String(url);
    if(s.includes("research/latest.json"))return new Response(JSON.stringify({research:{reasoning:{hypotheses:[
      {indicator:"pvt102",symbol:"XAUUSD247",title:"test",confidence:.8,patch:{bufferATR:.15,evilCode:1},sources:["https://example.com"]}
    ]}}}),{status:200,headers:{"content-type":"application/json"}});
    return new Response(JSON.stringify({profiles:{}}),{status:200,headers:{"content-type":"application/json"}});
  };
  try{
    const m=await import("../api/_recommendedAIRuntimeState.js?research-test="+Date.now());
    const rows=await m.runtimeResearchHypotheses("pvt102","XAUUSD247");
    assert.equal(rows.length,1);
    assert.deepEqual(rows[0].patch,{bufferATR:.15});
    assert.equal(rows[0].status,"TESTABLE");
  }finally{global.fetch=old}
});
