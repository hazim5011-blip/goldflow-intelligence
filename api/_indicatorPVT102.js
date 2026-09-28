const CFG={
  zoneLookback:30,atrPeriod:14,zoneWidthATR:.45,wickBodyRatio:.80,sweepLookback:6,
  volumeAvg:20,volumeSpike:1.05,useTrend:true,fastEMA:20,slowEMA:50,
  requireMicroBreak:false,microLookback:2,confirmBodyMin:.45,requireCloseOutside:true,
  minScore:60,contextBars:3,minBarsBetween:3,slPoints:600,tp1Points:300,tp2Points:600,tp3Points:900
};
const n=v=>Number.isFinite(Number(v))?Number(v):0;
const norm=xs=>(xs||[]).map(x=>({t:n(x.t??x.time),o:n(x.o??x.open),h:n(x.h??x.high),l:n(x.l??x.low),c:n(x.c??x.close),v:n(x.v??x.tick_volume??x.volume)})).filter(x=>x.t&&x.h>=x.l&&x.o&&x.c).sort((a,b)=>a.t-b.t);
function tr(a,i){let x=a[i].h-a[i].l;if(i>0){x=Math.max(x,Math.abs(a[i].h-a[i-1].c),Math.abs(a[i].l-a[i-1].c))}return x}
function atr(a,i,p=CFG.atrPeriod){let s=0,k=0;for(let j=Math.max(0,i-p+1);j<=i;j++){s+=tr(a,j);k++}return k?s/k:0}
function ema(a,i,p){let start=Math.max(0,i-Math.max(p*4,p+5)),e=a[start].c,k=2/(Math.max(2,p)+1);for(let j=start+1;j<=i;j++)e=k*a[j].c+(1-k)*e;return e}
function avgVol(a,i,p){let s=0,k=0;for(let j=Math.max(0,i-p);j<i;j++){s+=a[j].v;k++}return k?s/k:0}
function recentLow(a,i,b){let v=Infinity;for(let j=Math.max(0,i-b);j<i;j++)v=Math.min(v,a[j].l);return Number.isFinite(v)?v:a[i].l}
function recentHigh(a,i,b){let v=-Infinity;for(let j=Math.max(0,i-b);j<i;j++)v=Math.max(v,a[j].h);return Number.isFinite(v)?v:a[i].h}
function sweptLow(a,i,b){if(i-b<0)return false;let p=Infinity;for(let j=i-b;j<i;j++)p=Math.min(p,a[j].l);return a[i].l<p&&a[i].c>p}
function sweptHigh(a,i,b){if(i-b<0)return false;let p=-Infinity;for(let j=i-b;j<i;j++)p=Math.max(p,a[j].h);return a[i].h>p&&a[i].c<p}
function bullReject(b,point){const body=Math.max(Math.abs(b.c-b.o),point||1e-9),lw=Math.min(b.o,b.c)-b.l;return b.c>=b.o&&lw>=body*CFG.wickBodyRatio}
function bearReject(b,point){const body=Math.max(Math.abs(b.c-b.o),point||1e-9),uw=b.h-Math.max(b.o,b.c);return b.c<=b.o&&uw>=body*CFG.wickBodyRatio}
function strongBull(b,point){const r=Math.max(b.h-b.l,point||1e-9),bo=Math.abs(b.c-b.o);return b.c>b.o&&bo/r>=CFG.confirmBodyMin&&b.c>=b.l+r*.65}
function strongBear(b,point){const r=Math.max(b.h-b.l,point||1e-9),bo=Math.abs(b.c-b.o);return b.c<b.o&&bo/r>=CFG.confirmBodyMin&&b.c<=b.l+r*.35}
function bullBreak(a,i){if(i-CFG.microLookback<0)return false;let hh=-Infinity;for(let j=i-CFG.microLookback;j<i;j++)hh=Math.max(hh,a[j].h);return a[i].c>hh}
function bearBreak(a,i){if(i-CFG.microLookback<0)return false;let ll=Infinity;for(let j=i-CFG.microLookback;j<i;j++)ll=Math.min(ll,a[j].l);return a[i].c<ll}
function sequence(a,i,d,zLow,zHigh,point){
  const cur=a[i]; if(d>0?!strongBull(cur,point):!strongBear(cur,point))return null;
  for(let j=i-1;j>=Math.max(1,i-CFG.contextBars);j--){
    const b=a[j],touch=b.l<=zHigh&&b.h>=zLow,reject=d>0?bullReject(b,point):bearReject(b,point);
    if(!touch||!reject)continue;
    const av=avgVol(a,j,CFG.volumeAvg),vol=av>0&&b.v>=av*CFG.volumeSpike,sweep=d>0?sweptLow(a,j,CFG.sweepLookback):sweptHigh(a,j,CFG.sweepLookback);
    if(!vol)continue;
    let invalid=false;
    for(let k=j+1;k<=i;k++){if(d>0?a[k].c<zLow:a[k].c>zHigh){invalid=true;break}}
    if(invalid)continue;
    if(d>0 && cur.c<=b.h)continue;
    if(d<0 && cur.c>=b.l)continue;
    if(CFG.requireCloseOutside && (d>0?cur.c<=zHigh:cur.c>=zLow))continue;
    return {anchor:j,vol,sweep};
  }
  return null;
}
function outcome(a,i,d,entry,sl,tp1){
  for(let j=i+1;j<a.length-1;j++){
    const b=a[j],s=d>0?b.l<=sl:b.h>=sl,t=d>0?b.h>=tp1:b.l<=tp1;
    if(s&&t)return -1;if(s)return -1;if(t)return 1;
  }return 0;
}
export function runPVT({triggerBars,triggerTF,symbol,point=0}){
  const a=norm(triggerBars); if(a.length<100)return {ready:false,error:"Insufficient broker candles"};
  const hist=[]; let lastBuy=-999,lastSell=-999;
  for(let i=Math.max(60,CFG.zoneLookback+CFG.volumeAvg+CFG.sweepLookback+CFG.contextBars);i<a.length-1;i++){
    const ar=Math.max(atr(a,i),point||1e-9),rLow=recentLow(a,i,CFG.zoneLookback),rHigh=recentHigh(a,i,CFG.zoneLookback),zw=Math.max(ar*CFG.zoneWidthATR,(point||1e-9)*20);
    const dLow=rLow,dHigh=rLow+zw,sHigh=rHigh,sLow=rHigh-zw;
    const buySeq=sequence(a,i,1,dLow,dHigh,point),sellSeq=sequence(a,i,-1,sLow,sHigh,point);
    const bb=bullBreak(a,i),sb=bearBreak(a,i),ef=ema(a,i,CFG.fastEMA),es=ema(a,i,CFG.slowEMA),tb=ef>=es,ts=ef<=es;
    let bs=0,ss=0;
    if(buySeq)bs+=45;if(sellSeq)ss+=45;
    if(buySeq?.vol)bs+=15;if(sellSeq?.vol)ss+=15;
    if(buySeq?.sweep)bs+=10;if(sellSeq?.sweep)ss+=10;
    if(bb)bs+=10;if(sb)ss+=10;
    if(!CFG.useTrend||tb)bs+=10;if(!CFG.useTrend||ts)ss+=10;
    bs+=10;ss+=10;
    let bv=!!buySeq&&bs>=CFG.minScore&&(!CFG.useTrend||tb)&&(!CFG.requireMicroBreak||bb);
    let sv=!!sellSeq&&ss>=CFG.minScore&&(!CFG.useTrend||ts)&&(!CFG.requireMicroBreak||sb);
    if(bv&&sv){if(bs>ss)sv=false;else if(ss>bs)bv=false;else{bv=false;sv=false}}
    if(bv&&i-lastBuy<CFG.minBarsBetween)bv=false;if(sv&&i-lastSell<CFG.minBarsBetween)sv=false;
    if(!bv&&!sv)continue;
    const d=bv?1:-1,score=bv?bs:ss,entry=a[i].c,pt=point||Math.max(ar/1000,1e-9),sl=entry-d*CFG.slPoints*pt,tp1=entry+d*CFG.tp1Points*pt,tp2=entry+d*CFG.tp2Points*pt,tp3=entry+d*CFG.tp3Points*pt;
    const o=outcome(a,i,d,entry,sl,tp1);
    hist.push({time:a[i].t,direction:d,code:d>0?"B":"S",score,entry,invalidation:sl,tp1,tp2,tp3,status:o===1?"TP":o<0?"SL":"P",outcome:o,reasons:["PVT SEQUENCE",d>0?"DEMAND REJECTION":"SUPPLY REJECTION",(d>0?buySeq:sellSeq)?.vol&&"VOLUME",(d>0?buySeq:sellSeq)?.sweep&&"SWEEP",(d>0?bb:sb)&&"MICRO BREAK",(d>0?tb:ts)&&"EMA TREND"].filter(Boolean),zone:{low:d>0?dLow:sLow,high:d>0?dHigh:sHigh}});
    if(d>0)lastBuy=i;else lastSell=i;
  }
  const h=hist.slice(-160),stats={total:h.length,tp:0,tr:0,be:0,sl:0,pending:0,wins:0,losses:0,winRate:0};
  for(const x of h){if(x.outcome===1){stats.tp++;stats.wins++}else if(x.outcome<0){stats.sl++;stats.losses++}else stats.pending++}
  stats.winRate=stats.wins+stats.losses?100*stats.wins/(stats.wins+stats.losses):0;
  const last=a.at(-2)||a.at(-1),ar=Math.max(atr(a,a.length-2),point||1e-9),rl=recentLow(a,a.length-2,CFG.zoneLookback),rh=recentHigh(a,a.length-2,CFG.zoneLookback),zw=Math.max(ar*CFG.zoneWidthATR,(point||1e-9)*20);
  const buy=[{tf:triggerTF,direction:1,currentDirection:1,high:rl+zw,low:rl,baseScore:60,sourceEvent:"PVT DEMAND",swapped:false,currentRetests:0}],sell=[{tf:triggerTF,direction:-1,currentDirection:-1,high:rh,low:rh-zw,baseScore:60,sourceEvent:"PVT SUPPLY",swapped:false,currentRetests:0}];
  const latestSignal=h.at(-1)||{code:"WAIT",score:0,status:"NO CONFIRMED PVT SEQUENCE",reason:"WAIT PRICE + VOLUME + TIME"};
  return {ready:true,engine:"PVT_MTF_Backtest_v1.02 web port • dynamic multi-asset",symbol,profile:{triggerTF,setupTF:triggerTF,biasTF:triggerTF},setupState:{trend:ema(a,a.length-2,CFG.fastEMA)>=ema(a,a.length-2,CFG.slowEMA)?1:-1,strength:50,lastEvent:"PVT"},biasState:{trend:ema(a,a.length-2,CFG.fastEMA)>=ema(a,a.length-2,CFG.slowEMA)?1:-1,strength:50,lastEvent:"EMA TREND"},premiumDiscount:null,activeZones:{buy,sell,swap:[]},latestSignal,watch:null,history:h,stats};
}
