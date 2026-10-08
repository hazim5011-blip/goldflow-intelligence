// GF-AI MARKET BRAIN v1.60 • ADAPTIVE ENTRY INTELLIGENCE
// Pure, auditable price-action intelligence. No orders, no trained-ML claims.
// Reads CLOSED broker candles and returns market structure, liquidity, zones,
// chart/candle patterns and a market-driven retest plan. Fibonacci is optional
// confluence only and is NEVER required as the primary entry model.
import {pivotLevels,volatility,rnd,clamp,riskLevels} from "./_researchInputs.js";

const N=x=>Number.isFinite(Number(x))?Number(x):null;
const near=(a,b,t)=>N(a)!==null&&N(b)!==null&&Math.abs(a-b)<=t;
const sideName=d=>d===1?"BUY":d===-1?"SELL":"NEUTRAL";

function atrAt(a){return volatility(a,14)||volatility(a,7)||null}
function recentPivots(a,wing=2){
 const p=pivotLevels(a,wing);
 return {high:p.high.slice(-10),low:p.low.slice(-10)};
}
function structuralBiasFromPivots(p,atr){
 const hs=p.high,ls=p.low;if(hs.length<2||ls.length<2||!atr)return 0;
 const h1=hs.at(-2).price,h2=hs.at(-1).price,l1=ls.at(-2).price,l2=ls.at(-1).price,t=.08*atr;
 const hh=h2>h1+t,lh=h2<h1-t,hl=l2>l1+t,ll=l2<l1-t;
 if(hh&&hl)return 1;if(lh&&ll)return -1;return 0;
}
function structureState(a,atr){
 const p=recentPivots(a),hs=p.high,ls=p.low;
 const highClass=hs.length>=2?(hs.at(-1).price>hs.at(-2).price+.08*atr?"HH":hs.at(-1).price<hs.at(-2).price-.08*atr?"LH":"EH"):"N/A";
 const lowClass=ls.length>=2?(ls.at(-1).price>ls.at(-2).price+.08*atr?"HL":ls.at(-1).price<ls.at(-2).price-.08*atr?"LL":"EL"):"N/A";
 return {bias:structuralBiasFromPivots(p,atr),highClass,lowClass,pivots:p,
  lastHigh:hs.at(-1)||null,lastLow:ls.at(-1)||null};
}
function latestBreak(a,atr,lookback=8){
 let out=null;
 for(let i=Math.max(12,a.length-lookback);i<a.length;i++){
  const prior=a.slice(0,i),p=recentPivots(prior),ph=p.high.at(-1),pl=p.low.at(-1),bar=a[i];
  if(!ph||!pl)continue;
  const priorBias=structuralBiasFromPivots(p,atr),up=bar.c>ph.price+.045*atr,down=bar.c<pl.price-.045*atr;
  if(!up&&!down)continue;
  const d=up?1:-1,level=up?ph.price:pl.price,type=priorBias&&priorBias!==d?"CHOCH":"BOS";
  out={direction:d,type,level:rnd(level),index:i,time:bar.t,close:rnd(bar.c),priorBias,
   label:(d===1?"BULLISH ":"BEARISH ")+type};
 }
 return out;
}
function liquidity(a,atr){
 const p=recentPivots(a),tol=.14*atr;
 let eqHigh=null,eqLow=null;
 for(let i=1;i<p.high.length;i++)if(near(p.high[i].price,p.high[i-1].price,tol))
  eqHigh={type:"EQUAL_HIGHS",level:rnd((p.high[i].price+p.high[i-1].price)/2),indices:[p.high[i-1].index,p.high[i].index]};
 for(let i=1;i<p.low.length;i++)if(near(p.low[i].price,p.low[i-1].price,tol))
  eqLow={type:"EQUAL_LOWS",level:rnd((p.low[i].price+p.low[i-1].price)/2),indices:[p.low[i-1].index,p.low[i].index]};
 let sweep=null;
 for(let i=Math.max(15,a.length-7);i<a.length;i++){
  const prior=a.slice(Math.max(0,i-24),i),bar=a[i];if(prior.length<8)continue;
  const hi=Math.max(...prior.map(x=>x.h)),lo=Math.min(...prior.map(x=>x.l));
  if(bar.h>hi+.04*atr&&bar.c<hi-.015*atr)sweep={direction:-1,type:"BUY_SIDE_LIQUIDITY_SWEEP",level:rnd(hi),extreme:rnd(bar.h),index:i,time:bar.t};
  if(bar.l<lo-.04*atr&&bar.c>lo+.015*atr)sweep={direction:1,type:"SELL_SIDE_LIQUIDITY_SWEEP",level:rnd(lo),extreme:rnd(bar.l),index:i,time:bar.t};
 }
 return {equalHigh:eqHigh,equalLow:eqLow,sweep};
}
function fvg(a,atr){
 let latest=null;
 for(let i=Math.max(2,a.length-16);i<a.length;i++){
  const x=a[i-2],z=a[i];
  if(z.l>x.h&&z.l-x.h>=.07*atr)latest={direction:1,type:"BULLISH_FVG",low:rnd(x.h),high:rnd(z.l),index:i,time:z.t};
  if(z.h<x.l&&x.l-z.h>=.07*atr)latest={direction:-1,type:"BEARISH_FVG",low:rnd(z.h),high:rnd(x.l),index:i,time:z.t};
 }
 return latest;
}
function orderBlock(a,atr){
 let latest=null;
 for(let i=Math.max(6,a.length-16);i<a.length;i++){
  const bar=a[i],body=Math.abs(bar.c-bar.o),prior=a.slice(i-5,i);
  if(body<.62*atr||prior.length<4)continue;
  const hi=Math.max(...prior.map(x=>x.h)),lo=Math.min(...prior.map(x=>x.l));
  const d=bar.c>hi+.03*atr?1:bar.c<lo-.03*atr?-1:0;if(!d)continue;
  for(let j=i-1;j>=Math.max(0,i-5);j--){
   const b=a[j],opp=d===1?b.c<b.o:b.c>b.o;if(!opp)continue;
   latest={direction:d,type:d===1?"BULLISH_ORDER_BLOCK":"BEARISH_ORDER_BLOCK",
    low:rnd(Math.min(b.o,b.c,b.l)),high:rnd(Math.max(b.o,b.c,b.h)),index:j,time:b.t,displacementIndex:i};break;
  }
 }
 return latest;
}
function zones(a,atr,breakEvent){
 const p=recentPivots(a),hi=p.high.at(-1),lo=p.low.at(-1);
 const demand=lo?(()=>{const b=a[lo.index];return {direction:1,type:"DEMAND",low:rnd(b.l-.04*atr),high:rnd(Math.max(b.o,b.c)+.10*atr),pivot:rnd(lo.price),index:lo.index}})():null;
 const supply=hi?(()=>{const b=a[hi.index];return {direction:-1,type:"SUPPLY",low:rnd(Math.min(b.o,b.c)-.10*atr),high:rnd(b.h+.04*atr),pivot:rnd(hi.price),index:hi.index}})():null;
 const flip=breakEvent?{direction:breakEvent.direction,type:breakEvent.direction===1?"RBS":"SBR",
  low:rnd(breakEvent.level-.14*atr),high:rnd(breakEvent.level+.14*atr),level:rnd(breakEvent.level),
  source:breakEvent.type,index:breakEvent.index}:null;
 return {demand,supply,flip,fvg:fvg(a,atr),orderBlock:orderBlock(a,atr)};
}
function candlePattern(a,atr){
 const b=a.at(-1),p=a.at(-2),p2=a.at(-3);if(!b||!p)return null;
 const range=Math.max(b.h-b.l,1e-9),body=Math.abs(b.c-b.o),lower=Math.min(b.o,b.c)-b.l,upper=b.h-Math.max(b.o,b.c);
 const bullEng=p.c<p.o&&b.c>b.o&&b.c>=p.o&&b.o<=p.c;
 const bearEng=p.c>p.o&&b.c<b.o&&b.c<=p.o&&b.o>=p.c;
 if(bullEng&&body>.16*atr)return {direction:1,type:"BULLISH_ENGULFING",strength:12};
 if(bearEng&&body>.16*atr)return {direction:-1,type:"BEARISH_ENGULFING",strength:12};
 if(lower>=Math.max(body*1.6,.18*atr)&&b.c>b.o&&(b.c-b.l)/range>.65)return {direction:1,type:"BULLISH_PIN_REJECTION",strength:10};
 if(upper>=Math.max(body*1.6,.18*atr)&&b.c<b.o&&(b.h-b.c)/range>.65)return {direction:-1,type:"BEARISH_PIN_REJECTION",strength:10};
 if(body>.72*atr&&b.c>b.o&&(b.c-b.l)/range>.72)return {direction:1,type:"BULLISH_DISPLACEMENT",strength:13};
 if(body>.72*atr&&b.c<b.o&&(b.h-b.c)/range>.72)return {direction:-1,type:"BEARISH_DISPLACEMENT",strength:13};
 if(p2){
  const bull3=[p2,p,b].every(x=>x.c>x.o)&&b.c>p.c&&p.c>p2.c;
  const bear3=[p2,p,b].every(x=>x.c<x.o)&&b.c<p.c&&p.c<p2.c;
  if(bull3)return {direction:1,type:"THREE_BULLISH_PUSHES",strength:9};
  if(bear3)return {direction:-1,type:"THREE_BEARISH_PUSHES",strength:9};
 }
 return null;
}
function chartPattern(a,atr){
 const p=recentPivots(a),hs=p.high,ls=p.low,last=a.at(-1),tol=.20*atr;
 let best=null;
 // Double top / bottom
 if(hs.length>=2){
  const a1=hs.at(-2),a2=hs.at(-1);
  if(near(a1.price,a2.price,tol)){
   const mids=ls.filter(x=>x.index>a1.index&&x.index<a2.index),neck=mids.length?Math.min(...mids.map(x=>x.price)):null;
   if(neck)best={direction:-1,type:"DOUBLE_TOP",neckline:rnd(neck),state:last.c<neck-.04*atr?"CONFIRMED":"WATCH",strength:last.c<neck-.04*atr?20:9};
  }
 }
 if(ls.length>=2){
  const a1=ls.at(-2),a2=ls.at(-1);
  if(near(a1.price,a2.price,tol)){
   const mids=hs.filter(x=>x.index>a1.index&&x.index<a2.index),neck=mids.length?Math.max(...mids.map(x=>x.price)):null;
   if(neck){const q={direction:1,type:"DOUBLE_BOTTOM",neckline:rnd(neck),state:last.c>neck+.04*atr?"CONFIRMED":"WATCH",strength:last.c>neck+.04*atr?20:9};if(!best||q.strength>best.strength)best=q}
  }
 }
 // Head & shoulders / inverse H&S
 if(hs.length>=3&&ls.length>=2){
  const [l,m,r]=hs.slice(-3),shoulders=near(l.price,r.price,.28*atr),head=m.price>Math.max(l.price,r.price)+.18*atr;
  if(shoulders&&head){
   const nls=ls.filter(x=>x.index>l.index&&x.index<r.index),neck=nls.length?Math.min(...nls.map(x=>x.price)):null;
   if(neck){const q={direction:-1,type:"HEAD_AND_SHOULDERS",neckline:rnd(neck),state:last.c<neck-.04*atr?"CONFIRMED":"WATCH",strength:last.c<neck-.04*atr?23:10};if(!best||q.strength>best.strength)best=q}
  }
 }
 if(ls.length>=3&&hs.length>=2){
  const [l,m,r]=ls.slice(-3),shoulders=near(l.price,r.price,.28*atr),head=m.price<Math.min(l.price,r.price)-.18*atr;
  if(shoulders&&head){
   const nhs=hs.filter(x=>x.index>l.index&&x.index<r.index),neck=nhs.length?Math.max(...nhs.map(x=>x.price)):null;
   if(neck){const q={direction:1,type:"INVERSE_HEAD_AND_SHOULDERS",neckline:rnd(neck),state:last.c>neck+.04*atr?"CONFIRMED":"WATCH",strength:last.c>neck+.04*atr?23:10};if(!best||q.strength>best.strength)best=q}
  }
 }
 // Ascending / descending triangle approximation.
 if(hs.length>=2&&ls.length>=2){
  const h1=hs.at(-2).price,h2=hs.at(-1).price,l1=ls.at(-2).price,l2=ls.at(-1).price;
  if(near(h1,h2,tol)&&l2>l1+.12*atr){
   const level=(h1+h2)/2,q={direction:1,type:"ASCENDING_TRIANGLE",neckline:rnd(level),state:last.c>level+.04*atr?"CONFIRMED":"WATCH",strength:last.c>level+.04*atr?17:8};
   if(!best||q.strength>best.strength)best=q;
  }
  if(near(l1,l2,tol)&&h2<h1-.12*atr){
   const level=(l1+l2)/2,q={direction:-1,type:"DESCENDING_TRIANGLE",neckline:rnd(level),state:last.c<level-.04*atr?"CONFIRMED":"WATCH",strength:last.c<level-.04*atr?17:8};
   if(!best||q.strength>best.strength)best=q;
  }
 }
 return best;
}
function regime(a,atr){
 const a7=volatility(a,7),a28=volatility(a,28),ratio=a7&&a28?a7/a28:null;
 const p=recentPivots(a),bias=structuralBiasFromPivots(p,atr);
 return {type:ratio!==null&&ratio>1.35?"EXPANSION":ratio!==null&&ratio<.72?"COMPRESSION":bias?"TREND":"RANGE",
  atrRatio:ratio===null?null:rnd(ratio,2),structureBias:bias};
}
function motionProfile(a,atr){
 const x=a.slice(-14);if(x.length<8)return {state:"UNKNOWN",efficiency:null,overlap:null,netAtr:null,spike:false};
 const net=x.at(-1).c-x[0].o,path=x.slice(1).reduce((z,b,i)=>z+Math.abs(b.c-x[i].c),0);
 const efficiency=path>0?Math.abs(net)/path:0;
 let overlap=0;
 for(let i=1;i<x.length;i++){
  const p=x[i-1],b=x[i],shared=Math.max(0,Math.min(p.h,b.h)-Math.max(p.l,b.l)),den=Math.max(Math.min(p.h-p.l,b.h-b.l),1e-9);
  if(shared/den>.5)overlap++;
 }
 const overlapRatio=overlap/(x.length-1),ranges=x.map(b=>b.h-b.l),maxRange=Math.max(...ranges),netAtr=net/atr;
 const spike=maxRange>1.8*atr,chop=efficiency<.28&&overlapRatio>.55;
 const state=chop?"CHOP":Math.abs(netAtr)>1.15&&efficiency>.42?(netAtr>0?"IMPULSE_UP":"IMPULSE_DOWN"):
  spike?"VOLATILITY_SPIKE":efficiency>.36?(net>0?"DRIFT_UP":"DRIFT_DOWN"):"BALANCED";
 return {state,efficiency:rnd(efficiency,2),overlap:rnd(overlapRatio,2),netAtr:rnd(netAtr,2),spike};
}
function entryEnvironment(a,brain,d,atr){
 const br=brain.breakEvent,sw=brain.liquidity?.sweep,rg=brain.regime?.type,m=brain.motion||motionProfile(a,atr),st=brain.structure?.bias||0;
 if(sw?.direction===d&&br?.direction===d&&br.type==="CHOCH")return {type:"SWEEP_CHOCH_REVERSAL",requiresRetest:true,requiresRejection:true,priority:110};
 if(sw?.direction===d)return {type:"LIQUIDITY_SWEEP_RECLAIM",requiresRetest:true,requiresRejection:true,priority:104};
 if(rg==="COMPRESSION"&&br?.direction===d)return {type:"COMPRESSION_BREAK_RETEST",requiresRetest:true,requiresRejection:true,priority:102};
 if(br?.direction===d&&br.type==="CHOCH")return {type:"CHOCH_REVERSAL_RETEST",requiresRetest:true,requiresRejection:true,priority:100};
 if(br?.direction===d&&br.type==="BOS"&&st===d)return {type:"TREND_BOS_PULLBACK",requiresRetest:true,requiresRejection:true,priority:98};
 if(br?.direction===d&&br.type==="BOS")return {type:"BREAKOUT_RETEST",requiresRetest:true,requiresRejection:true,priority:94};
 if(st===d&&rg==="TREND")return {type:"TREND_PULLBACK",requiresRetest:true,requiresRejection:true,priority:88};
 if(rg==="RANGE"||m.state==="CHOP")return {type:"RANGE_EDGE_ONLY",requiresRetest:true,requiresRejection:true,priority:70};
 return {type:"DIRECTIONAL_WATCH",requiresRetest:true,requiresRejection:true,priority:60};
}
function inZone(px,z,pad=0){return z&&N(px)!==null&&px>=Number(z.low)-pad&&px<=Number(z.high)+pad}
function evidenceForDirection(brain,d,price,atr){
 let score=0;const evidence=[],blockers=[];const add=(pts,msg)=>{score+=pts;evidence.push({points:pts,text:msg})};
 const st=brain.structure,br=brain.breakEvent,liq=brain.liquidity,z=brain.zones,cp=brain.chartPattern,cc=brain.candlePattern;
 if(st.bias===d)add(14,"HH/HL or LH/LL structure agrees");
 else if(st.bias===-d){score-=10;evidence.push({points:-10,text:"Current swing structure opposes"})}
 if(br?.direction===d)add(br.type==="CHOCH"?22:18,(br.type+" "+sideName(d)+" structure break @ "+br.level));
 else if(br?.direction===-d){score-=14;evidence.push({points:-14,text:"Latest "+br.type+" points opposite"})}
 if(liq.sweep?.direction===d)add(17,liq.sweep.type+" rejection");
 if(cp?.direction===d)add(cp.strength,(cp.type+" "+cp.state));
 else if(cp?.direction===-d&&cp.state==="CONFIRMED"){score-=12;evidence.push({points:-12,text:cp.type+" confirmed opposite"})}
 if(cc?.direction===d)add(cc.strength,cc.type);
 if(z.flip?.direction===d)add(13,z.flip.type+" retest structure available");
 if(z.fvg?.direction===d)add(7,z.fvg.type+" imbalance");
 if(z.orderBlock?.direction===d)add(7,z.orderBlock.type);
 const react=d===1?z.demand:z.supply;
 if(inZone(price,react,.08*atr))add(10,(d===1?"DEMAND":"SUPPLY")+" reaction proximity");
 if(brain.regime.type==="EXPANSION"&&br?.direction===d)add(5,"Volatility expansion supports structural break");
 if(brain.regime.type==="COMPRESSION"&&!br)blockers.push("COMPRESSION_AWAIT_BREAK");
 return {score:clamp(score,0,100),evidence,blockers};
}
function nearestTargets(brain,d,entry,atr){
 const vals=[];
 const p=brain.structure.pivots;
 if(d===1){
  for(const x of p.high)if(x.price>entry+.25*atr)vals.push(x.price);
  if(brain.liquidity.equalHigh?.level>entry+.25*atr)vals.push(brain.liquidity.equalHigh.level);
  if(brain.zones.supply?.low>entry+.25*atr)vals.push(brain.zones.supply.low);
 }else{
  for(const x of p.low)if(x.price<entry-.25*atr)vals.push(x.price);
  if(brain.liquidity.equalLow?.level<entry-.25*atr)vals.push(brain.liquidity.equalLow.level);
  if(brain.zones.demand?.high<entry-.25*atr)vals.push(brain.zones.demand.high);
 }
 const uniq=[...new Set(vals.map(x=>rnd(x,6)))].sort((a,b)=>d===1?a-b:b-a);
 return uniq;
}
function overlapZone(a,b){
 if(!a||!b)return null;
 const low=Math.max(Number(a.low),Number(b.low)),high=Math.min(Number(a.high),Number(b.high));
 return Number.isFinite(low)&&Number.isFinite(high)&&high>low?{low,high}:null;
}
function directionalZoneSet(brain,d,atr){
 const z=brain.zones||{},out=[];
 const add=(type,zone,base,source)=>{if(zone&&Number(zone.direction||d)===d&&N(zone.low)!==null&&N(zone.high)!==null)out.push({type,zone,base,source})};
 if(z.flip?.direction===d)add(z.flip.type+"_STRUCTURE_RETEST",z.flip,108,z.flip.source||z.flip.type);
 if(brain.chartPattern?.direction===d&&brain.chartPattern.state==="CONFIRMED"&&N(brain.chartPattern.neckline)!==null){
  const n=Number(brain.chartPattern.neckline);add(brain.chartPattern.type+"_NECKLINE_RETEST",{direction:d,low:n-.13*atr,high:n+.13*atr},96,brain.chartPattern.type);
 }
 if(z.orderBlock?.direction===d)add(z.orderBlock.type+"_RETEST",z.orderBlock,94,z.orderBlock.type);
 if(z.fvg?.direction===d)add(z.fvg.type+"_REBALANCE",z.fvg,88,z.fvg.type);
 const sd=d===1?z.demand:z.supply;if(sd)add((d===1?"DEMAND":"SUPPLY")+"_REACTION",sd,82,sd.type);
 return out;
}
function chooseEntryZone(a,brain,d,atr,price){
 const env=entryEnvironment(a,brain,d,atr),set=directionalZoneSet(brain,d,atr),liq=brain.liquidity?.sweep;
 if(!set.length)return null;
 const scored=set.map(c=>{
  let score=c.base;
  if(liq?.direction===d&&/DEMAND|SUPPLY|ORDER_BLOCK/.test(c.type))score+=12;
  if(env.type==="TREND_BOS_PULLBACK"&&/RBS|SBR|ORDER_BLOCK|FVG/.test(c.type))score+=10;
  if(/REVERSAL|SWEEP/.test(env.type)&&/ORDER_BLOCK|DEMAND|SUPPLY/.test(c.type))score+=10;
  if(env.type==="COMPRESSION_BREAK_RETEST"&&/RBS|SBR|NECKLINE/.test(c.type))score+=11;
  let overlapCount=0,precision={low:Number(c.zone.low),high:Number(c.zone.high)};
  for(const o of set){
   if(o===c)continue;
   const ov=overlapZone(precision,o.zone);
   if(ov&&ov.high-ov.low>=.035*atr){precision=ov;overlapCount++}
  }
  score+=Math.min(18,overlapCount*6);
  return {...c,score,overlapCount,precision};
 }).sort((a,b)=>b.score-a.score);
 const pick=scored[0];if(!pick)return null;
 let low=Math.min(pick.precision.low,pick.precision.high),high=Math.max(pick.precision.low,pick.precision.high);
 if(!Number.isFinite(low)||!Number.isFinite(high)||high<=low)return null;
 // Wide zones create blind-touch entries. Keep only the proximal precision segment;
 // actual READY still requires a CLOSED rejection/reclaim in the live engine.
 const maxWidth=.72*atr;
 if(high-low>maxWidth){if(d===1)low=high-maxWidth;else high=low+maxWidth}
 const mid=(low+high)/2;
 return {...pick,environment:env,low:rnd(low),high:rnd(high),mid:rnd(mid),inside:price>=low&&price<=high,
  noBlindTouch:true,requiresClosedRetest:true,zoneConfluence:pick.overlapCount+1};
}
function structuralStop(brain,d,entryZone,atr){
 const z=brain.zones||{},p=brain.structure?.pivots||{high:[],low:[]},sw=brain.liquidity?.sweep,mid=(entryZone.low+entryZone.high)/2;
 let anchor=null,source="ZONE";
 if(sw?.direction===d&&Number.isFinite(Number(sw.extreme))){anchor=Number(sw.extreme);source="SWEEP_EXTREME"}
 if(anchor===null&&d===1){
  const below=[z.orderBlock?.direction===1?z.orderBlock.low:null,z.demand?.low,p.low?.at(-1)?.price,entryZone.low].map(N).filter(x=>x!==null&&x<mid);
  if(below.length)anchor=Math.max(...below);
 }else if(anchor===null&&d===-1){
  const above=[z.orderBlock?.direction===-1?z.orderBlock.high:null,z.supply?.high,p.high?.at(-1)?.price,entryZone.high].map(N).filter(x=>x!==null&&x>mid);
  if(above.length)anchor=Math.min(...above);
 }
 if(anchor===null)anchor=d===1?entryZone.low:entryZone.high;
 let stop=anchor-d*.10*atr,dist=d*(mid-stop);
 if(dist<.24*atr){stop=mid-d*.24*atr;dist=.24*atr;source+="_ATR_PAD"}
 if(dist>2.35*atr)return null;
 return {price:rnd(stop),source,distanceAtr:rnd(dist/atr,2)};
}
function optionalFibConfluence(a,d,zone,atr){
 const recent=a.slice(-18);if(recent.length<8)return null;
 const lo=Math.min(...recent.map(x=>x.l)),hi=Math.max(...recent.map(x=>x.h)),span=hi-lo;if(span<.6*atr)return null;
 const f1=d===1?hi-.618*span:lo+.382*span,f2=d===1?hi-.382*span:lo+.618*span;
 const low=Math.min(f1,f2),high=Math.max(f1,f2),overlap=Math.max(0,Math.min(zone.high,high)-Math.max(zone.low,low));
 return {low:rnd(low),high:rnd(high),overlap:overlap>0,bonus:overlap>0?4:0};
}
export function readMarketBrain(c=[],price=null){
 const atr=atrAt(c);if(!atr||c.length<55)return {ok:false,reason:"INSUFFICIENT_MARKET_STRUCTURE_DATA"};
 const structure=structureState(c,atr),breakEvent=latestBreak(c,atr),liq=liquidity(c,atr),z=zones(c,atr,breakEvent),
  cp=chartPattern(c,atr),cc=candlePattern(c,atr),rg=regime(c,atr),motion=motionProfile(c,atr);
 const brain={ok:true,atr:rnd(atr),structure,breakEvent,liquidity:liq,zones:z,chartPattern:cp,candlePattern:cc,regime:rg,motion};
 brain.buy=evidenceForDirection(brain,1,price,atr);brain.sell=evidenceForDirection(brain,-1,price,atr);
 return brain;
}
export function buildMarketPlan(c,brain,d,price){
 if(!brain?.ok||![1,-1].includes(d)||!Number.isFinite(Number(price)))return null;
 const atr=Number(brain.atr),entry=chooseEntryZone(c,brain,d,atr,Number(price));if(!entry)return null;
 // Choppy/range Gold is the highest false-entry environment. Only permit a range
 // plan when a liquidity sweep is actually present in the intended direction.
 if((brain.motion?.state==="CHOP"||brain.regime?.type==="RANGE")&&brain.liquidity?.sweep?.direction!==d)return null;
 const stopInfo=structuralStop(brain,d,entry,atr);if(!stopInfo)return null;
 const mid=(entry.low+entry.high)/2,risk=d*(mid-stopInfo.price);if(!(risk>.18*atr&&risk<2.4*atr))return null;
 const liq=nearestTargets(brain,d,mid,atr),targets=[];
 for(const x of liq){if(d*(x-mid)>.90*risk&&(!targets.length||d*(x-targets.at(-1))>.30*risk))targets.push(x);if(targets.length===3)break}
 for(const r of [1.15,1.7,2.4,3.2,4.0]){if(targets.length===3)break;const x=mid+d*risk*r;if(!targets.length||d*(x-targets.at(-1))>.30*risk)targets.push(x)}
 const plan=riskLevels({side:d===1?"BUY":"SELL",entryLow:entry.low,entryHigh:entry.high,stop:stopInfo.price,targets:targets.slice(0,3)});
 if(!plan)return null;
 const fib=optionalFibConfluence(c,d,entry,atr),zoneType=String(entry.type||""),
  activationLevel=/RBS|SBR|NECKLINE/.test(zoneType)&&brain.breakEvent?.direction===d?brain.breakEvent.level:
   /SWEEP/.test(entry.environment?.type||"")&&brain.liquidity?.sweep?.direction===d?brain.liquidity.sweep.level:entry.mid;
 return {...plan,entryMethod:entry.environment.type,entryZoneMethod:entry.type,entrySource:entry.source,fibConfluence:fib,
  entryEnvironment:entry.environment.type,motionProfile:brain.motion,zoneConfluence:entry.zoneConfluence,
  stopSource:stopInfo.source,stopDistanceAtr:stopInfo.distanceAtr,activationLevel:rnd(activationLevel),
  requiresClosedRetest:true,noBlindTouch:true,chaseBufferAtr:.18,
  targetMethod:"NEXT_LIQUIDITY_MIN_0.90R_THEN_STRUCTURAL_R",inside:entry.inside};
}
