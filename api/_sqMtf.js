const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const TFS=["M1","M5","M15","M30","H1","H4","D1"];

function ema(values,period){
  const k=2/(period+1);let e=null;return values.map(v=>{v=n(v);if(v==null)return null;e=e==null?v:k*v+(1-k)*e;return e});
}
function atr(bars,period=14){
  let a=null;const alpha=1/period,out=[];
  for(let i=0;i<bars.length;i++){
    const b=bars[i],prev=i?bars[i-1].c:null;
    const tr=prev==null?b.h-b.l:Math.max(b.h-b.l,Math.abs(b.h-prev),Math.abs(b.l-prev));
    a=a==null?tr:alpha*tr+(1-alpha)*a;out.push(i+1<period?null:a);
  }
  return out;
}
function valid(b){return b&&n(b.t)!=null&&n(b.o)!=null&&n(b.h)!=null&&n(b.l)!=null&&n(b.c)!=null&&Number(b.h)>=Number(b.l)}
function one(tf,input=[],offset=0){
  const raw=input.filter(valid).map(b=>({t:Number(b.t),o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:n(b.v)}));
  const bars=raw.length>1?raw.slice(0,-1):[];
  if(bars.length<60)return {tf,ready:false,reason:"INSUFFICIENT_CLOSED_BARS",closedBars:bars.length};
  const closes=bars.map(b=>b.c),e20=ema(closes,20),e50=ema(closes,50),aa=atr(bars),i=bars.length-1,b=bars[i];
  const a=n(aa[i]),m20=n(e20[i]),m50=n(e50[i]);if(!(a>0)||m20==null||m50==null)return {tf,ready:false,reason:"WARMUP"};
  const back=Math.max(0,i-5),slope=(m20-(n(e20[back])??m20))/a,spread=(m20-m50)/a;
  const look=bars.slice(Math.max(0,bars.length-21),-1),hi=Math.max(...look.map(x=>x.h)),lo=Math.min(...look.map(x=>x.l));
  const body=Math.abs(b.c-b.o),lower=Math.min(b.o,b.c)-b.l,upper=b.h-Math.max(b.o,b.c),range=b.h-b.l;
  const sweepLow=b.l<lo&&b.c>lo&&b.c>b.o&&lower>Math.max(body,.15*a);
  const sweepHigh=b.h>hi&&b.c<hi&&b.c<b.o&&upper>Math.max(body,.15*a);
  const breakUp=b.c>hi&&range>=1.15*a,breakDown=b.c<lo&&range>=1.15*a;
  let trend="RANGE",direction=0;
  if(breakUp){trend="BREAKOUT_UP";direction=1}
  else if(breakDown){trend="BREAKOUT_DOWN";direction=-1}
  else if(sweepLow){trend="SWEEP_LOW_BULL";direction=1}
  else if(sweepHigh){trend="SWEEP_HIGH_BEAR";direction=-1}
  else if(spread>.18&&slope>.04){trend="BULLISH";direction=1}
  else if(spread<-.18&&slope<-.04){trend="BEARISH";direction=-1}
  let confidence=50+Math.min(25,Math.abs(spread)*24)+Math.min(15,Math.abs(slope)*28);
  if(direction&&Math.sign(spread)===direction&&Math.sign(slope)===direction)confidence+=5;
  confidence=clamp(Math.round(confidence),0,92);
  return {tf,ready:true,trend,direction,confidence,confidenceMeaning:"STATE_CONFIDENCE_NOT_WIN_PROBABILITY",
    close:b.c,atr14:a,ema20:m20,ema50:m50,emaSpreadAtr:spread,ema20SlopeAtr5:slope,
    structure:{prior20High:hi,prior20Low:lo,sweepLow,sweepHigh,breakoutUp:breakUp,breakoutDown:breakDown},
    lastClosedTimeUTC:new Date((b.t-offset)*1000).toISOString(),closedBars:bars.length};
}
export function buildMtfMatrix(frames={},brokerServerUTCOffsetSeconds=0,currentDirection=0){
  const rows=TFS.map(tf=>one(tf,Array.isArray(frames?.[tf])?frames[tf]:[],brokerServerUTCOffsetSeconds));
  const ready=rows.filter(x=>x.ready),dir=Math.sign(Number(currentDirection)||0);
  const aligned=dir?ready.filter(x=>x.direction===dir).length:0,opposed=dir?ready.filter(x=>x.direction===-dir).length:0,neutral=ready.length-aligned-opposed;
  const weighted=ready.reduce((s,x)=>{
    const w={M1:.5,M5:1,M15:1.25,M30:1.4,H1:1.75,H4:2,D1:2.2}[x.tf]||1;
    return {sum:s.sum+w*x.direction*(x.confidence/100),den:s.den+w};
  },{sum:0,den:0});
  const net=weighted.den?weighted.sum/weighted.den:0;
  return {rows,readyCount:ready.length,total:TFS.length,currentDirection:dir,
    alignment:{aligned,opposed,neutral},
    netDirection:net>.18?1:net<-.18?-1:0,
    netBias:net>.18?"BULLISH":net<-.18?"BEARISH":"MIXED",
    netScore:Number((100*net).toFixed(1)),
    note:"MTF matrix is a closed-candle state model. It does not reuse a lower-timeframe signal across all timeframes and is not a calibrated probability."};
}
export {TFS};
