import test from "node:test";
import assert from "node:assert/strict";
import * as r2 from "./forward-r2.js";
import {normalizePublishedPayload as vercelPublished,normalizeOutcomePayload as vercelOutcome} from "../api/_v8Ledger.js";

class MemoryR2{
 constructor(){this.map=new Map()}
 async put(key,value,options={}){
  if(options.onlyIf&&this.map.has(key))return null;
  const raw=String(value),etag="etag-"+(this.map.size+1);
  this.map.set(key,{raw,etag,options});
  return {key,etag,size:raw.length};
 }
 async get(key){
  const hit=this.map.get(key);
  if(!hit)return null;
  return {size:hit.raw.length,text:async()=>hit.raw,etag:hit.etag};
 }
}
function fixture(){
 const now=new Date("2026-10-07T00:00:30.000Z");
 const close=Date.parse("2026-10-07T00:00:00.000Z")/1000,lastStart=close-300,candles=[];
 for(let i=24;i>=0;i--){const t=lastStart-i*300;candles.push({t,o:100,h:101,l:99,c:100.2,v:10+i})}
 const body={
  symbolResolved:"XAUUSD247",indicatorId:"105",indicatorVersion:"1.05",tf:"M5",direction:1,
  signalCandleCloseUTC:"2026-10-07T00:00:00.000Z",entry:100,originalSL:99,tp1:101,tp2:102,tp3:103,
  closedCandles:candles,spec:{point:.01,pipSize:.1,tickSize:.01,tickValueProfit:1,tickValueLoss:1,
   currencyProfit:"USD",contractSize:100,volumeMin:.01,volumeStep:.01}
 };
 return {body,now};
}
test("Cloudflare normalization stays byte-compatible with Vercel ledger schema",()=>{
 const {body,now}=fixture();
 const a=r2.normalizePublishedPayload(body,now),b=vercelPublished(body,now);
 assert.deepEqual(a,b);
 const outcomeBody={date:a.receivedAtUTC.slice(0,10),signalId:a.signalId,outcome:"TP1",exitPrice:101,
  exitTimeUTC:"2026-10-07T00:02:00.000Z",exitRule:"TEST_TP1"};
 const later=new Date("2026-10-07T00:02:30.000Z");
 assert.deepEqual(r2.normalizeOutcomePayload(outcomeBody,a,later),vercelOutcome(outcomeBody,b,later));
});
test("R2 adapter stays disabled without binding or secret",()=>{
 assert.equal(r2.forwardConfigured({}),false);
 assert.equal(r2.publicReadEnabled({}),false);
 assert.equal(r2.validateSecret("x".repeat(32),{}),false);
});
test("R2 adapter writes immutable publication and verifies read hash",async()=>{
 const bucket=new MemoryR2(),secret="s".repeat(40),env={GF_FORWARD_R2:bucket,FORWARD_INGEST_SECRET:secret,FORWARD_PUBLIC_READ:"true"};
 assert.equal(r2.forwardConfigured(env),true);assert.equal(r2.publicReadEnabled(env),true);
 assert.equal(r2.validateSecret(secret,env),true);assert.equal(r2.validateSecret("wrong",env),false);
 const {body,now}=fixture(),record=r2.normalizePublishedPayload(body,now);
 const stored=await r2.storePublished(record,env);assert.match(stored.pathname,/published\.json$/);
 await assert.rejects(()=>r2.storePublished(record,env),/IMMUTABLE_OBJECT_ALREADY_EXISTS/);
 const read=await r2.readForward(record.receivedAtUTC.slice(0,10),record.signalId,env);
 assert.equal(read.recordHash,record.recordHash);assert.equal(read.signalId,record.signalId);
});
test("R2 adapter stores separate immutable outcome event",async()=>{
 const bucket=new MemoryR2(),secret="k".repeat(40),env={GF_FORWARD_R2:bucket,FORWARD_INGEST_SECRET:secret,FORWARD_PUBLIC_READ:"true"};
 const {body,now}=fixture(),record=r2.normalizePublishedPayload(body,now);await r2.storePublished(record,env);
 const event=r2.normalizeOutcomePayload({date:record.receivedAtUTC.slice(0,10),signalId:record.signalId,outcome:"TP1",exitPrice:101,
  exitTimeUTC:"2026-10-07T00:02:00.000Z",exitRule:"TEST_TP1"},record,new Date("2026-10-07T00:02:30.000Z"));
 await r2.storeOutcome(event,env);await assert.rejects(()=>r2.storeOutcome(event,env),/IMMUTABLE_OBJECT_ALREADY_EXISTS/);
 const read=await r2.readForwardOutcome(event.date,event.signalId,env);
 assert.equal(read.eventHash,event.eventHash);assert.equal(read.outcome,"TP1");
});
