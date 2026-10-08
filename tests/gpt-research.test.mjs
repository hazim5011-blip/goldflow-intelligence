import test from "node:test";
import assert from "node:assert/strict";
import {handleGptResearch} from "../cloudflare/gpt-research.js";
const NOW=1800000000,OFFSET=10800,TOKEN="g".repeat(48);
const ENV={GF_GPT_ENABLED:"1",GF_GPT_ADMIN_TOKEN:TOKEN,OPENAI_API_KEY:"sk-test-only",
 BROKER_BRIDGE_KEY:"bridge-test-only",GF_GPT_MODEL:"gpt-6-astra",VANTAGE_TICK_UTC_OFFSET_SECONDS:"10800"};
const SC={M5:300,M15:900,M30:1800,H1:3600,H4:14400};
function candles(seconds){
 return Array.from({length:115},(_,i)=>{
  const t=NOW+OFFSET-(116-i)*seconds,c=4000+i*.15;
  return {t,o:c-.2,h:c+.5,l:c-.5,c,v:12};
 });
}
function broker(stale=false){return {symbol:"XAUUSD247",bid:4200,ask:4200.30,
 serverTime:NOW+OFFSET-(stale?800:3),
 frames:Object.fromEntries(Object.entries(SC).map(([tf,sec])=>[tf,candles(sec)]))};}
function mockCalls({stale=false,badModel=false}={}){
 const calls=[];
 const network=async(url,opt)=>{
  calls.push({url:String(url),opt});
  if(String(url).includes("bridge.hazim5011.com"))return new Response(JSON.stringify(broker(stale)),{status:200});
  if(badModel)return new Response(JSON.stringify({output:[{content:[{type:"output_text",text:"not-json"}]}]}),{status:200});
  return new Response(JSON.stringify({output:[{content:[{type:"output_text",text:JSON.stringify({
   decision:"WATCH_BUY",summary:"M15 menaik",technical:"Struktur ujian",fundamental:"Data fundamental tidak tersedia",risks:"Kenaikan belum disahkan"
  })}]}]}),{status:200});
 };
 return {calls,network};
}
function request({method="POST",token=TOKEN,body={symbol:"XAUUSD247",tf:"M15"}}={}){
 return new Request("https://goldflow.example/api/gpt-research",{method,
  headers:{"content-type":"application/json",Authorization:"Bearer "+token},body:method==="POST"?JSON.stringify(body):undefined});
}
async function run(req,env=ENV,deps={}){const values=new Map();const testEnv={...env,GF_GPT_RATE_KV:env.GF_GPT_RATE_KV??{get:async k=>values.get(k)||null,put:async(k,v)=>{values.set(k,v)}}};const r=await handleGptResearch(req,testEnv,{nowSec:()=>NOW,...deps});return {status:r.status,headers:r.headers,data:await r.json()};}

test("opt-in default is disabled and cannot incur model costs",async()=>{
 const {network,calls}=mockCalls();const x=await run(request(),{}, {fetch:network});
 assert.equal(x.status,503);assert.equal(x.data.error,"GPT_RESEARCH_DISABLED");assert.equal(calls.length,0);
});
test("owner token required before broker or OpenAI network access",async()=>{
 const {network,calls}=mockCalls();const x=await run(request({token:"wrong"}),ENV,{fetch:network});
 assert.equal(x.status,401);assert.equal(x.data.error,"UNAUTHORIZED");assert.equal(calls.length,0);
});
test("no API key or weak admin token fails closed before any calls",async()=>{
 const {network,calls}=mockCalls();const x=await run(request(),{...ENV,OPENAI_API_KEY:"",GF_GPT_ADMIN_TOKEN:"short"},{fetch:network});
 assert.equal(x.status,503);assert.equal(calls.length,0);
});
test("GET is safe non-billable status, POST only, no permissive CORS",async()=>{
 const {network,calls}=mockCalls();const x=await run(request({method:"GET"}),ENV,{fetch:network});
 assert.equal(x.status,200);assert.equal(x.data.mode,"READ_ONLY");
 assert.equal(x.headers.has("access-control-allow-origin"),false);assert.equal(calls.length,0);
});
test("rejects unsupported symbols or injection fields before requesting data",async()=>{
 const {network,calls}=mockCalls();
 const a=await run(request({body:{symbol:"EURUSD",tf:"M15"}}),ENV,{fetch:network});
 const b=await run(request({body:{symbol:"XAUUSD247",tf:"M15",url:"https://hostile.example"}}),ENV,{fetch:network});
 assert.equal(a.status,400);assert.equal(b.status,400);assert.equal(calls.length,0);
});
test("only trusted closed MT5 candles reach GPT-6 and output is research-only",async()=>{
 const {network,calls}=mockCalls();const x=await run(request(),ENV,{fetch:network});
 assert.equal(x.status,200);assert.equal(x.data.decision,"WATCH_BUY");
 assert.equal(x.data.mode,"READ_ONLY");assert.equal(x.data.canEnter,false);assert.equal(x.data.isExecutedTrade,false);
 assert.equal(x.data.source,"VANTAGE_MT5_BRIDGE");assert.equal(x.data.fundamentalFeedStatus,"UNAVAILABLE");
 assert.equal(x.headers.get("Cache-Control"),"no-store");assert.equal(calls.length,2);
 assert.match(calls[0].url,/^https:\/\/bridge\.hazim5011\.com\/multi-bars/);
 assert.equal(new URL(calls[0].url).searchParams.get("symbol"),"XAUUSD247");
 assert.equal(calls[0].opt.headers["X-Bridge-Key"],ENV.BROKER_BRIDGE_KEY);
 assert.equal(calls[1].url,"https://api.openai.com/v1/responses");
 const p=JSON.parse(calls[1].opt.body),d=JSON.parse(p.input[1].content);
 assert.equal(p.model,"gpt-6-astra");assert.equal(p.store,false);
 assert.equal(d.fundamentalFeed.status,"UNAVAILABLE");
 assert.equal(d.closedBars.M15.length,60);assert.equal(d.closedBars.H1.length,60);
 assert.equal(JSON.stringify(x.data).includes(ENV.OPENAI_API_KEY),false);
});
test("stale broker tick prevents all OpenAI calls",async()=>{
 const {network,calls}=mockCalls({stale:true});const x=await run(request(),ENV,{fetch:network});
 assert.equal(x.status,503);assert.equal(x.data.decision,"WAIT");assert.equal(calls.length,1);
});
test("invalid model research fails closed",async()=>{
 const {network,calls}=mockCalls({badModel:true});const x=await run(request(),ENV,{fetch:network});
 assert.equal(x.status,502);assert.equal(x.data.decision,"WAIT");assert.equal(calls.length,2);
});
