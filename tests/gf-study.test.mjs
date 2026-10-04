import test from "node:test";
import assert from "node:assert/strict";
import {evaluateStudy,normalizedClosedBars} from "../api/_studyEngine.js";
import {verifyOnline} from "../api/market-online.js";

const now=1900000000,offset=10800,step=900;
const macro=(bias="PRESSURE")=>({provider:"Direct official sources",gold:{bias,score:bias==="PRESSURE"?28:72},
 quality:{available:16,total:16,errors:[],stale:[]}});
function candles(n=62,period=step,fall=true){
 const arr=[];
 for(let i=0;i<n;i++){
  const t=now+offset-(n-i)*period+700;
  const p=4300+(fall?-1:1)*i*(period/step)*.25;
  const o=p,c=p+(fall?-.09:.09);
  arr.push({t,o,h:Math.max(o,c)+.22,l:Math.min(o,c)-.22,c,v:100});
 }
 return arr;
}
function fixture(){
 const bars=candles(),i=bars.length-2,prev=bars[i-1];
 // Last CLOSED M15 candle clearly breaches the previous six low levels.
 const o=prev.c-.15,c=prev.l-3;
 bars[i]={...bars[i],o,c,h:o+.18,l:c-.2};
 const h1=candles(65,3600),h4=candles(65,14400);
 return {symbol:"XAUUSD247",tf:"M15",bars,h1,h4,offsetSeconds:offset,macro:macro(),mode:"ai",nowSec:now};
}
const tick=bid=>({bid,ask:bid+.04,tickTime:now+offset,observedAt:now});
test("forming candle never confirms; normalized bars include only closed trigger candles",()=>{
 const f=fixture(),closed=normalizedClosedBars(f.bars,"M15",now,offset);
 assert.equal(closed.length,f.bars.length-1);
 const first=evaluateStudy({...f,quote:tick(4200)}),alter=structuredClone(f);
 alter.bars.at(-1).c=50000;alter.bars.at(-1).h=50001;
 const second=evaluateStudy({...alter,quote:tick(4200)});
 assert.equal(first.confirmation?.signalCandleTime,second.confirmation?.signalCandleTime);
 assert.equal(first.status,second.status);
});
test("WAIT -> SELL CONFIRMED -> SELL ENTRY READY only inside verified retest and with fresh BID",()=>{
 const f=fixture(),d=evaluateStudy({...f,quote:tick(4300)});
 assert.equal(d.status,"SELL_CONFIRMED");
 assert.equal(d.canEnter,false);
 assert.equal(d.confirmation.direction,-1);
 assert.equal(d.confirmation.confirmationType,"CLOSED_CANDLE_BREAKDOWN");
 const mid=(d.confirmation.entryLow+d.confirmation.entryHigh)/2;
 const ready=evaluateStudy({...f,quote:tick(mid)});
 assert.equal(ready.status,"SELL_ENTRY_READY");
 assert.equal(ready.entryQuoteSide,"BID");
 assert.equal(ready.canEnter,true);
 assert.equal(ready.isExecutedTrade,false);
 assert.equal(ready.confirmation.verifiedForecastSurprise,false);
});
test("a stale broker tick fails closed, even when technical candles confirm",()=>{
 const f=fixture(),z=evaluateStudy({...f,quote:{...tick(4280),tickTime:now+offset-70}});
 assert.equal(z.status,"MARKET_OFFLINE");assert.equal(z.canEnter,false);
});
test("opposite verified macro blocks a new directional confirmation",()=>{
 const f=fixture(),out=evaluateStudy({...f,macro:macro("SUPPORTIVE"),quote:tick(4300)});
 assert.equal(out.status,"WAIT_CONFLICT");assert.equal(out.canEnter,false);
});
test("news mode refuses to convert incomplete official data into news-time signal",()=>{
 const f=fixture(),out=evaluateStudy({...f,mode:"news",macro:{...macro(),quality:{available:15,total:16,errors:["source"],stale:[]}},quote:tick(4300)});
 assert.equal(out.status,"DATA_UNVERIFIED");assert.equal(out.canEnter,false);
});
test("SELL INVALID immediately on verified live price breach of initial invalidation",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(4300)});
 const hit=evaluateStudy({...f,quote:tick(first.confirmation.invalidation+1)});
 assert.equal(hit.status,"SELL_INVALID");assert.equal(hit.invalidationBasis,"INTRABAR_QUOTE");
 assert.equal(hit.canEnter,false);
});
test("MISSED ENTRY does not chase downside move beyond intended SELL retest",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(4300)});
 const far=evaluateStudy({...f,quote:tick(first.confirmation.entryLow-8)});
 assert.equal(far.status,"MISSED_ENTRY");assert.equal(far.canEnter,false);
});
test("broker ONLINE requires exact symbol + trade mode + fresh BID/ASK after UTC+3 normalization",()=>{
 const row={name:"BTCUSD",tradeMode:4},q={symbol:"BTCUSD",bid:65000,ask:65001,time:now+offset};
 assert.equal(verifyOnline(row,q,now,now,offset).status,"ONLINE");
 assert.equal(verifyOnline(row,{...q,symbol:"BTCUSD247"},now,now,offset).status,"UNKNOWN");
 assert.equal(verifyOnline({...row,tradeMode:0},q,now,now,offset).status,"TRADE_DISABLED");
 assert.equal(verifyOnline(row,{...q,time:now+offset-90},now,now,offset).status,"OFFLINE");
});
