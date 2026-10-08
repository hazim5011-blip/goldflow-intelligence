const CFG={
  smaFast:20,smaMid:50,smaSlow:100,tenkan:9,kijun:26,spanB:52,rsi:14,macdFast:12,macdSlow:26,macdSignal:9,momentum:12,atr:14,
  minConfluence:72,breakoutBars:8,swingBars:12,cooldownBars:5,signalValidityBars:16,minBodyATR:.18,maxDistanceATR:1.80,
  minStopATR:1.35,maxStopATR:3.50,tp1R:1,tp2R:1.8,tp3R:3,structureLookback:30,minRoomTP1:.85,breakConfirmATR:.20,
  maxRejectionWickBody:1,entryBufferATR:.10,maxEntryGapATR:.60,beFractionTP1:.50,beOffsetR:.05,trailStartTP1:1,
  trailDistanceTP1:.50,trailStepTP1:.10,maxHoldingBars:96
};
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const snap=v=>n(v)==null?null:Number(Number(v).toFixed(10));
const norm=xs=>(xs||[]).map(x=>({t:n(x.t??x.time),o:n(x.o??x.open),h:n(x.h??x.high),l:n(x.l??x.low),c:n(x.c??x.close),v:n(x.v??x.tick_volume??x.volume)??0}))
  .filter(x=>x.t!=null&&x.o!=null&&x.h!=null&&x.l!=null&&x.c!=null&&x.h>=x.l).sort((a,b)=>a.t-b.t);
function highest(a,s,e,key="h"){let v=-Infinity;for(let i=Math.max(0,s);i<=Math.min(e,a.length-1);i++)v=Math.max(v,a[i][key]);return Number.isFinite(v)?v:null}
function lowest(a,s,e,key="l"){let v=Infinity;for(let i=Math.max(0,s);i<=Math.min(e,a.length-1);i++)v=Math.min(v,a[i][key]);return Number.isFinite(v)?v:null}
function sma(a,p){const out=Array(a.length).fill(null);let sum=0;for(let i=0;i<a.length;i++){sum+=a[i].c;if(i>=p)sum-=a[i-p].c;if(i>=p-1)out[i]=sum/p}return out}
function tr(a,i){let x=a[i].h-a[i].l;if(i>0)x=Math.max(x,Math.abs(a[i].h-a[i-1].c),Math.abs(a[i].l-a[i-1].c));return x}
function wilderATR(a,p){const out=Array(a.length).fill(null);if(a.length<p)return out;let sum=0;for(let i=0;i<p;i++)sum+=tr(a,i);out[p-1]=sum/p;for(let i=p;i<a.length;i++)out[i]=(out[i-1]*(p-1)+tr(a,i))/p;return out}
function wilderRSI(a,p){const out=Array(a.length).fill(null);if(a.length<=p)return out;let gain=0,loss=0;for(let i=1;i<=p;i++){const d=a[i].c-a[i-1].c;if(d>0)gain+=d;else loss-=d}gain/=p;loss/=p;out[p]=loss===0?100:100-100/(1+gain/loss);for(let i=p+1;i<a.length;i++){const d=a[i].c-a[i-1].c,g=Math.max(d,0),l=Math.max(-d,0);gain=(gain*(p-1)+g)/p;loss=(loss*(p-1)+l)/p;out[i]=loss===0?100:100-100/(1+gain/loss)}return out}
function emaSeries(values,p){const out=Array(values.length).fill(null);if(!values.length)return out;const k=2/(p+1);let e=values[0];out[0]=e;for(let i=1;i<values.length;i++){e=values[i]*k+e*(1-k);out[i]=e}return out}
function macd(a){const c=a.map(x=>x.c),fast=emaSeries(c,CFG.macdFast),slow=emaSeries(c,CFG.macdSlow),line=c.map((_,i)=>fast[i]-slow[i]),sig=emaSeries(line,CFG.macdSignal);return {line,sig}}
function ichimoku(a){const ten=Array(a.length).fill(null),kij=Array(a.length).fill(null),sa=Array(a.length).fill(null),sb=Array(a.length).fill(null);for(let i=0;i<a.length;i++){
  if(i>=CFG.tenkan-1)ten[i]=(highest(a,i-CFG.tenkan+1,i)+lowest(a,i-CFG.tenkan+1,i))/2;
  if(i>=CFG.kijun-1)kij[i]=(highest(a,i-CFG.kijun+1,i)+lowest(a,i-CFG.kijun+1,i))/2;
  if(i>=CFG.spanB-1&&ten[i]!=null&&kij[i]!=null){sa[i]=(ten[i]+kij[i])/2;sb[i]=(highest(a,i-CFG.spanB+1,i)+lowest(a,i-CFG.spanB+1,i))/2}
 }return {ten,kij,sa,sb}}
