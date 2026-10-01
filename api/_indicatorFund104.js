/*
 * Fund Structure A Signal v1.04 — broker candle WEB STUDY adapter.
 * Reference: user-supplied XAUUSD_FUND_STRUCTURE_A_SIGNAL_v1.04_LIVE_STUDY.mq5.
 * Deliberate differences: native MQL5 economic calendar, FRED/DXY as-of archive,
 * native iCustom buffers, Telegram event bus, all optional 40+ pattern switches,
 * full scalp-sequence memory and pre-close trade signals are NOT replicated here.
 * Never misrepresent the web subset as a compiled/executing MT5 indicator.
 * ALL historical signals are closed-candle VALID_ONLY; no synthetic TP/SL/win rate.
 */
const SETTINGS=Object.freeze({
  zoneLookback:35,zoneATRWidth:.65,structureLookback:14,sweepLookback:12,
  doubleLookback:28,doubleToleranceATR:.18,
  rsiPeriod:14,rsiBuy:[53,70],rsiSell:[30,48],minValidScore:6,
  gradeA:60,gradePlus:70,gradePremium:85,fastEMA:50,slowEMA:200
});
const TF_SEC={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
const valid=n=>Number.isFinite(Number(n));
const norm=a=>(a||[]).map(x=>({t:Number(x.t??x.time),o:Number(x.o??x.open),h:Number(x.h??x.high),l:Number(x.l??x.low),c:Number(x.c??x.close),v:Number(x.v??x.tick_volume??x.volume??0)}))
 .filter(b=>valid(b.t)&&b.t>0&&valid(b.o)&&valid(b.h)&&valid(b.l)&&valid(b.c)&&b.h>=b.l&&b.o>0&&b.c>0)
 .sort((x,y)=>x.t-y.t);
const min=(a,i,len,k="l")=>Math.min(...a.slice(Math.max(0,i-len),i).map(x=>x[k]));
const max=(a,i,len,k="h")=>Math.max(...a.slice(Math.max(0,i-len),i).map(x=>x[k]));
function atr(a,i,p=14){let s=0,c=0;for(let j=Math.max(0,i-p+1);j<=i;j++){const b=a[j],last=a[j-1]?.c??b.c;s+=Math.max(b.h-b.l,Math.abs(b.h-last),Math.abs(b.l-last));c++}return c?s/c:0}
function ema(a,i,p){if(i<0)return null;const start=Math.max(0,i-p*5),k=2/(p+1);let v=a[start].c;for(let j=start+1;j<=i;j++)v+=k*(a[j].c-v);return v}
function trend(src,tf,closeTime){
  const duration=TF_SEC[tf]||3600;
  let i=src.length-1;while(i>=0&&src[i].t+duration>closeTime)i--;
  if(i<SETTINGS.slowEMA+3)return 0;
  const fast=ema(src,i,SETTINGS.fastEMA),slow=ema(src,i,SETTINGS.slowEMA);
  return fast>slow&&src[i].c>fast?1:fast<slow&&src[i].c<fast?-1:0;
}
function rsi(a,i,p=14){
  if(i<p)return null;let up=0,down=0;
  for(let j=i-p+1;j<=i;j++){const delta=a[j].c-a[j-1].c;up+=Math.max(0,delta);down+=Math.max(0,-delta)}
  up/=p;down/=p;
  if(up===0&&down===0)return 50;if(down===0)return 100;
  return 100-100/(1+up/down);
}
function stoch(a,i){
  function raw(j){if(j<4)return null;const lo=Math.min(...a.slice(j-4,j+1).map(x=>x.l)),hi=Math.max(...a.slice(j-4,j+1).map(x=>x.h));return hi===lo?50:100*(a[j].c-lo)/(hi-lo)}
  function sm(j){let n=0,s=0;for(let k=j-2;k<=j;k++){const x=raw(k);if(x===null)return null;s+=x;n++}return s/n}
  const k=sm(i),pk=sm(i-1),d=[sm(i),sm(i-1),sm(i-2)];
  return k===null||pk===null||d.some(x=>x===null)?null:{k,prevK:pk,d:d.reduce((s,x)=>s+x,0)/3};
}
const bullish=a=>a.c>a.o,bearish=a=>a.c<a.o;
function patterns(a,i,ar,inDemand,inSupply){
 const b=a[i],p=a[i-1],q=a[i-2],namesBuy=[],namesSell=[];
 let bs=0,ss=0;function add(d,name,strength){if(d>0){namesBuy.push(name);bs=Math.max(bs,strength)}else{namesSell.push(name);ss=Math.max(ss,strength)}}
 if(!p)return {bs,ss,namesBuy,namesSell};
 const body=x=>Math.abs(x.c-x.o),range=x=>x.h-x.l;
 const bottom=x=>Math.min(x.o,x.c),top=x=>Math.max(x.o,x.c);
 if(bullish(b)&&bearish(p)&&b.o<=p.c&&b.c>=p.o&&body(b)>=body(p)*.85)add(1,"Bullish Engulfing",3);
 if(bearish(b)&&bullish(p)&&b.o>=p.c&&b.c<=p.o&&body(b)>=body(p)*.85)add(-1,"Bearish Engulfing",3);
 if(range(b)>0){
   const bo=Math.max(body(b),range(b)*.02),lw=bottom(b)-b.l,uw=b.h-top(b);
   if(lw>=2*bo&&uw<=.7*bo&&!inSupply)add(1,inDemand?"Hammer Candlestick":"Bullish Pin Bar",2);
   if(uw>=2*bo&&lw<=.7*bo)add(-1,inSupply?"Shooting Star":"Bearish Pin Bar",2);
   if(bullish(b)&&body(b)/range(b)>.86)add(1,"Bullish Marubozu",2);
   if(bearish(b)&&body(b)/range(b)>.86)add(-1,"Bearish Marubozu",2);
   if(body(b)/range(b)<=.12){if(inDemand)add(1,"Bullish Doji",1);if(inSupply)add(-1,"Bearish Doji",1)}
 }
 if(bearish(p)&&bullish(b)&&b.o<p.c&&b.c>(p.c+p.o)/2&&b.c<p.o)add(1,"Piercing Line",2);
 if(bullish(p)&&bearish(b)&&b.o>p.c&&b.c<(p.c+p.o)/2&&b.c>p.o)add(-1,"Dark Cloud Cover",2);
 if(bearish(p)&&bullish(b)&&top(b)<top(p)&&bottom(b)>bottom(p))add(1,"Bullish Harami",2);
 if(bullish(p)&&bearish(b)&&top(b)<top(p)&&bottom(b)>bottom(p))add(-1,"Bearish Harami",2);
 if(Math.abs(b.l-p.l)<=ar*.18&&bullish(b)&&bearish(p))add(1,"Tweezer Bottom",2);
 if(Math.abs(b.h-p.h)<=ar*.18&&bearish(b)&&bullish(p))add(-1,"Tweezer Top",2);
 if(q){
  if(bearish(q)&&body(p)<body(q)*.45&&bullish(b)&&b.c>(q.o+q.c)/2)add(1,"Morning Star",3);
  if(bullish(q)&&body(p)<body(q)*.45&&bearish(b)&&b.c<(q.o+q.c)/2)add(-1,"Evening Star",3);
  if(bearish(q)&&bullish(p)&&top(p)<top(q)&&bottom(p)>bottom(q)&&b.c>q.o)add(1,"Three Inside Up",3);
  if(bullish(q)&&bearish(p)&&top(p)<top(q)&&bottom(p)>bottom(q)&&b.c<q.o)add(-1,"Three Inside Down",3);
  if(bearish(q)&&bullish(p)&&bullish(b)&&b.c>p.c&&p.c>q.o)add(1,"Three Outside Up",3);
  if(bullish(q)&&bearish(p)&&bearish(b)&&b.c<p.c&&p.c<q.o)add(-1,"Three Outside Down",3);
  if([q,p,b].every(bullish)&&q.c<p.c&&p.c<b.c)add(1,"Three White Soldiers",3);
  if([q,p,b].every(bearish)&&q.c>p.c&&p.c>b.c)add(-1,"Three Black Crows",3);
 }
 for(let k=i-3;k>=Math.max(3,i-SETTINGS.doubleLookback);k--){
  if(Math.abs(b.l-a[k].l)<=ar*SETTINGS.doubleToleranceATR&&b.c>b.o&&max(a,i,i-k-1,"h")>b.l+ar*.6){add(1,"Double Bottom",2);break}
 }
 for(let k=i-3;k>=Math.max(3,i-SETTINGS.doubleLookback);k--){
  if(Math.abs(b.h-a[k].h)<=ar*SETTINGS.doubleToleranceATR&&b.c<b.o&&min(a,i,i-k-1,"l")<b.h-ar*.6){add(-1,"Double Top",2);break}
 }
 return{bs,ss,namesBuy,namesSell};
}
function oneSignal(a,i,htf1,htf2){
 if(i<80)return null;const b=a[i],ar=atr(a,i);
 if(ar<=0||b.h-b.l<.2*ar||b.h-b.l>3.2*ar)return null;
 const priorLow=min(a,i,SETTINGS.zoneLookback),priorHigh=max(a,i,SETTINGS.zoneLookback),demHi=priorLow+.65*ar,supLo=priorHigh-.65*ar;
 const inDemand=b.l<=demHi&&b.c>=priorLow,inSupply=b.h>=supLo&&b.c<=priorHigh;
 const low12=min(a,i,SETTINGS.sweepLookback),high12=max(a,i,SETTINGS.sweepLookback);
 const sweepLow=b.l<low12-ar*.04&&b.c>low12,sweepHigh=b.h>high12+ar*.04&&b.c<high12;
 const structureHi=max(a,i,SETTINGS.structureLookback),structureLo=min(a,i,SETTINGS.structureLookback);
 const bosUp=b.c>structureHi,bosDown=b.c<structureLo;
 const prevDown=a[i-2].c<a[i-3].c||a[i-1].c<a[i-2].c,prevUp=a[i-2].c>a[i-3].c||a[i-1].c>a[i-2].c;
 const chochUp=prevDown&&b.c>max(a,i,7),chochDown=prevUp&&b.c<min(a,i,7);
 const structUp=bosUp||chochUp,structDown=bosDown||chochDown;
 const p=patterns(a,i,ar,inDemand,inSupply),rr=rsi(a,i),st=stoch(a,i);
 const rb=rr!==null&&rr>=SETTINGS.rsiBuy[0]&&rr<=SETTINGS.rsiBuy[1],rs=rr!==null&&rr>=SETTINGS.rsiSell[0]&&rr<=SETTINGS.rsiSell[1];
 const sb=!!st&&st.k>st.d&&st.k>st.prevK,ss=!!st&&st.k<st.d&&st.k<st.prevK;
 const d1=htf1,d2=htf2,dominance=b.h===b.l?50:(b.c-b.l)/(b.h-b.l)*100;
 const results=[];
 for(const d of [1,-1]){
  const strength=d>0?p.bs:p.ss,names=d>0?p.namesBuy:p.namesSell;
  if(strength<1)continue;
  const zone=d>0?inDemand:inSupply,sweep=d>0?sweepLow:sweepHigh,structure=d>0?structUp:structDown;
  const rsiOk=d>0?rb:rs,stochOk=d>0?sb:ss,trendOk=d1===d||d2===d,domOk=d>0?dominance>=60:dominance<=40;
  const bs=strength+(zone?2:0)+(sweep?2:0)+(structure?2:0)+(d1===d?1:0)+(d2===d?1:0)+(domOk?1:0);
  const validated=zone&&structure&&bs>=SETTINGS.minValidScore;
  // Native grade: 25 zone + 15 structure + 8/12/15 pattern +
  // 10 RSI + 10 stochastic + 0..15 macro + 5 local trend + 5 HTF.
  // No as-of macro feed = NO MACRO POINTS and NEVER an A++ claim.
  const score=Math.min(100,(zone?25:0)+(structure?15:0)+(strength>=3?15:strength===2?12:8)+(rsiOk?10:0)+(stochOk?10:0)+(trendOk?5:0));
  const grade=zone&&score>=SETTINGS.gradePlus?"A+":zone&&score>=SETTINGS.gradeA?"A":"";
  const reasons=[...names,zone?(d>0?"Demand":"Supply"):"OUTSIDE ZONE",sweep?(d>0?"SWEEP LOW":"SWEEP HIGH"):"",structure?(d>0?(bosUp?"BOS UP":"CHOCH UP"):(bosDown?"BOS DOWN":"CHOCH DOWN")):"",rsiOk?"RSI CONFIRMED":"",stochOk?"STOCH CONFIRMED":"",trendOk?"HTF ALIGN":"", "FUNDAMENTAL AS-OF UNAVAILABLE • A++ BLOCKED"].filter(Boolean);
  results.push({time:b.t,direction:d,code:d>0?"B":"S",score,status:grade||validated?"VALID":"WATCH",grade,entry:b.c,invalidation:d>0?b.l-ar*.18:b.h+ar*.18,tp1:null,tp2:null,reasons,entryScore:Math.round(100*bs/16),confirmed:validated||grade!==""});
 }
 results.sort((x,y)=>y.score-x.score);
 // Native engine suppresses equal-grade opposite directions (avoid ambiguous B+S).
 return results.length>1&&results[0].score===results[1].score?null:results[0]||null;
}
export function runFund104({triggerBars,setupBars,biasBars,triggerTF="M5",setupTF="H1",biasTF="H4",symbol="",point=0}){
 const a=norm(triggerBars),one=norm(setupBars),two=norm(biasBars);
 if(a.length<110)return {ready:false,error:"Insufficient closed broker candles for Fund Structure v1.04 study."};
 const history=[],limit=Math.min(a.length-2,400),first=Math.max(80,a.length-2-limit);
 for(let i=first;i<a.length-1;i++){
  const closeTime=a[i].t+(TF_SEC[triggerTF]||300);
  const h1=trend(one,setupTF,closeTime),h4=trend(two,biasTF,closeTime);
  const s=oneSignal(a,i,h1,h4);
  if(s&&s.confirmed)history.push(s);
 }
 // Match the native default invalidation lifecycle using only later CLOSED candles.
 // A currently invalid pattern must not remain the latest "VALID" web signal.
 const invalidated=(sig)=>{
   const sourceIndex=a.findIndex(b=>b.t===sig.time);
   if(sourceIndex<0)return false;
   const ar=atr(a,sourceIndex),src=a[sourceIndex];
   const level=sig.direction>0?src.l-.05*ar:src.h+.05*ar;
   for(let j=sourceIndex+1;j<a.length-1;j++){
     if(sig.direction>0&&a[j].c<level)return true;
     if(sig.direction<0&&a[j].c>level)return true;
   }
   return false;
 };
 const visibleHistory=history.filter(sig=>!invalidated(sig));
 const i=a.length-2,last=a[i],closeTime=last.t+(TF_SEC[triggerTF]||300),h1=trend(one,setupTF,closeTime),h4=trend(two,biasTF,closeTime),ar=atr(a,i);
 const low=min(a,i,SETTINGS.zoneLookback),high=max(a,i,SETTINGS.zoneLookback);
 const buyZone={direction:1,currentDirection:1,low,high:low+.65*ar,baseScore:60,sourceEvent:"SND DEMAND • WEB STUDY",currentRetests:0,tf:triggerTF};
 const sellZone={direction:-1,currentDirection:-1,low:high-.65*ar,high,baseScore:60,sourceEvent:"SND SUPPLY • WEB STUDY",currentRetests:0,tf:triggerTF};
 const recent=visibleHistory.at(-1);
 const fresh=recent&&recent.time>=a[Math.max(0,i-3)].t;
 const latest=(fresh?recent:null)||{code:"WAIT",status:"WAIT CLOSED-CANDLE CONFIRMATION",score:null,entry:null,invalidation:null,tp1:null,tp2:null,reasons:["NO RECENT QUALIFIED SETUP","A++ BLOCKED WITHOUT TIMESTAMP-VERIFIED MACRO"]};
 const bias=h4,setup=h1;
 return {ready:true,engine:"Fund Structure A Signal v1.04 • WEB STUDY SUBSET (not native iCustom)",symbol,
  studyCoverage:"CLOSED_CANDLE_PATTERNS_SND_STRUCTURE_RSI_STOCH_MTF_ONLY",
  limitations:["NO_NATIVE_iCUSTOM_BUFFER","NO_FULL_1_04_PATTERN_PARITY","NO_VERIFIED_AS_OF_DXY_US2Y_US10Y","A_PLUS_PLUS_DISABLED","SCALP_SEQUENCE_UNAVAILABLE","PRE_CLOSE_LIVE_IS_NOT_CONFIRMED","NO_ORDER_EXECUTION"],
  profile:{triggerTF,setupTF,biasTF},setupState:{trend:setup,strength:setup?65:50,lastEvent:setup>0?"HTF1 EMA BULL":setup<0?"HTF1 EMA BEAR":"HTF1 WAIT"},
  biasState:{trend:bias,strength:bias?65:50,lastEvent:bias>0?"HTF2 EMA BULL":bias<0?"HTF2 EMA BEAR":"HTF2 WAIT"},
  premiumDiscount:null,
  activeZones:{buy:[buyZone],sell:[sellZone],swap:[]},
  latestSignal:latest,
  watch:{direction:0,reason:"Fund Structure web study zones, not broker orders",zone:buyZone},
  history:visibleHistory.slice(-160),
  stats:{total:visibleHistory.length,validOnly:visibleHistory.length,wins:0,losses:0,pending:0,tp:0,tr:0,be:0,sl:0,winRate:null},
  gradeMethod:"MQL5 grade source 60/70/85. WEB STUDY A++ disabled without archived as-of macro."
 };
}
