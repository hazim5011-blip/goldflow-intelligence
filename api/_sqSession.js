const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const fmtters=new Map();

function parts(ms,timeZone){
  const key=timeZone;
  let f=fmtters.get(key);
  if(!f){
    f=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
    fmtters.set(key,f);
  }
  const out={};
  for(const p of f.formatToParts(new Date(ms))){
    if(p.type!=="literal")out[p.type]=p.value;
  }
  return {date:`${out.year}-${out.month}-${out.day}`,hour:Number(out.hour),minute:Number(out.minute)};
}
function validBar(b){return b&&n(b.t)!=null&&n(b.o)!=null&&n(b.h)!=null&&n(b.l)!=null&&n(b.c)!=null&&Number(b.h)>=Number(b.l)}
function utcMsFromBrokerBar(b,offsetSeconds){return (Number(b.t)-Number(offsetSeconds||0))*1000}
function summarizeBars(rows){
  if(!rows.length)return null;
  return {
    high:Math.max(...rows.map(x=>x.h)),
    low:Math.min(...rows.map(x=>x.l)),
    open:rows[0].o,
    close:rows.at(-1).c,
    firstUTC:rows[0].utc,
    lastUTC:rows.at(-1).utc,
    bars:rows.length
  };
}
const SESSIONS=[
  {id:"ASIA",label:"Asia",timeZone:"Asia/Tokyo",startHour:9,endHour:18},
  {id:"LONDON",label:"London",timeZone:"Europe/London",startHour:8,endHour:17},
  {id:"NEW_YORK",label:"New York",timeZone:"America/New_York",startHour:8,endHour:17}
];
function isInSession(local,s){return local.hour>=s.startHour&&local.hour<s.endHour}
function sessionDateNow(now,s){return parts(now.getTime(),s.timeZone).date}
function priorDateKey(dateKey){
  const d=new Date(dateKey+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
}
function brokerDayKeyFromRawT(t){return new Date(Number(t)*1000).toISOString().slice(0,10)}
function round(v,d=4){return n(v)==null?null:Number(Number(v).toFixed(d))}

export function buildSessionLiquidity({bars=[],brokerServerUTCOffsetSeconds=0,price=null,atr14=null,now=new Date()}={}){
  const clean=bars.filter(validBar).map(b=>({
    t:Number(b.t),o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:n(b.v),
    utc:utcMsFromBrokerBar(b,brokerServerUTCOffsetSeconds),
    brokerDate:brokerDayKeyFromRawT(b.t)
  })).sort((a,b)=>a.utc-b.utc);
  const closed=clean.length>1?clean.slice(0,-1):[];
  if(closed.length<40)return {ready:false,reason:"INSUFFICIENT_M5_BARS",bars:closed.length};

  const nowMs=now.getTime(),last=closed.at(-1),lastPrice=n(price)??last.c,atr=n(atr14);
  const currentSessions=[],sessionRows=[];
  for(const s of SESSIONS){
    const currentDate=sessionDateNow(now,s),previousDate=priorDateKey(currentDate);
    const today=closed.filter(b=>{
      const p=parts(b.utc,s.timeZone);return p.date===currentDate&&isInSession(p,s);
    });
    const previous=closed.filter(b=>{
      const p=parts(b.utc,s.timeZone);return p.date===previousDate&&isInSession(p,s);
    });
    const localNow=parts(nowMs,s.timeZone),active=localNow.date===currentDate&&isInSession(localNow,s);
    if(active)currentSessions.push(s.id);
    sessionRows.push({id:s.id,label:s.label,active,currentDate,range:summarizeBars(today),previousRange:summarizeBars(previous)});
  }

  const brokerDates=[...new Set(closed.map(x=>x.brokerDate))].sort();
  const currentBrokerDate=brokerDates.at(-1),previousBrokerDate=brokerDates.length>1?brokerDates.at(-2):null;
  const currentBrokerDay=summarizeBars(closed.filter(x=>x.brokerDate===currentBrokerDate));
  const previousBrokerDay=previousBrokerDate?summarizeBars(closed.filter(x=>x.brokerDate===previousBrokerDate)):null;

  const pools=[];
  function addPool(id,label,type,value,sourceDate){
    if(n(value)==null)return;
    const distance=lastPrice!=null?Number(value)-lastPrice:null;
    pools.push({
      id,label,type,value:Number(value),sourceDate:sourceDate||null,
      side:distance==null?"UNKNOWN":distance>0?"ABOVE":distance<0?"BELOW":"AT_PRICE",
      distance:distance==null?null:Math.abs(distance),
      distanceAtr:distance!=null&&atr>0?Math.abs(distance)/atr:null
    });
  }
  if(previousBrokerDay){
    addPool("PDH","Previous Broker Day High","HIGH",previousBrokerDay.high,previousBrokerDate);
    addPool("PDL","Previous Broker Day Low","LOW",previousBrokerDay.low,previousBrokerDate);
  }
  for(const s of sessionRows){
    const r=s.range||s.previousRange;
    const date=s.range?s.currentDate:priorDateKey(s.currentDate);
    if(!r)continue;
    addPool(s.id+"_H",s.label+" High","HIGH",r.high,date);
    addPool(s.id+"_L",s.label+" Low","LOW",r.low,date);
  }

  const latest=closed.at(-1);
  for(const p of pools){
    if(p.type==="HIGH")p.latestSweep=latest.h>p.value&&latest.c<p.value;
    else p.latestSweep=latest.l<p.value&&latest.c>p.value;
    p.latestBreak=p.type==="HIGH"?latest.c>p.value:latest.c<p.value;
  }
  pools.sort((a,b)=>(a.distanceAtr??999)-(b.distanceAtr??999));

  const active=sessionRows.filter(x=>x.active);
  const primary=active.at(-1)||null;
  let position=null;
  if(primary?.range&&lastPrice!=null){
    const span=primary.range.high-primary.range.low;
    position=span>0?clamp((lastPrice-primary.range.low)/span,0,1):null;
  }
  const nearestAbove=pools.filter(x=>x.side==="ABOVE").sort((a,b)=>a.distance-b.distance)[0]||null;
  const nearestBelow=pools.filter(x=>x.side==="BELOW").sort((a,b)=>a.distance-b.distance)[0]||null;
  const recentSweeps=pools.filter(x=>x.latestSweep);
  const overlap=currentSessions.length>=2;

  return {
    ready:true,bars:closed.length,brokerServerUTCOffsetSeconds:Number(brokerServerUTCOffsetSeconds||0),
    capturedAtUTC:now.toISOString(),currentSessions,overlap,
    primarySession:primary?.id||"OFF_SESSION",
    primarySessionRange:primary?.range||null,
    primarySessionPosition:position==null?null:round(position,4),
    currentBrokerDate,currentBrokerDay,previousBrokerDate,previousBrokerDay,
    sessions:sessionRows,pools:pools.slice(0,12),nearestAbove,nearestBelow,recentSweeps,
    latestClosedM5:{timeUTC:new Date(latest.utc).toISOString(),open:latest.o,high:latest.h,low:latest.l,close:latest.c},
    note:"Session and liquidity levels are derived from Vantage M5 closed candles. Session membership uses Tokyo, London and New York local clocks with DST-aware IANA time zones."
  };
}