function trendState(i,m20,m50,m100){if(i<0)return 0;return m20[i]>m50[i]&&m50[i]>m100[i]?1:m20[i]<m50[i]&&m50[i]<m100[i]?-1:0}
function evalTrade(sig,a,atr,point){const d=sig.direction,i=sig.index,first=i+1,trigger=sig.plannedEntry,stop=sig.invalidation;
  if(first>=a.length)return {...sig,entry:trigger,entryTime:null,status:"WAIT ENTRY",nativeOutcome:"WAIT_ENTRY",outcome:0,exitPrice:null,exitTime:null,netR:null,reached1:false,reached2:false};
  const fb=a[first],touched=d>0?fb.h>=trigger:fb.l<=trigger;if(!touched)return {...sig,entry:trigger,entryTime:null,status:"NO FILL",nativeOutcome:"NO_FILL",outcome:0,exitPrice:null,exitTime:null,netR:null,reached1:false,reached2:false};
  let entry=trigger;if(d*(fb.o-trigger)>0)entry=fb.o;
  if(Math.abs(entry-trigger)>CFG.maxEntryGapATR*atr[i]||d*(entry-stop)<=Math.max(point||0,1e-12))return {...sig,entry:snap(entry),entryTime:null,status:"CANCEL",nativeOutcome:"CANCELLED",outcome:0,exitPrice:null,exitTime:null,netR:null,reached1:false,reached2:false};
  const risk=d*(entry-stop);if(!(risk>Math.max(point||0,1e-12))||risk>CFG.maxStopATR*atr[i])return {...sig,entry:snap(entry),entryTime:null,status:"CANCEL",nativeOutcome:"CANCELLED",outcome:0,exitPrice:null,exitTime:null,netR:null,reached1:false,reached2:false};
  const tp1=entry+d*CFG.tp1R*risk,tp2=entry+d*CFG.tp2R*risk,tp3=entry+d*CFG.tp3R*risk;let liveStop=stop,stage=0,reached1=false,reached2=false;
  const finish=(name,j,exit)=>({...sig,entry:snap(entry),entryTime:a[first].t,invalidation:snap(stop),liveStop:snap(liveStop),tp1:snap(tp1),tp2:snap(tp2),tp3:snap(tp3),status:name,nativeOutcome:name,outcome:name,exitPrice:snap(exit),exitTime:a[j].t,netR:snap(d*(exit-entry)/risk),reached1,reached2});
  let elapsed=0;for(let j=first;j<a.length&&elapsed<CFG.maxHoldingBars;j++,elapsed++){
    const b=a[j],stopHit=d>0?b.l<=liveStop:b.h>=liveStop;if(stopHit){let fill=liveStop;if(elapsed>0&&d*(b.o-liveStop)<0)fill=b.o;const realised=d*(fill-entry);const name=stage===0?"SL":realised<0?"GAP_LOSS":stage===2?"TRAILING":"BE_POSITIVE";return finish(name,j,fill)}
    const extreme=d>0?b.h:b.l,move=d*(extreme-entry);if(move>=CFG.tp1R*risk)reached1=true;if(move>=CFG.tp2R*risk)reached2=true;if(move>=CFG.tp3R*risk)return finish("TP3",j,tp3);
    const closeMove=d*(b.c-entry);if(closeMove>=CFG.beFractionTP1*CFG.tp1R*risk&&stage===0){const cand=entry+d*CFG.beOffsetR*risk;if(d*(cand-liveStop)>Math.max(point||0,1e-12)){liveStop=cand;stage=1}}
    if(closeMove>=CFG.trailStartTP1*CFG.tp1R*risk&&stage>=1){const cand=b.c-d*CFG.trailDistanceTP1*CFG.tp1R*risk;if(d*(cand-liveStop)>Math.max(point||0,CFG.trailStepTP1*CFG.tp1R*risk)){liveStop=cand;stage=2}}
  }
  if(elapsed>=CFG.maxHoldingBars){const j=Math.min(a.length-1,i+CFG.maxHoldingBars),mv=d*(a[j].c-entry),name=mv>Math.max(point||0,1e-12)?"TIME_WIN":mv<-Math.max(point||0,1e-12)?"TIME_LOSS":"TIME_FLAT";return finish(name,j,a[j].c)}
  return {...sig,entry:snap(entry),entryTime:a[first].t,invalidation:snap(stop),liveStop:snap(liveStop),tp1:snap(tp1),tp2:snap(tp2),tp3:snap(tp3),status:"OPEN",nativeOutcome:"OPEN",outcome:0,exitPrice:null,exitTime:null,netR:null,reached1,reached2};
}
function scan(a,point){const m20=sma(a,CFG.smaFast),m50=sma(a,CFG.smaMid),m100=sma(a,CFG.smaSlow),rsi=wilderRSI(a,CFG.rsi),atr=wilderATR(a,CFG.atr),mc=macd(a),ich=ichimoku(a),hist=[];let last=-999;
  const warm=Math.max(CFG.smaSlow+10,CFG.spanB+CFG.kijun+10,CFG.structureLookback+CFG.momentum+10);
  for(let i=warm;i<a.length;i++){
    if(i-last<CFG.cooldownBars)continue;const cloud=i-CFG.kijun;if(cloud<0||[m20[i],m50[i],m100[i],rsi[i],atr[i],mc.line[i],mc.sig[i],ich.ten[i],ich.kij[i],ich.sa[cloud],ich.sb[cloud]].some(x=>x==null))continue;
    const ar=atr[i],b=a[i],c=b.c;if(Math.abs(c-b.o)<CFG.minBodyATR*ar)continue;const topCloud=Math.max(ich.sa[cloud],ich.sb[cloud]),bottomCloud=Math.min(ich.sa[cloud],ich.sb[cloud]),momentum=c-a[i-CFG.momentum].c,mh=mc.line[i]-mc.sig[i],oldMh=mc.line[i-1]-mc.sig[i-1];
    const ph=highest(a,i-CFG.breakoutBars,i-1),pl=lowest(a,i-CFG.breakoutBars,i-1),breakoutBuy=c>ph,breakoutSell=c<pl,pullbackBuy=b.l<=m20[i]+.25*ar&&c>m20[i]&&c>b.o&&c>a[i-1].c,pullbackSell=b.h>=m20[i]-.25*ar&&c<m20[i]&&c<b.o&&c<a[i-1].c;
    let buy=c>topCloud&&c>m20[i]&&m20[i]>m50[i]&&c>b.o&&c-m20[i]<=CFG.maxDistanceATR*ar&&rsi[i]>=47&&rsi[i]<=72&&(breakoutBuy||pullbackBuy);
    let sell=c<bottomCloud&&c<m20[i]&&m20[i]<m50[i]&&c<b.o&&m20[i]-c<=CFG.maxDistanceATR*ar&&rsi[i]>=28&&rsi[i]<=53&&(breakoutSell||pullbackSell);
    if(!buy&&!sell)continue;if(Math.abs(m20[i]-m20[i-5])<.15*ar&&!(buy?breakoutBuy:breakoutSell))continue;const d=buy?1:-1;let score=0;
    if(d>0){if(m50[i]>m100[i])score+=25;if(ich.sa[cloud]>ich.sb[cloud])score+=20;if(ich.ten[i]>ich.kij[i]&&c>ich.kij[i])score+=10;if(rsi[i]>50&&rsi[i]<70)score+=10;if(mh>0)score+=mh>oldMh?15:10;if(momentum>0)score+=10;score+=10}
    else{if(m50[i]<m100[i])score+=25;if(ich.sa[cloud]<ich.sb[cloud])score+=20;if(ich.ten[i]<ich.kij[i]&&c<ich.kij[i])score+=10;if(rsi[i]<50&&rsi[i]>30)score+=10;if(mh<0)score+=mh<oldMh?15:10;if(momentum<0)score+=10;score+=10}
    if(score<CFG.minConfluence)continue;const body=Math.abs(c-b.o),uw=b.h-Math.max(b.o,c),lw=Math.min(b.o,c)-b.l;if(d>0&&uw>CFG.maxRejectionWickBody*body)continue;if(d<0&&lw>CFG.maxRejectionWickBody*body)continue;
    const planned=d>0?b.h+CFG.entryBufferATR*ar:b.l-CFG.entryBufferATR*ar,swLow=lowest(a,i-CFG.swingBars,i-1),swHigh=highest(a,i-CFG.swingBars,i-1),stop=d>0?Math.min(swLow-.10*ar,planned-CFG.minStopATR*ar):Math.max(swHigh+.10*ar,planned+CFG.minStopATR*ar),risk=Math.abs(planned-stop);
    if(!(risk>Math.max(point||0,1e-12))||risk>CFG.maxStopATR*ar)continue;const priorHigh=highest(a,i-CFG.structureLookback,i-1),priorLow=lowest(a,i-CFG.structureLookback,i-1);if(d>0&&!(c>=priorHigh+CFG.breakConfirmATR*ar||priorHigh-c>=CFG.minRoomTP1*CFG.tp1R*risk))continue;if(d<0&&!(c<=priorLow-CFG.breakConfirmATR*ar||c-priorLow>=CFG.minRoomTP1*CFG.tp1R*risk))continue;
    const raw={index:i,time:b.t,direction:d,code:d>0?"B":"S",score,plannedEntry:snap(planned),entry:snap(planned),invalidation:snap(stop),tp1:snap(planned+d*CFG.tp1R*risk),tp2:snap(planned+d*CFG.tp2R*risk),tp3:snap(planned+d*CFG.tp3R*risk),reasons:["SMA20/50/100 TREND","ICHIMOKU CLOUD","RSI14","MACD 12/26/9",`MOMENTUM ${CFG.momentum}`,(breakoutBuy||breakoutSell)?"BREAKOUT":"SMA20 PULLBACK","STRUCTURE ROOM","NEXT-CANDLE CONTINUATION"],sourceParity:"PVT_Chart_Confluence_XAU_v1.01"};
    hist.push(evalTrade(raw,a,atr,point));last=i;
  }
  return {hist,m20,m50,m100,rsi,atr,ich,macd:mc};
}
function statsFor(hist){const s={total:hist.length,tp:0,tr:0,be:0,sl:0,pending:0,wins:0,losses:0,noFill:0,cancel:0,timeWin:0,timeLoss:0,timeFlat:0,winRate:0};for(const x of hist){switch(x.nativeOutcome){case"TP3":s.tp++;s.wins++;break;case"TRAILING":s.tr++;s.wins++;break;case"BE_POSITIVE":s.be++;s.wins++;break;case"TIME_WIN":s.timeWin++;s.wins++;break;case"SL":case"GAP_LOSS":s.sl++;s.losses++;break;case"TIME_LOSS":s.timeLoss++;s.losses++;break;case"NO_FILL":s.noFill++;break;case"CANCELLED":s.cancel++;break;case"TIME_FLAT":s.timeFlat++;break;default:s.pending++}}
  s.winRate=s.wins+s.losses?100*s.wins/(s.wins+s.losses):0;return s}
