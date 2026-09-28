const TFSEC={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
const CFG={
  ATR:14, pivot:2, biasPivot:4, breakATR:.05, obSearch:12, maxZones:80,
  maxRetests:3, maxObATR:1.8, zoneInvalidATR:.08, overlap:.55,
  normalScore:65,strongScore:80,minConfirm:2,maxAfterTouch:5,invalidCloses:2,
  maxSignalsPerZone:3,sweepLookback:5,structureLookback:3,minWick:.25,
  minMomentumATR:.35,maxEntryATR:1.25,signalInvalidATR:.08,rr1:1,rr2:2,
  beTrigger:.50,beLock:.05,trailStart:.75,trailGap:.35
};
const num=v=>Number.isFinite(Number(v))?Number(v):0;
export function normalizeBars(xs=[]){
  return xs.map(x=>({t:num(x.t??x.time),o:num(x.o??x.open),h:num(x.h??x.high),l:num(x.l??x.low),c:num(x.c??x.close),v:num(x.v??x.tick_volume??x.volume)}))
    .filter(x=>x.t&&x.h>=x.l&&x.o&&x.c).sort((a,b)=>a.t-b.t);
}
const range=b=>b.h-b.l, body=b=>Math.abs(b.c-b.o), top=b=>Math.max(b.o,b.c), bottom=b=>Math.min(b.o,b.c);
function trAt(a,i){if(i<0||i>=a.length)return 0;let v=a[i].h-a[i].l;if(i>0){v=Math.max(v,Math.abs(a[i].h-a[i-1].c),Math.abs(a[i].l-a[i-1].c));}return v}
function atr(a,i,p=CFG.ATR){let s=0,n=0;for(let j=Math.max(0,i-p+1);j<=i;j++){s+=trAt(a,j);n++}return n?s/n:0}
function ema(a,i,p){if(i<0)return 0;const start=Math.max(0,i-Math.max(p*4,p+5));let e=a[start].c,k=2/(Math.max(2,p)+1);for(let j=start+1;j<=i;j++)e=k*a[j].c+(1-k)*e;return e}
function volRatio(a,i,p=20){let s=0,n=0;for(let j=Math.max(0,i-p);j<i;j++){s+=a[j].v;n++}return n&&s>0?a[i].v/(s/n):1}
function pivotHigh(a,i,w){if(i-w<0||i+w>=a.length)return false;for(let k=1;k<=w;k++)if(a[i].h<=a[i-k].h||a[i].h<a[i+k].h)return false;return true}
function pivotLow(a,i,w){if(i-w<0||i+w>=a.length)return false;for(let k=1;k<=w;k++)if(a[i].l>=a[i-k].l||a[i].l>a[i+k].l)return false;return true}
function directional(b,d){return d>0?b.c>b.o:b.c<b.o}
function engulf(a,i,d){if(i<1)return false;const cur=a[i],prev=a[i-1];if(!directional(cur,d)||directional(prev,d))return false;return d>0?(bottom(cur)<=bottom(prev)&&top(cur)>=top(prev)):(top(cur)>=top(prev)&&bottom(cur)<=bottom(prev))}
function highest(a,s,e){let v=-Infinity;for(let i=Math.max(0,s);i<=Math.min(e,a.length-1);i++)v=Math.max(v,a[i].h);return Number.isFinite(v)?v:0}
function lowest(a,s,e){let v=Infinity;for(let i=Math.max(0,s);i<=Math.min(e,a.length-1);i++)v=Math.min(v,a[i].l);return Number.isFinite(v)?v:0}
function overlapRatio(a,b){const ov=Math.max(0,Math.min(a.high,b.high)-Math.max(a.low,b.low));const mw=Math.min(a.high-a.low,b.high-b.low);return mw>0?ov/mw:0}
function findOB(a,breakIndex,d,breakAtr){
  const first=breakIndex-1,last=Math.max(0,breakIndex-CFG.obSearch);let j=-1;
  for(let i=first;i>=last;i--){const opp=d>0?a[i].c<a[i].o:a[i].c>a[i].o;if(opp){j=i;break}}
  if(j<0)return null;
  let high=d>0?top(a[j]):a[j].h,low=d>0?a[j].l:bottom(a[j]);
  const maxWidth=Math.max(breakAtr*.000001,breakAtr*CFG.maxObATR);
  if(high-low>maxWidth){if(d>0)low=high-maxWidth;else high=low+maxWidth}
  return high>low?{i:j,high,low}:null;
}
function addZone(zones,tf,d,a,breakIndex,event,ar){
  const ob=findOB(a,breakIndex,d,ar);if(!ob)return;
  const ready=a[breakIndex].t+(TFSEC[tf]||60);
  for(const z of zones){
    if(z.tf===tf&&z.direction===d&&!z.supersededTime&&overlapRatio({high:ob.high,low:ob.low},z)>=CFG.overlap)z.supersededTime=ready;
  }
  const displacement=body(a[breakIndex])/Math.max(ar,1e-12),vr=volRatio(a,breakIndex,20);
  const score=Math.max(0,Math.min(100,48+(event==="CHoCH"?12:8)+Math.min(18,displacement*10)+(vr>=1.2?7:0)));
  zones.push({tf,direction:d,originTime:a[ob.i].t,readyTime:ready,breakIndex,high:ob.high,low:ob.low,baseScore:score,sourceEvent:event,swapped:false,swapTime:0,finalInvalidTime:0,supersededTime:0,currentRetests:0,currentDirection:d});
  if(zones.length>CFG.maxZones)zones.shift();
}
export function analyzeMarket(a,tf,wing=2,collectZones=false){
  const st={structureTrend:0,trend:0,strength:50,lastHigh:0,lastLow:0,lastHighTime:0,lastLowTime:0,lastEvent:"NONE",lastEventTime:0,bosUp:0,bosDown:0,chochUp:0,chochDown:0,zones:[]};
  if(a.length<80)return st;
  let prevH=0,prevL=0,lastH=0,lastL=0,lastHT=0,lastLT=0,highBroken=true,lowBroken=true,trend=0;
  const w=Math.max(1,Math.min(10,wing));
  for(let confirm=Math.max(w*2,5);confirm<a.length-1;confirm++){
    const p=confirm-w,ar=Math.max(atr(a,confirm),1e-12);
    if(p>=w&&pivotHigh(a,p,w)){prevH=a[p].h;lastH=prevH;lastHT=a[p].t;highBroken=false}
    if(p>=w&&pivotLow(a,p,w)){prevL=a[p].l;lastL=prevL;lastLT=a[p].t;lowBroken=false}
    const buf=ar*CFG.breakATR;let up=!highBroken&&lastH>0&&a[confirm].c>lastH+buf,down=!lowBroken&&lastL>0&&a[confirm].c<lastL-buf;
    if(up&&down){if(a[confirm].c-lastH>=lastL-a[confirm].c)down=false;else up=false}
    if(up){const choch=trend<0;if(collectZones)addZone(st.zones,tf,1,a,confirm,choch?"CHoCH":"BOS",ar);choch?st.chochUp++:st.bosUp++;trend=1;highBroken=true;st.lastEvent=(choch?"CHoCH":"BOS")+" UP";st.lastEventTime=a[confirm].t}
    else if(down){const choch=trend>0;if(collectZones)addZone(st.zones,tf,-1,a,confirm,choch?"CHoCH":"BOS",ar);choch?st.chochDown++:st.bosDown++;trend=-1;lowBroken=true;st.lastEvent=(choch?"CHoCH":"BOS")+" DOWN";st.lastEventTime=a[confirm].t}
  }
  st.structureTrend=trend;st.lastHigh=lastH;st.lastLow=lastL;st.lastHighTime=lastHT;st.lastLowTime=lastLT;
  const i=a.length-2,ef=ema(a,i,20),es=ema(a,i,50),ed=ef>es?1:ef<es?-1:0;
  st.trend=trend||ed;
  const ar=Math.max(atr(a,i),1e-12),sep=Math.abs(ef-es)/ar;
  st.strength=Math.max(50,Math.min(100,50+Math.min(25,sep*15)+(trend&&trend===ed?15:trend&&ed?5:0)+(st.lastEventTime?5:0)));
  return st;
}
function evaluateZones(zones,setup,tf){
  const sec=TFSEC[tf]||60;
  for(const z of zones){
    let swapped=false,d=z.direction,touching=false,retests=0;
    z.swapped=false;z.swapTime=0;z.finalInvalidTime=0;z.currentRetests=0;z.currentDirection=d;
    for(let i=Math.max(z.breakIndex+1,1);i<setup.length-1;i++){
      const closeT=setup[i].t+sec;if(z.supersededTime&&closeT>=z.supersededTime)break;
      const ar=Math.max(atr(setup,i),1e-12),inv=ar*CFG.zoneInvalidATR;
      const failed=d>0?setup[i].c<z.low-inv:setup[i].c>z.high+inv;
      if(failed){
        if(!swapped){swapped=true;z.swapped=true;z.swapTime=closeT;d=-z.direction;z.currentDirection=d;touching=false;retests=0;continue}
        z.finalInvalidTime=closeT;break;
      }
      const ov=setup[i].l<=z.high&&setup[i].h>=z.low;if(ov&&!touching)retests++;touching=ov;
    }
    z.currentRetests=retests;
  }
  return zones;
}
function activeZones(zs){return zs.filter(z=>!z.finalInvalidTime&&!z.supersededTime&&z.currentRetests<=CFG.maxRetests)}
function trendAt(a,time){const idx=a.findLastIndex? a.findLastIndex(x=>x.t<time) : (()=>{let q=-1;for(let i=0;i<a.length;i++)if(a[i].t<time)q=i;return q})();if(idx<55)return 0;const f=ema(a,idx,20),s=ema(a,idx,50);return f>s?1:f<s?-1:0}
function pdAligned(state,price,d){if(!(state.lastHigh>state.lastLow))return false;const eq=(state.lastHigh+state.lastLow)/2;return d>0?price<=eq:price>=eq}
function managedOutcome(a,signalIndex,d,entry,stop,tp1){
  const risk=Math.abs(entry-stop);if(risk<=1e-12)return 0;let active=stop,source=0,best=entry;
  for(let i=signalIndex+1;i<a.length-1;i++){
    const b=a[i],stopHit=d>0?b.l<=active:b.h>=active,tpHit=d>0?b.h>=tp1:b.l<=tp1;
    if(stopHit)return source===2?2:source===1?3:-1;
    if(tpHit)return 1;
    best=d>0?Math.max(best,b.h):Math.min(best,b.l);
    const rr=(d>0?best-entry:entry-best)/risk;
    if(rr>=CFG.beTrigger){const bs=entry+d*CFG.beLock*risk;if(d>0?bs>active:bs<active){active=bs;source=1}}
    if(rr>=CFG.trailStart){const ts=d>0?best-CFG.trailGap*risk:best+CFG.trailGap*risk;if(d>0?ts>active:ts<active){active=ts;source=2}}
  }
  return 0;
}
function outcomeText(o){return o===1?"TP":o===2?"TR":o===3?"BE":o<0?"SL":"P"}
function scanSegment(zone,d,start,stop,swap,trigger,triggerTf,setup,bias,setupState){
  const sec=TFSEC[triggerTf]||60,out=[];let visit=false,signalled=false,sweepVisit=false,after=0,outside=0,count=0;
  const startIdx=Math.max(1,trigger.findIndex(x=>x.t+sec>=start));
  for(let i=Math.max(1,startIdx);i<trigger.length-1;i++){
    const closeT=trigger[i].t+sec;if(stop&&closeT>=stop)break;
    const ar=Math.max(atr(trigger,i),1e-12),invBuf=ar*CFG.signalInvalidATR;
    const outClose=d>0?trigger[i].c<zone.low-invBuf:trigger[i].c>zone.high+invBuf;outside=outClose?outside+1:0;if(outside>=CFG.invalidCloses)break;
    const touch=trigger[i].l<=zone.high&&trigger[i].h>=zone.low;
    if(touch){if(!visit){visit=true;signalled=false;sweepVisit=false}after=0;if(d>0?trigger[i].l<zone.low:trigger[i].h>zone.high)sweepVisit=true}
    else if(visit){after++;if(after>CFG.maxAfterTouch){visit=false;signalled=false;sweepVisit=false;continue}}
    if(!visit||signalled||count>=CFG.maxSignalsPerZone)continue;
    const b=trigger[i];if(!directional(b,d))continue;const mid=(zone.high+zone.low)/2;if(d>0?b.c<mid:b.c>mid)continue;
    const dist=d>0?Math.max(0,b.c-zone.high):Math.max(0,zone.low-b.c);if(dist>ar*CFG.maxEntryATR)continue;
    const slb=Math.max(0,i-CFG.sweepLookback),stb=Math.max(0,i-CFG.structureLookback);
    const sweepLevel=d>0?lowest(trigger,slb,i-1):highest(trigger,slb,i-1);
    const localSweep=d>0?(b.l<sweepLevel&&b.c>sweepLevel):(b.h>sweepLevel&&b.c<sweepLevel);
    const sweep=sweepVisit||localSweep;
    const structLevel=d>0?highest(trigger,stb,i-1):lowest(trigger,stb,i-1);
    const micro=d>0?b.c>structLevel:b.c<structLevel,eng=engulf(trigger,i,d);
    const rg=range(b);if(rg<=0)continue;const wick=d>0?bottom(b)-b.l:b.h-top(b),reject=wick/rg>=CFG.minWick;
    const loc=d>0?(b.c-b.l)/rg:(b.h-b.c)/rg,momentum=body(b)>=ar*CFG.minMomentumATR&&loc>=.65,vol=volRatio(trigger,i)>=1.2;
    const confirms=[sweep,micro,eng,reject,momentum].filter(Boolean).length;if(!(sweep||micro||eng)||confirms<CFG.minConfirm)continue;
    const bt=trendAt(bias,closeT),st=trendAt(setup,closeT),ba=bt===d,sa=st===d,pda=pdAligned(setupState,b.c,d);
    let score=20+Math.min(15,zone.baseScore*.15)+(ba?15:0)+(sa?10:0)+(sweep?15:0)+(micro?15:0)+(eng?12:0)+(reject?8:0)+(momentum?8:0)+(pda?5:0)+(vol?5:0)+(swap?3:0);
    score=Math.max(0,Math.min(100,score));if(score<CFG.normalScore)continue;
    const reasons=[swap?"SWAP ZONE":zone.sourceEvent+" OB",ba&&"BIAS",sa&&"SETUP TREND",sweep&&"SWEEP/RECLAIM",micro&&"MICRO BOS",eng&&"ENGULF",reject&&"REJECTION",momentum&&"MOMENTUM",pda&&(d>0?"DISCOUNT":"PREMIUM"),vol&&"VOLUME"].filter(Boolean);
    const entry=b.c;let invalid=d>0?Math.min(zone.low,b.l)-invBuf:Math.max(zone.high,b.h)+invBuf;let risk=Math.abs(entry-invalid);const minRisk=ar*.25;if(risk<minRisk){risk=minRisk;invalid=entry-d*risk}
    const tp1=entry+d*risk*CFG.rr1,tp2=entry+d*risk*CFG.rr2,outcome=managedOutcome(trigger,i,d,entry,invalid,tp1);
    out.push({time:b.t,closeTime:closeT,direction:d,code:(d>0?(score>=CFG.strongScore?"B+":"B"):(score>=CFG.strongScore?"S+":"S")),score,entry,invalidation:invalid,tp1,tp2,status:outcomeText(outcome),outcome,reasons,zone:{high:zone.high,low:zone.low,tf:zone.tf,source:zone.sourceEvent,swapped:swap}});
    signalled=true;count++;
  }
  return out;
}
export function runIndicator({triggerBars,setupBars,biasBars,triggerTF,setupTF,biasTF,symbol,point=0}){
  const trigger=normalizeBars(triggerBars),setup=normalizeBars(setupBars),bias=normalizeBars(biasBars);
  if(trigger.length<100||setup.length<100||bias.length<80)return {ready:false,error:"Insufficient broker candles"};
  const setupState=analyzeMarket(setup,setupTF,CFG.pivot,true),biasState=analyzeMarket(bias,biasTF,CFG.biasPivot,false);
  evaluateZones(setupState.zones,setup,setupTF);const active=activeZones(setupState.zones);
  let hist=[];
  for(const z of active){
    const originalStop=z.swapTime||z.finalInvalidTime||z.supersededTime||0;
    hist.push(...scanSegment(z,z.direction,z.readyTime,originalStop,false,trigger,triggerTF,setup,bias,setupState));
    if(z.swapped&&z.swapTime)hist.push(...scanSegment(z,-z.direction,z.swapTime,z.finalInvalidTime||z.supersededTime||0,true,trigger,triggerTF,setup,bias,setupState));
  }
  hist.sort((a,b)=>a.time-b.time);if(hist.length>160)hist=hist.slice(-160);
  const stats={total:hist.length,tp:0,tr:0,be:0,sl:0,pending:0,wins:0,losses:0,winRate:0};
  for(const x of hist){if(x.outcome===1){stats.tp++;stats.wins++}else if(x.outcome===2){stats.tr++;stats.wins++}else if(x.outcome===3){stats.be++;stats.wins++}else if(x.outcome<0){stats.sl++;stats.losses++}else stats.pending++}
  stats.winRate=stats.wins+stats.losses?100*stats.wins/(stats.wins+stats.losses):0;
  const latestSignal=hist.at(-1)||{code:"WAIT",score:0,status:"NO CLOSED-CANDLE TRIGGER",reason:"WAIT ZONE + CONFIRMATION"};
  const last=trigger.at(-2)||trigger.at(-1),price=last?.c||0;
  const az=active.map(z=>({...z,currentDirection:z.swapped?-z.direction:z.direction})).sort((a,b)=>Math.min(Math.abs(price-a.low),Math.abs(price-a.high))-Math.min(Math.abs(price-b.low),Math.abs(price-b.high)));
  const watch=az[0]?{direction:az[0].currentDirection,distance:Math.min(Math.abs(price-az[0].low),Math.abs(price-az[0].high)),zone:{high:az[0].high,low:az[0].low,source:az[0].sourceEvent,swapped:az[0].swapped},reason:"WAIT "+(az[0].currentDirection>0?"BUY":"SELL")+" ZONE + CLOSED-CANDLE CONFIRMATION"}:null;
  const pd=setupState.lastHigh>setupState.lastLow?{high:setupState.lastHigh,low:setupState.lastLow,equilibrium:(setupState.lastHigh+setupState.lastLow)/2,position:price>(setupState.lastHigh+setupState.lastLow)/2?"PREMIUM":"DISCOUNT"}:null;
  const buy=az.filter(z=>z.currentDirection>0).slice(0,5),sell=az.filter(z=>z.currentDirection<0).slice(0,5),swap=az.filter(z=>z.swapped).slice(0,10);
  return {ready:true,engine:"XAUUSD_MTF_Research_v1.05 web port • dynamic multi-asset",symbol,profile:{triggerTF,setupTF,biasTF},setupState:{...setupState,zones:undefined},biasState:{...biasState,zones:undefined},premiumDiscount:pd,activeZones:{buy,sell,swap},latestSignal,watch,history:hist,stats};
}
