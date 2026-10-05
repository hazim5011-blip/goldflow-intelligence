const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(x,a=0,b=100)=>Math.max(a,Math.min(b,x));
const canonical=s=>String(s||"").toUpperCase().replace(/[.#].*$/,"").replace(/[^A-Z0-9]/g,"");
const validBar=b=>b&&n(b.t)!=null&&n(b.o)!=null&&n(b.h)!=null&&n(b.l)!=null&&n(b.c)!=null&&Number(b.h)>=Number(b.l);

function emaSeries(values,period){
  const alpha=2/(period+1),out=[];let e=null;
  for(const raw of values){
    const v=n(raw);if(v==null){out.push(null);continue}
    e=e==null?v:(alpha*v+(1-alpha)*e);out.push(e);
  }
  return out;
}
function atrSeries(bars,period=14){
  const tr=[];for(let i=0;i<bars.length;i++){
    const b=bars[i],prev=i?bars[i-1].c:null;
    const x=prev==null?b.h-b.l:Math.max(b.h-b.l,Math.abs(b.h-prev),Math.abs(b.l-prev));
    tr.push(x);
  }
  const alpha=1/period,out=[];let a=null;
  for(let i=0;i<tr.length;i++){a=a==null?tr[i]:(alpha*tr[i]+(1-alpha)*a);out.push(i+1<period?null:a)}
  return out;
}
function percentileRank(arr,x){
  const a=arr.filter(v=>n(v)!=null).map(Number);if(!a.length||n(x)==null)return null;
  const below=a.filter(v=>v<=Number(x)).length;return 100*below/a.length;
}
function sign(x,eps=1e-9){return x>eps?1:x<-eps?-1:0}

export function buildSmartFeatures(analysis){
  const raw=(analysis?.chartBars||[]).filter(validBar).map(b=>({t:Number(b.t),o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:n(b.v)}));
  // analyze.js intentionally includes the current forming candle. Smart Quant uses closed candles only.
  const bars=raw.length>1?raw.slice(0,-1):[];
  if(bars.length<60)return {ready:false,reason:"INSUFFICIENT_CLOSED_BARS",closedBars:bars.length};

  const closes=bars.map(b=>b.c),e20=emaSeries(closes,20),e50=emaSeries(closes,50),atr=atrSeries(bars,14);
  const i=bars.length-1,last=bars[i],atrNow=n(atr[i]),ema20=n(e20[i]),ema50=n(e50[i]);
  if(!(atrNow>0)||ema20==null||ema50==null)return {ready:false,reason:"FEATURE_WARMUP_INCOMPLETE",closedBars:bars.length};

  const back=Math.max(0,i-5),slope20=(ema20-(n(e20[back])??ema20))/atrNow;
  const emaSpread=(ema20-ema50)/atrNow;
  const atrPcts=atr.map((a,j)=>n(a)!=null&&bars[j].c?100*a/bars[j].c:null).slice(-120);
  const atrPct=100*atrNow/last.c,atrPercentile=percentileRank(atrPcts,atrPct);
  const lookback=bars.slice(Math.max(0,bars.length-21),-1);
  const priorHigh=Math.max(...lookback.map(b=>b.h)),priorLow=Math.min(...lookback.map(b=>b.l));
  const range=last.h-last.l,body=Math.abs(last.c-last.o);
  const upperWick=last.h-Math.max(last.o,last.c),lowerWick=Math.min(last.o,last.c)-last.l;
  // A sweep must show rejection, not merely make a normal trend continuation high/low.
  const sweepDown=last.l<priorLow&&last.c>priorLow&&last.c>last.o&&lowerWick>Math.max(body,.15*atrNow);
  const sweepUp=last.h>priorHigh&&last.c<priorHigh&&last.c<last.o&&upperWick>Math.max(body,.15*atrNow);
  const breakoutUp=last.c>priorHigh&&range>=1.15*atrNow;
  const breakoutDown=last.c<priorLow&&range>=1.15*atrNow;

  const tick=analysis?.tick||{},spread=n(tick.spread),spreadToAtr=spread!=null?spread/atrNow:null;
  const sig=analysis?.indicator?.latestSignal||{},entry=n(sig.entry),price=n(analysis?.price);
  const entryDistanceAtr=entry!=null&&price!=null?Math.abs(price-entry)/atrNow:null;
  const setupTrend=sign(n(analysis?.indicator?.setupState?.trend)??0);
  const biasTrend=sign(n(analysis?.indicator?.biasState?.trend)??0);
  const signalDirection=sign(n(sig.direction)??0);

  return {
    ready:true,closedBars:bars.length,lastClosedTime:last.t,lastClose:last.c,
    atr14:atrNow,atrPct,atrPercentile,ema20,ema50,emaSpreadAtr:emaSpread,ema20SlopeAtr5:slope20,
    prior20High:priorHigh,prior20Low:priorLow,rangeAtr:range/atrNow,bodyAtr:body/atrNow,
    sweepDown,sweepUp,breakoutUp,breakoutDown,
    spread,spreadToAtr,entryDistanceAtr,
    signalDirection,signalScore:n(sig.score),setupTrend,biasTrend,
    mtfConflict:setupTrend!==0&&biasTrend!==0&&setupTrend!==biasTrend
  };
}

export function assessDataHealth(analysis,macro,features){
  const checks=[];let hardBlock=false,score=100;
  const add=(id,status,detail,penalty=0,hard=false)=>{checks.push({id,status,detail});score-=penalty;if(hard)hardBlock=true};

  if(!analysis?.ok||!analysis?.ready)add("BROKER_ANALYSIS","FAIL","Broker analysis is not ready.",50,true);
  else add("BROKER_ANALYSIS","PASS","Broker analysis ready.");

  const state=String(analysis?.marketState||"UNKNOWN");
  if(state==="MT5_LIVE")add("BROKER_FRESHNESS","PASS","Vantage MT5 candle clock is live.");
  else if(/STALE|MISMATCH|UNVERIFIED/.test(state))add("BROKER_FRESHNESS","FAIL",state,35,true);
  else add("BROKER_FRESHNESS","CAUTION",state,12,false);

  if(features?.ready&&features.closedBars>=100)add("CANDLE_WINDOW","PASS",features.closedBars+" closed candles available.");
  else if(features?.ready)add("CANDLE_WINDOW","CAUTION",features.closedBars+" closed candles; limited regime depth.",10,false);
  else add("CANDLE_WINDOW","FAIL",features?.reason||"Insufficient candle features.",30,true);

  if(features?.spreadToAtr==null)add("SPREAD_QUALITY","CAUTION","Spread/ATR unavailable.",8,false);
  else if(features.spreadToAtr<=.15)add("SPREAD_QUALITY","PASS","Spread is "+(100*features.spreadToAtr).toFixed(1)+"% of ATR14.");
  else if(features.spreadToAtr<=.35)add("SPREAD_QUALITY","CAUTION","Spread is "+(100*features.spreadToAtr).toFixed(1)+"% of ATR14.",12,false);
  else add("SPREAD_QUALITY","FAIL","Spread is "+(100*features.spreadToAtr).toFixed(1)+"% of ATR14.",25,true);

  const root=canonical(analysis?.symbol||analysis?.requested),gold=root.startsWith("XAU");
  if(gold){
    if(!macro?.ok)add("MACRO_COVERAGE","CAUTION","Macro engine unavailable; Gold context incomplete.",12,false);
    else{
      const q=macro.quality||{},total=n(q.total)||0,fresh=n(q.fresh)||0,ratio=total?fresh/total:0;
      if(ratio>=.7)add("MACRO_COVERAGE","PASS",fresh+"/"+total+" macro fields fresh.");
      else if(ratio>=.4)add("MACRO_COVERAGE","CAUTION",fresh+"/"+total+" macro fields fresh.",10,false);
      else add("MACRO_COVERAGE","CAUTION",fresh+"/"+total+" macro fields fresh; macro conviction reduced.",18,false);
    }
  }else add("MACRO_COVERAGE","NA","Gold-specific macro gate not applied to this symbol.");

  score=clamp(Math.round(score));
  return {score,status:hardBlock?"BAD":score>=85?"GOOD":score>=65?"WARN":"POOR",hardBlock,checks};
}

export function isGoldSymbol(symbol){return canonical(symbol).startsWith("XAU")}
export {n,clamp,sign};
