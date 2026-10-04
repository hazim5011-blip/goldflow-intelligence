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
 assert.deepEqual(first.confirmation,second.confirmation,"Forming OHLC cannot repaint the closed confirmation");
 assert.equal(second.canEnter,false,"Forming wick can only prevent unsafe entry, never create signal");
});
test("WAIT -> SELL CONFIRMED -> SELL ENTRY READY only inside verified retest and with fresh BID",()=>{
 const f=fixture(),d=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
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
 const f=fixture(),out=evaluateStudy({...f,macro:macro("SUPPORTIVE"),quote:tick(f.bars.at(-2).c)});
 assert.equal(out.status,"WAIT_CONFLICT");assert.equal(out.canEnter,false);
});
test("news mode refuses to convert incomplete official data into news-time signal",()=>{
 const f=fixture(),out=evaluateStudy({...f,mode:"news",macro:{...macro(),quality:{available:15,total:16,errors:["source"],stale:[]}},quote:tick(f.bars.at(-2).c)});
 assert.equal(out.status,"DATA_UNVERIFIED");assert.equal(out.canEnter,false);
});
test("SELL INVALID immediately on verified live price breach of initial invalidation",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
 const hit=evaluateStudy({...f,quote:tick(first.confirmation.invalidation+1)});
 assert.equal(hit.status,"SELL_INVALID");assert.equal(hit.invalidationBasis,"INTRABAR_QUOTE");
 assert.equal(hit.canEnter,false);
});
test("MISSED ENTRY does not chase downside move beyond intended SELL retest",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
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

test("BUY direction mirrors SELL: closed breakout yields BUY CONFIRMED then ASK-based READY",()=>{
 const f=fixture();
 const rising=candles(62,step,false);
 const i=rising.length-2,prev=rising[i-1],o=prev.c+.15,c=prev.h+3;
 rising[i]={...rising[i],o,c,h:c+.2,l:o-.18};
 const one=candles(65,3600,false),four=candles(65,14400,false);
 const base={...f,bars:rising,h1:one,h4:four,macro:macro("SUPPORTIVE")};
 const first=evaluateStudy({...base,quote:tick(c)});
 assert.equal(first.status,"BUY_CONFIRMED");
 assert.equal(first.canEnter,false);
 assert.equal(first.confirmation.direction,1);
 const mid=(first.confirmation.entryLow+first.confirmation.entryHigh)/2;
 const ready=evaluateStudy({...base,quote:{...tick(mid-.04),ask:mid}});
 assert.equal(ready.status,"BUY_ENTRY_READY");
 assert.equal(ready.entryQuoteSide,"ASK");
 assert.equal(ready.canEnter,true);
});
test("a subsequent fully closed bar breaching original SL yields SELL INVALID (CLOSE)",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
 assert.equal(first.status,"SELL_CONFIRMED");
 const next=structuredClone(f),x=next.bars.at(-1);
 x.o=first.confirmation.invalidation-.5;
 x.c=first.confirmation.invalidation+1.1;
 x.h=x.c+.12;x.l=x.o-.2;
 const later=now+900;
 const invalid=evaluateStudy({...next,nowSec:later,quote:{bid:first.confirmation.entryHigh,ask:first.confirmation.entryHigh+.04,
   tickTime:later+offset,observedAt:later}});
 assert.equal(invalid.status,"SELL_INVALID");
 assert.equal(invalid.invalidationBasis,"CLOSE");
 assert.equal(invalid.canEnter,false);
});

test("a previously reached TP1 permanently retires the old confirmation, no false READY",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
 assert.equal(first.status,"SELL_CONFIRMED");
 const next=structuredClone(f),last=next.bars.at(-1),start=first.confirmation.entryHigh;
 last.o=start;last.c=start+.01;last.h=start+.3;last.l=first.confirmation.tp1-.25; // wick TP1
 const when=now+900;
 const d=evaluateStudy({...next,nowSec:when,quote:{bid:start,ask:start+.04,tickTime:when+offset,observedAt:when}});
 assert.equal(d.status,"COMPLETED_STUDY");assert.equal(d.canEnter,false);
});
test("same OHLC candle touching both stop and TP fails closed as AMBIGUOUS_PATH",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
 const next=structuredClone(f),last=next.bars.at(-1),start=first.confirmation.entryHigh;
 last.o=start;last.c=start+.01;last.h=first.confirmation.invalidation+.25;last.l=first.confirmation.tp1-.25;
 const when=now+900;
 const d=evaluateStudy({...next,nowSec:when,quote:{bid:start,ask:start+.04,tickTime:when+offset,observedAt:when}});
 assert.equal(d.status,"AMBIGUOUS_PATH");assert.equal(d.canEnter,false);
});

test("an observed forming-candle wick touching old SL never reactivates READY on retracement",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
 assert.equal(first.status,"SELL_CONFIRMED");
 const z=structuredClone(f),b=z.bars.at(-1);
 b.h=first.confirmation.invalidation+1;b.l=Math.min(b.l,first.confirmation.entryLow-.1);
 b.o=first.confirmation.entryHigh;b.c=first.confirmation.entryHigh;
 const after=evaluateStudy({...z,quote:tick((first.confirmation.entryLow+first.confirmation.entryHigh)/2)});
 assert.equal(after.status,"SELL_INVALID");
 assert.equal(after.invalidationBasis,"FORMING_BAR_EXTREME");
 assert.equal(after.canEnter,false);
 assert.deepEqual(after.confirmation,first.confirmation);
});
test("an observed forming-candle wick reaching TP1 retires previous entry even before candle close",()=>{
 const f=fixture(),first=evaluateStudy({...f,quote:tick(f.bars.at(-2).c)});
 const z=structuredClone(f),b=z.bars.at(-1),mid=(first.confirmation.entryLow+first.confirmation.entryHigh)/2;
 b.o=mid;b.c=mid;b.h=Math.max(b.h,first.confirmation.entryHigh+.05);
 b.l=first.confirmation.tp1-.1;
 const after=evaluateStudy({...z,quote:tick(mid)});
 assert.equal(after.status,"COMPLETED_STUDY");
 assert.equal(after.canEnter,false);
});