export function runPVTChart101({triggerBars,triggerTF,symbol,point=0}){
  const all=norm(triggerBars);if(all.length<170)return {ready:false,error:"Insufficient broker candles for PVT Chart v1.01"};const a=all.slice(0,-1);if(a.length<160)return {ready:false,error:"Insufficient CLOSED broker candles for PVT Chart v1.01"};
  const x=scan(a,point),hist=x.hist.slice(-160),stats=statsFor(hist),i=a.length-1,t=trendState(i,x.m20,x.m50,x.m100),last=hist.at(-1)||null;
  const latestSignal=last||{code:"WAIT",direction:0,score:0,status:"WAIT CONFLUENCE",reason:"SMA + ICHIMOKU + RSI + MACD + MOMENTUM + STRUCTURE"};
  return {ready:true,engine:"PVT_Chart_Confluence_XAU_v1.01 • MQ5 source-parity web port",symbol,profile:{triggerTF,setupTF:triggerTF,biasTF:triggerTF},
    setupState:{trend:t,strength:last?.score??50,lastEvent:last?`${last.code} ${last.status}`:"WAIT PVT CONFLUENCE"},biasState:{trend:t,strength:50,lastEvent:"SAME-TF SMA20/50/100 + ICHIMOKU"},premiumDiscount:null,activeZones:{buy:[],sell:[],swap:[]},latestSignal,watch:null,history:hist,stats,
    sourceAudit:{mq5:"PVT_Chart_Confluence_XAU_v1.01",currentChartTimeframeOnly:true,closedCandleSignals:true,nextBarContinuation:true,scoreIsProbability:false,
      management:{tp1R:CFG.tp1R,tp2R:CFG.tp2R,tp3R:CFG.tp3R,beAtTP1Fraction:CFG.beFractionTP1,beOffsetR:CFG.beOffsetR,trailStartTP1:CFG.trailStartTP1,trailDistanceTP1:CFG.trailDistanceTP1,maxHoldingBars:CFG.maxHoldingBars}}};
}
