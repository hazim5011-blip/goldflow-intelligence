import test from "node:test";
import assert from "node:assert/strict";
import {
 forwardConfigured,publicReadEnabled,validateSecret,normalizePublishedPayload,normalizeOutcomePayload,
 storePublished,storeOutcome,readForward,readForwardOutcome
} from "./forward-r2.js";

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
function publishedFixture(){
 const now=new Date("2026-10-07T00:00:30.000Z");
 const close=Date.parse("2026-10-07T00:00:00.000Z")/1000;
 const lastStart=close-300,candles=[];
 for(let i=24;i>=0;i--){const t=lastStart-i*300;candles.push({t,o:100,h:101,l:99,c:100.2,v:10+i})}
 const record=normalizePublishedPayload({
  symbolResolved:"XAUUSD247",indicatorId:"105",indicatorVersion:"1.05",tf:"M5",direction:1,
  signalCandleCloseUTC:"2026-10-07T00:00:00.000Z",entry:100,originalSL:99,tp1:101,tp2:102,tp3:103,
  closedCandles:candles,spec:{point:.01,pipSize:.1,tickSize:.01,tickValueProfit:1,tickValueLoss:1,
   currencyProfit:"USD",contractSize:100,volumeMin:.01,volumeStep:.01}
 },now);
 return {record,now};
}
test("R2 adapter stays disabled without binding or secret",()=>{
 assert.equal(forwardConfigured({}),false);
 assert.equal(publicReadEnabled({}),false);
 assert.equal(validateSecret("x".repeat(32),{}),false);
});
test("R2 adapter writes immutable publication and verifies read hash",async()=>{
 const bucket=new MemoryR2(),secret="s".repeat(40);
 const env={GF_FORWARD_R2:bucket,FORWARD_INGEST_SECRET:secret,FORWARD_PUBLIC_READ:"true"};
 assert.equal(forwardConfigured(env),true);assert.equal(publicReadEnabled(env),true);
 assert.equal(validateSecret(secret,env),true);assert.equal(validateSecret("wrong",env),false);
 const {record}=publishedFixture();
 const stored=await storePublished(record,env);
 assert.match(stored.pathname,/published\.json$/);
 await assert.rejects(()=>storePublished(record,env),/IMMUTABLE_OBJECT_ALREADY_EXISTS/);
 const read=await readForward(record.receivedAtUTC.slice(0,10),record.signalId,env);
 assert.equal(read.recordHash,record.recordHash);assert.equal(read.signalId,record.signalId);
});
test("R2 adapter stores separate immutable outcome event",async()=>{
 const bucket=new MemoryR2(),secret="k".repeat(40);
 const env={GF_FORWARD_R2:bucket,FORWARD_INGEST_SECRET:secret,FORWARD_PUBLIC_READ:"true"};
 const {record}=publishedFixture();await storePublished(record,env);
 const event=normalizeOutcomePayload({
  date:record.receivedAtUTC.slice(0,10),signalId:record.signalId,outcome:"TP1",exitPrice:101,
  exitTimeUTC:"2026-10-07T00:02:00.000Z",exitRule:"TEST_TP1"
 },record,new Date("2026-10-07T00:02:30.000Z"));
 await storeOutcome(event,env);
 await assert.rejects(()=>storeOutcome(event,env),/IMMUTABLE_OBJECT_ALREADY_EXISTS/);
 const read=await readForwardOutcome(event.date,event.signalId,env);
 assert.equal(read.eventHash,event.eventHash);assert.equal(read.outcome,"TP1");
});
