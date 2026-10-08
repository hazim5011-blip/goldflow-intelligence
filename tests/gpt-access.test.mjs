import test from "node:test";
import assert from "node:assert/strict";
import {verifyGptIdentity,quotaCheck} from "../cloudflare/gpt-access.js";
import {gptFundamentals} from "../cloudflare/gpt-fundamentals.js";
const raw=v=>Buffer.from(JSON.stringify(v)).toString("base64url");
async function jwtSetup(){
 const keys=await crypto.subtle.generateKey({name:"RSASSA-PKCS1-v1_5",modulusLength:2048,
  publicExponent:new Uint8Array([1,0,1]),hash:"SHA-256"},true,["sign","verify"]);
 const jwk=await crypto.subtle.exportKey("jwk",keys.publicKey);
 const now=Math.floor(Date.now()/1000),issuer="https://test-goldflow.cloudflareaccess.com",aud="aud-123";
 async function sign(body={}){
  const head=raw({alg:"RS256",typ:"JWT",kid:"goldflow-test-key"});
  const payload=raw({iss:issuer,aud:[aud],sub:"owner-001",iat:now,exp:now+3600,...body});
  const sig=await crypto.subtle.sign("RSASSA-PKCS1-v1_5",keys.privateKey,new TextEncoder().encode(head+"."+payload));
  return head+"."+payload+"."+Buffer.from(sig).toString("base64url");
 }
 const network=async(url)=>{assert.equal(url,issuer+"/cdn-cgi/access/certs");return new Response(JSON.stringify({keys:[{...jwk,kid:"goldflow-test-key",alg:"RS256"}]}))};
 return {sign,network,aud};
}
test("verified Cloudflare Access JWT signs owner identity without browser shared secret",async()=>{
 const {sign,network,aud}=await jwtSetup();
 const token=await sign();
 const req=new Request("https://gf.test/api/gpt-research",{headers:{"Cf-Access-Jwt-Assertion":token}});
 const user=await verifyGptIdentity(req,{GF_GPT_ACCESS_TEAM:"test-goldflow",GF_GPT_ACCESS_AUD:aud},network);
 assert.deepEqual(user,{id:"owner-001",mode:"ACCESS"});
});
test("forged Cloudflare header is not authentication",async()=>{
 const {sign,network,aud}=await jwtSetup();
 const token=(await sign()).slice(0,-4)+"xxxx";
 const req=new Request("https://gf.test/api/gpt-research",{headers:{"Cf-Access-Jwt-Assertion":token}});
 assert.equal(await verifyGptIdentity(req,{GF_GPT_ACCESS_TEAM:"test-goldflow",GF_GPT_ACCESS_AUD:aud},network),null);
});
test("Access JWT with wrong audience and expired token denied",async()=>{
 const {sign,network,aud}=await jwtSetup();
 for(const body of [{aud:["unrelated"]},{exp:Math.floor(Date.now()/1000)-10}]){
  const req=new Request("https://gf.test/api/gpt-research",{headers:{"Cf-Access-Jwt-Assertion":await sign(body)}});
  assert.equal(await verifyGptIdentity(req,{GF_GPT_ACCESS_TEAM:"test-goldflow",GF_GPT_ACCESS_AUD:aud},network),null);
 }
});
test("KV quota disabled without binding; repeated request blocked",async()=>{
 const identity={id:"owner-001"},map=new Map(),kv={
  get:async k=>map.get(k)||null,put:async(k,v)=>map.set(k,v)};
 assert.equal((await quotaCheck(identity,{},Math.floor(Date.now()/1000))).code,"RATE_STORE_NOT_CONFIGURED");
 const env={GF_GPT_RATE_KV:kv,GF_GPT_DAILY_LIMIT:"2"};
 const first=await quotaCheck(identity,env,Math.floor(Date.now()/1000));
 assert.equal(first.ok,true);assert.equal(first.remaining,1);
 assert.equal((await quotaCheck(identity,env,Math.floor(Date.now()/1000))).code,"RESEARCH_COOLDOWN");
});
test("optional macro is off by default and never invents data",async()=>{
 const snap=await gptFundamentals({},async()=>{throw Error("should not fetch")});
 assert.equal(snap.status,"UNAVAILABLE");assert.equal(snap.cards.length,0);
});
test("enabled macro allows dated official values but excludes stale/derived rows",async()=>{
 const current=new Date().toISOString(),observed=current.slice(0,10);
 const provider=async()=>new Response(JSON.stringify({ok:true,fetchedAt:current,
   provider:"official",quality:{fresh:1,official:1,primarySourceHealth:"OK",secondaryMirror:[]},
   cards:[{id:"CPI",name:"CPI",value:3.1,date:observed,source:"Bureau of Labor Statistics",status:"OFFICIAL",stale:false},
    {id:"FAKE",value:99,date:observed,source:"model",status:"DERIVED",stale:false}]}));
 const result=await gptFundamentals({GF_GPT_INCLUDE_MACRO:"1"},provider,Date.now());
 assert.equal(result.status,"PARTIAL");assert.equal(result.cards.length,1);
 assert.equal(result.cards[0].source,"Bureau of Labor Statistics");
});
