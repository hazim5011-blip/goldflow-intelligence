// GF Study v1: auditable, CLOSED-CANDLE research. No trained ML or broker order execution.
// Backend is intentionally pure for deterministic replay and unit testing.
export const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
const N=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const round=(v,d=5)=>N(v)===null?null:Number(Number(v).toFixed(d));
export function normalizedClosedBars(raw=[],tf="M15",nowSec=Date.now()/1000,offset=10800){
 const sec=TF_SECONDS[tf];
 if(!sec||!Array.isArray(raw))return [];
 // MT5 candle epochs are broker UTC+3 (verified in V8.1.1); never use a forming candle.
 const bars=raw.map(b=>({t:N(b.t),o:N(b.o),h:N(b.h),l:N(b.l),c:N(b.c),v:N(b.v)}))
  .filter(b=>[b.t,b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.h>=Math.max(b.o,b.c,b.l)&&b.l<=Math.min(b.o,b.c))
  .sort((a,b)=>a.t-b.t);
 const unique=bars.filter((b,i)=>i===0||b.t>bars[i-1].t);
 return unique.filter(b=>b.t-offset+sec<=nowSec-1); // ONLY fully closed candles
}
function ema(a,p){if(!a.length)return null;let e=a[0].c,k=2/(p+1);for(let i=1;i<a.length;i++)e=e+k*(a[i].c-e);return e}
function atr(a,p=14){if(a.length<2)return null;let sum=0,n=0;for(let i=Math.max(1,a.length-p);i<a.length;i++){const b=a[i],prev=a[i-1];sum+=Math.max(b.h-b.l,Math.abs(b.h-prev.c),Math.abs(b.l-prev.c));n++}return n?sum/n:null}
function trend(a){if(a.length<30)return 0;const fast=ema(a.slice(-70),10),slow=ema(a.slice(-70),20),prior=ema(a.slice(-72,-2),20),p=atr(a);if(!p||!N(fast)||!N(slow)||!N(prior))return 0;return fast>slow&&slow>prior&&fast-slow>.02*p?1:fast<slow&&slow<prior&&slow-fast>.02*p?-1:0}
function goldSymbol(symbol){return /^(XAU|GOLD)/i.test(String(symbol||""))}
function macroDirection(m){
 if(!m||!m.quality||m.quality.available!==m.quality.total||m.quality.errors?.length||m.quality.stale?.length||!m.gold)return null;
 if(m.gold.bias==="PRESSURE")return -1;if(m.gold.bias==="SUPPORTIVE")return 1;return 0;
}
function result(status,data={}){return {ok:true,engine:"GF_RULE_BASED_STUDY_V1",status,canEnter:false,isExecutedTrade:false,modelType:"AUDITABLE_RULES_NOT_TRAINED_ML",...data}}
function patterns(a,i,p){
 const c=a[i],prev=a[i-1],base=a.slice(Math.max(0,i-20),i),last6=a.slice(Math.max(0,i-6),i);
 if(base.length<15||last6.length<5)return [];
 const max6=Math.max(...last6.map(x=>x.h)),min6=Math.min(...last6.map(x=>x.l));
 const low20=Math.min(...base.map(x=>x.l)),high20=Math.max(...base.map(x=>x.h)),range=Math.max(c.h-c.l,1e-12);
 const body=Math.abs(c.c-c.o)/range,lowWick=(Math.min(c.o,c.c)-c.l)/range,upWick=(c.h-Math.max(c.o,c.c))/range;
 const buyBreak=c.c>max6+.03*p&&c.c>c.o&&body>=.42;
 const sellBreak=c.c<min6-.03*p&&c.c<c.o&&body>=.42;
 const buyReject=c.c>c.o&&body>=.38&&lowWick>=.23&&c.l<=low20+.25*p&&c.c>prev.c;
 const sellReject=c.c<c.o&&body>=.38&&upWick>=.23&&c.h>=high20-.25*p&&c.c<prev.c;
 return [{direction:1,valid:buyBreak||buyReject,type:buyBreak?"CLOSED_CANDLE_BREAKOUT":"DEMAND_REJECTION",level:buyBreak?max6:low20,baseLow:low20,baseHigh:high20},
  {direction:-1,valid:sellBreak||sellReject,type:sellBreak?"CLOSED_CANDLE_BREAKDOWN":"SUPPLY_REJECTION",level:sellBreak?min6:high20,baseLow:low20,baseHigh:high20}].filter(x=>x.valid);
}
/**
 * Current-study states are recomputed from closed broker candles; never retroactively attach today's macro data to past performance.
 * quote = {bid,ask,tickTime,observedAt}; tickTime MT5 broker epoch (offsetSeconds) and observedAt bridge Unix UTC.
 */
export function evaluateStudy({symbol="XAUUSD247",tf="M15",bars=[],h1=[],h4=[],quote=null,offsetSeconds=10800,
 macro=null,mode="ai",nowSec=Math.floor(Date.now()/1000)}={}){
 if(!TF_SECONDS[tf]||!Number.isInteger(offsetSeconds)||Math.abs(offsetSeconds)>50400)return result("DATA_UNVERIFIED",{reason:"INVALID_TF_OR_BROKER_OFFSET"});
 const c=normalizedClosedBars(bars,tf,nowSec,offsetSeconds),a1=normalizedClosedBars(h1,"H1",nowSec,offsetSeconds),a4=normalizedClosedBars(h4,"H4",nowSec,offsetSeconds);
 const info={symbol,tf,mode,closedCandleCount:c.length,brokerUtcOffsetSeconds:offsetSeconds,updatedAtUTC:new Date(nowSec*1000).toISOString(),macroStatus:macro?.quality||null};
 if(c.length<40||a1.length<30||a4.length<30)return result("DATA_UNVERIFIED",{...info,reason:"INSUFFICIENT_CLOSED_MTF_CANDLES"});
 const latest=c.at(-1),interval=TF_SECONDS[tf],closedAtUTC=new Date((latest.t-offsetSeconds+interval)*1000).toISOString(),ageSec=nowSec-(latest.t-offsetSeconds+interval);
 const qBid=N(quote?.bid),qAsk=N(quote?.ask),qTime=N(quote?.tickTime),qObs=N(quote?.observedAt);
 const quoteAge=qTime===null||qObs===null?null:qObs-(qTime-offsetSeconds);
 const snapshotAge=qObs===null?null:nowSec-qObs;
 const quoteGood=qBid!==null&&qAsk!==null&&qBid>0&&qAsk>=qBid&&quoteAge!==null&&quoteAge>=-20&&quoteAge<=35&&snapshotAge!==null&&snapshotAge>=-25&&snapshotAge<=35;
 const marketFresh=ageSec>=-2&&ageSec<=Math.max(interval*2,300);
 const base={...info,closedAtUTC,ageSeconds:round(ageSec,0),quoteAgeSeconds:round(quoteAge,0),bid:qBid,ask:qAsk,macroBias:macro?.gold?.bias||"UNAVAILABLE",
  macroScore:N(macro?.gold?.score),newsModeNote:"Official observation date is NOT a verified news release time; no forecast/surprise is invented.",
  caution:"Derived macro context and technical confirmation are NOT a guaranteed price direction."};
 if(!quoteGood||!marketFresh)return result("MARKET_OFFLINE",{...base,reason:!quoteGood?"BROKER_TICK_MISSING_OR_STALE":"LATEST_CLOSED_CANDLE_STALE"});
 if(mode==="news"&&!goldSymbol(symbol))return result("DATA_UNVERIFIED",{...base,reason:"GOLD_NEWS_STUDY_ONLY"});
 const macroDir=goldSymbol(symbol)?macroDirection(macro):0;
 if(mode==="news"&&macroDir===null)return result("DATA_UNVERIFIED",{...base,reason:"OFFICIAL_MACRO_INCOMPLETE_OR_STALE"});
 const h1Trend=trend(a1),h4Trend=trend(a4);
 const context={h1Trend,h4Trend,macroDir,technicalSource:"VANTAGE_CLOSED_CANDLES",fundamentalSource:macro?.provider||"UNAVAILABLE"};
 // Search last five closed trigger bars; publish only recent confirmations, never invent one from price alone.
 let event=null,conflict=null;
 for(let i=c.length-1;i>=Math.max(25,c.length-5);i--){
  const prior=c.slice(0,i+1),p=atr(prior);
  if(!p||p<=0)continue;
  const checks=patterns(c,i,p);
  for(const x of checks){
   const e=ema(prior.slice(-70),20),d=x.direction;
   if(d*(c[i].c-e)<=0)continue; // directional EMA validation at signal close
   if(h1Trend===-d||h4Trend===-d||(macroDir!==null&&macroDir===-d)){conflict={direction:d,type:x.type,closedAtUTC:new Date((c[i].t-offsetSeconds+interval)*1000).toISOString()};continue}
   event={...x,i,signal:c[i],atr:p,d,score:Math.min(90,50+10*(h1Trend===d)+8*(h4Trend===d)+8*(macroDir===d)+8*(x.type.includes("BREAK")))};
   break;
  }
  if(event)break;
 }
 if(!event)return result(conflict?"WAIT_CONFLICT":"WAIT_CONFIRMATION",{...base,...context,
  direction:conflict?.direction||h1Trend||0,confirmation:null,reason:conflict?"Technical pattern conflicts with current HTF/macro context":"Waiting for a NEW closed-candle breakout or validated zone rejection.",
  nextCandleCloseUTC:new Date((latest.t-offsetSeconds+2*interval)*1000).toISOString()});
 const {d,signal,p,atr:vol}=event;const elapsed=c.length-1-event.i;
 const point=Math.max(vol*.005,1e-9);
 // Entry is a retest band near the confirmation close, never "enter at any price."
 const entry=d===1?
  {low:signal.c-.42*vol,high:signal.c-.08*vol}:
  {low:signal.c+.08*vol,high:signal.c+.42*vol};
 const invalidation=d===1?Math.min(signal.l,event.baseLow)-.12*vol:Math.max(signal.h,event.baseHigh)+.12*vol;
 const center=(entry.low+entry.high)/2,risk=d*(center-invalidation);
 if(!(risk>point))return result("WAIT_CONFIRMATION",{...base,...context,reason:"INVALID_RISK_GEOMETRY"});
 const plan={direction:d,side:d===1?"BUY":"SELL",entryLow:round(entry.low),entryHigh:round(entry.high),invalidation:round(invalidation),
  tp1:round(center+d*risk),tp2:round(center+d*2*risk),tp3:round(center+d*3*risk),riskPriceMove:round(risk),score:Math.round(event.score),
  confirmationType:event.type,confirmationCloseUTC:new Date((signal.t-offsetSeconds+interval)*1000).toISOString(),signalCandleTime:signal.t,expiresAfterClosedBars:3,
  explanation:[event.type,"H1 trend "+h1Trend,"H4 trend "+h4Trend,"Macro "+(macroDir===null?"UNVERIFIED":macroDir)],verifiedForecastSurprise:false};
 const current=d===1?qAsk:qBid;
 const closedInvalid=c.slice(event.i+1).some(x=>d*(x.c-invalidation)<=0);
 const liveInvalid=d*(current-invalidation)<=0;
 const overlay={...base,...context,direction:d,confirmation:plan,elapsedClosedBars:elapsed,entryQuote:current,entryQuoteSide:d===1?"ASK":"BID"};
 if(closedInvalid||liveInvalid)return result(d===1?"BUY_INVALID":"SELL_INVALID",{...overlay,reason:closedInvalid?"CLOSED_CANDLE_BEYOND_INVALIDATION":"LIVE_BROKER_QUOTE_BREACHED_INVALIDATION",invalidationBasis:closedInvalid?"CLOSE":"INTRABAR_QUOTE"});
 if(elapsed>3)return result("EXPIRED",{...overlay,reason:"ENTRY_WINDOW_EXPIRED_AFTER_3_CLOSED_BARS"});
 const inside=current>=entry.low&&current<=entry.high;
 // Price travelling too far towards target becomes MISSED, not a chased entry.
 const chased=d===1?current>entry.high+.5*vol:current<entry.low-.5*vol;
 const st=inside?(d===1?"BUY_ENTRY_READY":"SELL_ENTRY_READY"):chased?"MISSED_ENTRY":d===1?"BUY_CONFIRMED":"SELL_CONFIRMED";
 return result(st,{...overlay,canEnter:inside,entryState:inside?"BROKER_QUOTE_IN_VERIFIED_ENTRY_ZONE":chased?"DO_NOT_CHASE":"WAIT_RETEST",
 reason:inside?"Closed-candle confirmation AND fresh broker quote within entry band":chased?"Price already left entry band; wait for a NEW setup":"Confirmed direction; entry band not yet reached."});
}
