(function(root){
 "use strict";
 const finite=v=>v!==null&&v!==undefined&&Number.isFinite(Number(v));
 const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 const round=(v,d=4)=>finite(v)?Number(Number(v).toFixed(d)):null;
 function clean(bars){
  return (Array.isArray(bars)?bars:[]).map(b=>({o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:finite(b.v)?Number(b.v):null,t:Number(b.t)}))
   .filter(b=>[b.o,b.h,b.l,b.c,b.t].every(Number.isFinite)&&b.h>=Math.max(b.o,b.c,b.l)&&b.l<=Math.min(b.o,b.c))
   .sort((a,b)=>a.t-b.t);
 }
 function sma(a,n){return a.length>=n?avg(a.slice(-n)):null}
 function emaSeries(a,n){
  if(a.length<n)return [];
  const k=2/(n+1),out=new Array(a.length).fill(null);let e=avg(a.slice(0,n));out[n-1]=e;
  for(let i=n;i<a.length;i++){e=a[i]*k+e*(1-k);out[i]=e}
  return out;
 }
 function ema(a,n){const s=emaSeries(a,n);return s.length?s[s.length-1]:null}
 function rsi(a,n=14){
  if(a.length<n+1)return null;let gain=0,loss=0;
  for(let i=a.length-n;i<a.length;i++){const d=a[i]-a[i-1];if(d>0)gain+=d;else loss-=d}
  if(loss===0)return 100;const rs=(gain/n)/(loss/n);return 100-(100/(1+rs));
 }
 function stoch(b,n=14,dn=3){
  if(b.length<n)return {k:null,d:null};
  const ks=[];
  for(let i=Math.max(n-1,b.length-dn);i<b.length;i++){
   const w=b.slice(i-n+1,i+1),hi=Math.max(...w.map(x=>x.h)),lo=Math.min(...w.map(x=>x.l));
   ks.push(hi===lo?50:100*(b[i].c-lo)/(hi-lo));
  }
  return {k:ks.length?ks[ks.length-1]:null,d:ks.length?avg(ks):null};
 }
 function cci(b,n=20){
  if(b.length<n)return null;const w=b.slice(-n),tp=w.map(x=>(x.h+x.l+x.c)/3),m=avg(tp),dev=avg(tp.map(x=>Math.abs(x-m)));
  return dev===0?0:(tp[tp.length-1]-m)/(.015*dev);
 }
 function momentum(a,n=10){return a.length>n?a[a.length-1]-a[a.length-1-n]:null}
 function atr(b,n=14){
  if(b.length<n+1)return null;const tr=[];
  for(let i=b.length-n;i<b.length;i++){const p=b[i-1].c,x=b[i];tr.push(Math.max(x.h-x.l,Math.abs(x.h-p),Math.abs(x.l-p)))}
  return avg(tr);
 }
 function boll(a,n=20,m=2){
  if(a.length<n)return {mid:null,upper:null,lower:null};
  const w=a.slice(-n),mid=avg(w),sd=Math.sqrt(avg(w.map(x=>(x-mid)*(x-mid))));
  return {mid,upper:mid+m*sd,lower:mid-m*sd};
 }
 function macd(a){
  if(a.length<35)return {line:null,signal:null,hist:null};
  const e12=emaSeries(a,12),e26=emaSeries(a,26),m=[];
  for(let i=0;i<a.length;i++)if(e12[i]!=null&&e26[i]!=null)m.push(e12[i]-e26[i]);
  const sig=ema(m,9),line=m.length?m[m.length-1]:null;
  return {line,signal:sig,hist:line!=null&&sig!=null?line-sig:null};
 }
 function actionByBand(v,lo,hi){return !finite(v)?"N/A":v<lo?"BUY":v>hi?"SELL":"NEUTRAL"}
 function maAction(close,v){return !finite(v)||!finite(close)?"N/A":close>v?"BUY":close<v?"SELL":"NEUTRAL"}
 function row(name,value,action,group,detail){return {name,value:round(value,6),action,group,detail:detail||""}}
 function tally(rows){
  const out={BUY:0,SELL:0,NEUTRAL:0,NA:0};
  rows.forEach(r=>{if(r.action==="BUY")out.BUY++;else if(r.action==="SELL")out.SELL++;else if(r.action==="NEUTRAL")out.NEUTRAL++;else out.NA++});
  const valid=out.BUY+out.SELL+out.NEUTRAL;
  const action=!valid?"N/A":out.BUY>out.SELL&&out.BUY>=out.NEUTRAL?"BUY":out.SELL>out.BUY&&out.SELL>=out.NEUTRAL?"SELL":"NEUTRAL";
  return {...out,valid,action};
 }
 function calc(input){
  const b=clean(input),c=b.map(x=>x.c),last=b.at(-1);
  if(b.length<30||!last)return {ok:false,error:"INSUFFICIENT_BARS",count:b.length};
  const s=stoch(b),mc=macd(c),bb=boll(c),a=atr(b),cc=cci(b),mom=momentum(c),r=rsi(c);
  const osc=[
   row("RSI (14)",r,actionByBand(r,30,70),"OSC","<30 BUY • >70 SELL"),
   row("Stochastic %K (14,3)",s.k,actionByBand(s.k,20,80),"OSC","<20 BUY • >80 SELL"),
   row("CCI (20)",cc,actionByBand(cc,-100,100),"OSC","<-100 BUY • >100 SELL"),
   row("Momentum (10)",mom,!finite(mom)?"N/A":mom>0?"BUY":mom<0?"SELL":"NEUTRAL","OSC","Above/below zero"),
   row("MACD Hist (12,26,9)",mc.hist,!finite(mc.hist)?"N/A":mc.hist>0?"BUY":mc.hist<0?"SELL":"NEUTRAL","OSC","MACD minus signal")
  ];
  const mas=[];
  [10,20,30,50,100,200].forEach(n=>{const v=sma(c,n);mas.push(row("SMA ("+n+")",v,maAction(last.c,v),"MA"))});
  [10,20,30,50,100,200].forEach(n=>{const v=ema(c,n);mas.push(row("EMA ("+n+")",v,maAction(last.c,v),"MA"))});
  const info=[
   row("ATR (14)",a,"N/A","INFO","Volatility"),
   row("Bollinger Mid (20)",bb.mid,"N/A","INFO"),
   row("Bollinger Upper (20,2)",bb.upper,"N/A","INFO"),
   row("Bollinger Lower (20,2)",bb.lower,"N/A","INFO")
  ];
  const oscSummary=tally(osc),maSummary=tally(mas),overall=tally(osc.concat(mas));
  const prev=b.length>1?b[b.length-2].c:null,changePct=finite(prev)&&prev!==0?100*(last.c-prev)/prev:null;
  return {ok:true,count:b.length,last:round(last.c,8),changePct:round(changePct,4),oscillators:osc,movingAverages:mas,info,
   summaries:{oscillators:oscSummary,movingAverages:maSummary,overall},macd:{line:round(mc.line,6),signal:round(mc.signal,6),hist:round(mc.hist,6)},
   bollinger:{mid:round(bb.mid,6),upper:round(bb.upper,6),lower:round(bb.lower,6)}};
 }
 root.GFTVHybrid={calc};
})(typeof window!=="undefined"?window:globalThis);
