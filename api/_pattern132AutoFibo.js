const CFG={swingDepth:7,lookback:180,minSwingATR:1.50,atrPeriod:14};

export const PATTERN132_FIBO_LEVELS=[
  {value:0.0,label:"0 MARK 0",role:"MARK"},
  {value:0.125,label:"0.125 A",role:"LETTER"},
  {value:0.25,label:"0.25 LOW RISK",role:"LOW_RISK"},
  {value:0.375,label:"0.375 B",role:"LETTER"},
  {value:0.5,label:"0.5 MEDIUM RISK",role:"MEDIUM_RISK"},
  {value:0.625,label:"0.625 C",role:"LETTER"},
  {value:0.75,label:"0.75 HIGH RISK",role:"HIGH_RISK"},
  {value:0.875,label:"0.875 D",role:"LETTER"},
  {value:1.0,label:"1 MARK 1",role:"MARK"},
  {value:-0.25,label:"-0.25 E",role:"LETTER"},
  {value:-0.375,label:"-0.375 GONDEN ZONE",role:"GOLDEN"},
  {value:-0.5,label:"-0.5 F",role:"LETTER"},
  {value:1.25,label:"1.25 G",role:"LETTER"},
  {value:1.375,label:"1.375 GONDEN ZONE",role:"GOLDEN"},
  {value:1.5,label:"1.5 H",role:"LETTER"},
  {value:-0.7,label:"-0.7 COUNTER ZONE",role:"COUNTER"},
  {value:1.7,label:"1.7 COUNTER ZONE",role:"COUNTER"},
  {value:1.925,label:"1.925 FULL MARGIN",role:"FULL_MARGIN"},
  {value:-0.925,label:"-0.925 FULL MARGIN",role:"FULL_MARGIN"},
  {value:2.125,label:"2.125 SL",role:"SL"},
  {value:-1.125,label:"-1.125 SL",role:"SL"}
];

const num=v=>Number.isFinite(Number(v))?Number(v):null;
const norm=xs=>(xs||[]).map(x=>({
  t:num(x.t??x.time),o:num(x.o??x.open),h:num(x.h??x.high),l:num(x.l??x.low),c:num(x.c??x.close)
})).filter(x=>x.t!=null&&x.o!=null&&x.h!=null&&x.l!=null&&x.c!=null&&x.h>=x.l).sort((a,b)=>a.t-b.t);

function atrAtSeries(rates,shift,period){
  const total=rates.length;if(total<=shift+2)return 0;
  const last=Math.min(total-2,shift+Math.max(2,period)-1);
  let sum=0,samples=0;
  for(let i=shift;i<=last;i++){
    const previousClose=rates[i+1].c;
    const tr=Math.max(rates[i].h-rates[i].l,Math.abs(rates[i].h-previousClose),Math.abs(rates[i].l-previousClose));
    sum+=tr;samples++;
  }
  return samples?sum/samples:0;
}
function pivotHighSeries(rates,index,depth){
  if(index-depth<1||index+depth>=rates.length)return false;
  for(let j=1;j<=depth;j++)if(rates[index].h<=rates[index-j].h||rates[index].h<rates[index+j].h)return false;
  return true;
}
function pivotLowSeries(rates,index,depth){
  if(index-depth<1||index+depth>=rates.length)return false;
  for(let j=1;j<=depth;j++)if(rates[index].l>=rates[index-j].l||rates[index].l>rates[index+j].l)return false;
  return true;
}

export function runPattern132AutoFibo({bars,swingDepth=CFG.swingDepth,lookback=CFG.lookback,minSwingATR=CFG.minSwingATR,atrPeriod=CFG.atrPeriod}={}){
  const asc=norm(bars),depth=Math.trunc(Number(swingDepth)),lb=Math.trunc(Number(lookback)),minAtr=Number(minSwingATR),ap=Math.trunc(Number(atrPeriod));
  if(depth<1||depth>20||lb<30||!(minAtr>0)||ap<2)return {ready:false,active:false,error:"INVALID_FIBO_SETTINGS"};
  const rates=asc.slice().reverse(); // exact MT5 CopyRates series orientation: [0]=forming, [1]=last closed.
  if(rates.length<depth*2+20)return {ready:false,active:false,error:"INSUFFICIENT_BARS"};
  const last=Math.min(rates.length-depth-1,lb+depth);
  for(let recent=depth+1;recent<=last;recent++){
    const recentHigh=pivotHighSeries(rates,recent,depth),recentLow=pivotLowSeries(rates,recent,depth);
    if(recentHigh===recentLow)continue;
    for(let older=recent+1;older<=last;older++){
      const opposite=recentHigh?pivotLowSeries(rates,older,depth):pivotHighSeries(rates,older,depth);
      if(!opposite)continue;
      const price0=recentHigh?rates[older].l:rates[older].h;
      const price1=recentHigh?rates[recent].h:rates[recent].l;
      const atr=atrAtSeries(rates,recent,ap),distance=Math.abs(price1-price0);
      if(atr>0&&distance>=atr*minAtr){
        const invalidated=recentHigh?rates[1].c<price0:rates[1].c>price0;
        if(invalidated)return {ready:true,active:false,reason:"MARK0_INVALIDATED",direction:recentHigh?1:-1,mark0:{time:rates[older].t,price:price0},mark1:{time:rates[recent].t,price:price1},atr,distance};
        if(!(rates[older].t<rates[recent].t))return {ready:true,active:false,reason:"INVALID_ANCHOR_TIME_ORDER"};
        if(recentHigh&&!(price0<price1))return {ready:true,active:false,reason:"INVALID_BUY_ORIENTATION"};
        if(!recentHigh&&!(price0>price1))return {ready:true,active:false,reason:"INVALID_SELL_ORIENTATION"};
        const delta=price1-price0;
        return {ready:true,active:true,direction:recentHigh?1:-1,mark0:{time:rates[older].t,price:price0},mark1:{time:rates[recent].t,price:price1},atr,distance,
          levels:PATTERN132_FIBO_LEVELS.map(x=>({...x,price:price0+delta*x.value}))};
      }
      break; // MQ5: test the next confirmed recent pivot if this pair is too small.
    }
  }
  return {ready:true,active:false,reason:"WAITING_FOR_CONFIRMED_SWING"};
}
