// Shared verified INPUT primitives only. AI and Market Study have SEPARATE decision,
// entry, risk, target and invalidation engines. Pure functions; no orders or ML claims.
export const TF_SECONDS=Object.freeze({M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400});
// Independent parser: shares Vantage candle input CONTRACT, NOT the legacy
// trigger/entry/SL/TP calculation. The currently forming bar is excluded.
export function normalizedClosedBars(raw=[],tf="M15",nowSec=Math.floor(Date.now()/1000),offset=10800){
 const period=TF_SECONDS[tf];if(!period||!Array.isArray(raw))return [];
 const series=raw.map(b=>({t:val(b?.t),o:val(b?.o),h:val(b?.h),l:val(b?.l),c:val(b?.c),v:val(b?.v)}))
  .filter(b=>[b.t,b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.h>=Math.max(b.o,b.c,b.l)&&b.l<=Math.min(b.o,b.c))
  .sort((a,b)=>a.t-b.t);
 const clean=series.filter((x,i)=>!i||x.t>series[i-1].t);
 return clean.filter(x=>x.t-offset+period<=nowSec-1);
}
export const val=x=>x!==undefined&&x!==null&&x!==""&&Number.isFinite(Number(x))?Number(x):null;
export const rnd=(x,n=2)=>val(x)===null?null:Number(Number(x).toFixed(n));
export const clamp=(x,lo,hi)=>Math.min(hi,Math.max(lo,x));
export const isGold=s=>/^(XAU|GOLD)/i.test(String(s||""));
export function volatility(a,n=14){
 if(a.length<Math.max(15,n+1))return null;
 let s=0;
 for(let i=a.length-n;i<a.length;i++){
  const x=a[i],p=a[i-1];
  s+=Math.max(x.h-x.l,Math.abs(x.h-p.c),Math.abs(x.l-p.c));
 }
 return s/n;
}
export function movingAverage(a,n){
 if(a.length<n)return null;
 return a.slice(-n).reduce((sum,x)=>sum+x.c,0)/n;
}
export function trend(a){
 const fast=movingAverage(a,20),slow=movingAverage(a,50),previous=movingAverage(a.slice(0,-3),20);
 if(fast===null||slow===null||previous===null)return 0;
 const p=volatility(a);
 if(!p)return 0;
 if(fast>slow+.07*p&&fast>previous&&a.at(-1).c>fast)return 1;
 if(fast<slow-.07*p&&fast<previous&&a.at(-1).c<fast)return -1;
 return 0;
}
export function pivotLevels(a,wing=2){
 const high=[],low=[];
 for(let i=wing;i<a.length-wing;i++){
  let h=true,l=true;
  for(let j=1;j<=wing;j++){
   if(a[i].h<=a[i-j].h||a[i].h<a[i+j].h)h=false;
   if(a[i].l>=a[i-j].l||a[i].l>a[i+j].l)l=false;
  }
  if(h)high.push({price:a[i].h,time:a[i].t,index:i});
  if(l)low.push({price:a[i].l,time:a[i].t,index:i});
 }
 return {high,low};
}
export function nearestAbove(prices,px){return prices.filter(p=>p>px).sort((a,b)=>a-b)[0]??null}
export function nearestBelow(prices,px){return prices.filter(p=>p<px).sort((a,b)=>b-a)[0]??null}
export function context({symbol,tf,bars,h1,h4,quote,offsetSeconds=10800,nowSec=Math.floor(Date.now()/1000)}={}){
 if(!TF_SECONDS[tf]||!Number.isInteger(offsetSeconds)||Math.abs(offsetSeconds)>50400)
  return {ok:false,status:"DATA_UNVERIFIED",reason:"TF_OR_BROKER_UTC_OFFSET_INVALID"};
 const c=normalizedClosedBars(bars,tf,nowSec,offsetSeconds),
  a1=normalizedClosedBars(h1,"H1",nowSec,offsetSeconds),
  a4=normalizedClosedBars(h4,"H4",nowSec,offsetSeconds);
 const info={symbol,tf,nowSec,brokerUtcOffsetSeconds:offsetSeconds,
  updatedAtUTC:new Date(nowSec*1000).toISOString(),closedCandleCount:c.length};
 if(c.length<55||a1.length<55||a4.length<55)
  return {ok:false,status:"DATA_UNVERIFIED",reason:"INSUFFICIENT_CLOSED_MTF_CANDLES",...info};
 const last=c.at(-1),sec=TF_SECONDS[tf],closedEpoch=last.t-offsetSeconds+sec;
 const bid=val(quote?.bid),ask=val(quote?.ask),qTime=val(quote?.tickTime),qObs=val(quote?.observedAt);
 const quoteAge=qTime!==null&&qObs!==null?qObs-(qTime-offsetSeconds):null;
 const sampleAge=qObs===null?null:nowSec-qObs;
 const fresh=bid!==null&&ask!==null&&bid>0&&ask>=bid&&quoteAge!==null&&quoteAge>=-20&&quoteAge<=35&&sampleAge!==null&&sampleAge>=-25&&sampleAge<=35;
 const candleAge=nowSec-closedEpoch;
 const base={...info,c,a1,a4,last,bid,ask,quoteAgeSeconds:rnd(quoteAge,0),
  ageSeconds:rnd(candleAge,0),closedAtUTC:new Date(closedEpoch*1000).toISOString(),
  h1Trend:trend(a1),h4Trend:trend(a4),atr:volatility(c),higherAtr:volatility(a1)};
 if(!fresh||candleAge< -2||candleAge>Math.max(sec*2,300))
  return {...base,ok:false,status:"MARKET_OFFLINE",reason:!fresh?"BROKER_TICK_MISSING_OR_STALE":"CLOSED_CANDLE_STALE"};
 if(!base.atr||!base.higherAtr)return {...base,ok:false,status:"DATA_UNVERIFIED",reason:"ATR_UNAVAILABLE"};
 return {...base,ok:true};
}
export function publicFields(ctx){
 const {symbol,tf,updatedAtUTC,closedAtUTC,closedCandleCount,brokerUtcOffsetSeconds,
  bid,ask,quoteAgeSeconds,ageSeconds,h1Trend,h4Trend}=ctx;
 return {symbol,tf,updatedAtUTC,closedAtUTC,closedCandleCount,brokerUtcOffsetSeconds,
  bid,ask,quoteAgeSeconds,ageSeconds,h1Trend,h4Trend,
  technicalSource:"VANTAGE_CLOSED_CANDLES"};
}
export function protective(status,ctx,reason,more={}){
 return {ok:ctx?.ok!==false,status,canEnter:false,isExecutedTrade:false,reason,...publicFields(ctx||{}),...more};
}
export function riskLevels({side,entryLow,entryHigh,stop,targets}){
 const d=side==="BUY"?1:-1;
 const mid=(entryLow+entryHigh)/2,risk=d*(mid-stop);
 if(!Number.isFinite(risk)||risk<=0||entryLow>=entryHigh||!Array.isArray(targets)||targets.length!==3
  ||targets.some((t,i)=>!Number.isFinite(t)||d*(t-mid)<=0||(i&&d*(t-targets[i-1])<=0)))return null;
 return {side,entryLow:rnd(entryLow),entryHigh:rnd(entryHigh),invalidation:rnd(stop),
  tp1:rnd(targets[0]),tp2:rnd(targets[1]),tp3:rnd(targets[2]),riskPriceMove:rnd(risk)};
}
