import test from "node:test";
import assert from "node:assert/strict";
import {handleProfessionalReview} from "../cloudflare/gpt-professional-review.js";
const TOKEN="s".repeat(50);
const NOW=Math.floor(Date.now()/1000);
function fixture({indicator="105",complete=18,valid=6,state="COLLECT_DATA",candidateGate=false}={}){
 const src={recommendationId:"r-123",generatedAtUTC:new Date().toISOString(),
  symbol:"XAUUSD247",tf:"M15",indicator:indicator.toLowerCase(),indicatorName:indicator,
  state,historyMode:"HISTORICAL_SIM",dataWindow:{startUTC:new Date(Date.now()-86400000).toISOString(),
   endUTC:new Date().toISOString(),availableClosedCandles:500},
  baseline:{all:{completed:complete,strictDenominator:complete,netPip:-30,strictWR:35,totalR:-4,positive:6,negative:12,strictBasis:"PIP"},
   validation:{completed:valid,strictDenominator:valid,netPip:-10,strictWR:30,positive:2,negative:4,strictBasis:"PIP"}},
  diagnostics:{lossCount:12,winCount:6,quickStopRate:70,targetFallbackRate:40,wideRiskRate:20},
  recommendation:{summary:["Banyak SL awal; ujian struktur perlu"]},
  candidates:[{id:"TEST_BUFFER",why:"Uji buffer",patch:{bufferATR:.1},gate:{pass:candidateGate,
    reasons:candidateGate?[]:["VALIDATION_SAMPLE_LT_10"]},validation:{completed:valid,netPip:-10}}]};
 return {version:"RECOMMENDED_AI_ARCHIVE_V1",updatedAtUTC:new Date().toISOString(),
  recommendations:{[indicator+"|XAUUSD247|M15"]:src}};
}
function prepare({archive=fixture(),badStore=false}={}){
 const map=new Map(),calls=[];
 const bucket={
  async list({prefix}){return {objects:[...map.keys()].filter(x=>x.startsWith(prefix)).map(key=>({key}))}},
  async put(key,value,opts){if(badStore)throw Error("NO_STORE");assert.equal(opts.onlyIf.get("If-None-Match"),"*");map.set(key,value)},
  async get(key){return map.has(key)?{text:async()=>map.get(key)}:null}
 };
 const env={GF_GPT_ENABLED:"1",GF_GPT_REVIEW_ENABLED:"1",OPENAI_API_KEY:"test-not-real",
  GF_GPT_ADMIN_TOKEN:TOKEN,GF_GPT_REVIEW_R2:bucket,
  GF_GPT_MODEL:"gpt-6-sol",GF_GPT_RATE_KV:{get:async()=>null,put:async()=>{}} ,
  ASSETS:{fetch:async()=>new Response(JSON.stringify(archive))}};
 const net=async(url,opts)=>{calls.push({url,opts});
  const out={decision:"RECOMMEND_BACKTEST",diagnosis:"SL terlalu cepat dalam sample.",
   evidence:"Rekod simulation menunjukkan 12 loss.",
   recommendation:"Uji syarat rejection sebelum entry.",
   validation:"Perlu backtest out-of-sample dan shadow test.",
   limitations:"Data bukan broker fill yang sebenar.",priority:"HIGH"};
  return new Response(JSON.stringify({output:[{content:[{type:"output_text",text:JSON.stringify(out)}]}]}));
 };
 const req=(indicator="105",method="POST",token=TOKEN)=>new Request("https://preview.pages.dev/api/gpt-professional-review"+
  (method==="GET"?"?indicator="+indicator:""),{method,headers:{"Content-Type":"application/json",
   Authorization:"Bearer "+token},body:method==="POST"?JSON.stringify({indicator,tf:"M15"}):undefined});
 const run=async(request=req(),overrides=env)=>{
  const r=await handleProfessionalReview(request,overrides,{fetch:net,nowSec:()=>NOW});
  return {status:r.status,result:await r.json()};
 };
 return {req,run,env,map,calls};
}
test("disabled by default: no external calls or storage",async()=>{
 const p=prepare();const r=await p.run(p.req(),{});
 assert.equal(r.status,503);assert.equal(r.result.error,"PROFESSIONAL_REVIEW_DISABLED");assert.equal(p.calls.length,0);
});
test("unauthorized owner and missing R2 never trigger model",async()=>{
 const p=prepare();
 assert.equal((await p.run(p.req("105","POST","wrong"))).status,401);
 assert.equal((await p.run(p.req(),{...p.env,GF_GPT_REVIEW_R2:null})).result.error,"REVIEW_STORAGE_NOT_CONFIGURED");
 assert.equal(p.calls.length,0);
});
test("archive review is exact indicator-specific; no cross-indicator borrowing",async()=>{
 const p=prepare();
 const x=await p.run(p.req("103"));
 assert.equal(x.status,503);assert.equal(x.result.error,"NO_INDICATOR_MATCHING_EVIDENCE");assert.equal(p.calls.length,0);
});
test("insufficient historical simulation samples deterministically block live changes",async()=>{
 const p=prepare();const x=await p.run();assert.equal(x.status,200);
 assert.equal(x.result.decision,"COLLECT_DATA");assert.equal(x.result.persisted,true);
 assert.equal(x.result.changesApplied,false);assert.equal(x.result.permissionToChange,false);
 assert.equal(x.result.isExecutedTrade,false);assert.equal(x.result.baseline.all.completed,18);
 assert.ok(x.result.gateReasons.includes("MIN_SAMPLES_40_COMPLETED_10_VALIDATION"));
 assert.equal(p.calls.length,1);assert.match(p.calls[0].url,/api\.openai\.com/);
 const userInput=JSON.parse(JSON.parse(p.calls[0].opts.body).input[1].content);
 assert.equal(userInput.evidence.baseline.validation.completed,6);
 assert.equal(userInput.evidence.candidates[0].passedValidation,false);
 assert.equal(p.map.size,1);
});
test("R2 history remains per-indicator, authenticated, append-only",async()=>{
 const p=prepare();await p.run();await p.run();
 assert.equal(p.map.size,2);
 const x=await p.run(p.req("105","GET"));assert.equal(x.status,200);
 assert.equal(x.result.items.length,2);
 assert.ok(x.result.items.every(i=>i.indicator==="105"&&i.changesApplied===false));
 assert.equal(p.calls.length,2);
});
test("stale archive fails closed without model or R2 writes",async()=>{
 const a=fixture();a.updatedAtUTC=new Date(Date.now()-5*86400000).toISOString();
 const p=prepare({archive:a});const x=await p.run();
 assert.equal(x.status,503);assert.equal(x.result.error,"RECOMMENDED_ARCHIVE_STALE_OR_INVALID");
 assert.equal(p.calls.length,0);assert.equal(p.map.size,0);
});
test("failed R2 persistence is visible and cannot claim saved review",async()=>{
 const p=prepare({badStore:true});const x=await p.run();
 assert.equal(x.status,503);assert.equal(x.result.error,"REVIEW_PERSISTENCE_FAILED");
 assert.equal(x.result.changesApplied,false);
});
test("adequate sample does not auto-change even if model recommends backtest",async()=>{
 const p=prepare({archive:fixture({complete:47,valid:13,state:"KEEP_CURRENT",candidateGate:true})});
 const x=await p.run();assert.equal(x.status,200);assert.equal(x.result.decision,"RECOMMEND_BACKTEST");
 assert.equal(x.result.changesApplied,false);assert.equal(x.result.permissionToChange,false);
});
