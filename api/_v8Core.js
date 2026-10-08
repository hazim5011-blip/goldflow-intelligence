import {createHash} from "node:crypto";

export const V8_ENGINE_BUILD="v8.1.3-normalized-trade-plan-net-performance";
export const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
const VALID_OUTCOMES=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE","BE_ZERO","SL","TIME_WIN","TIME_LOSS","GAP_LOSS"]);
const POSITIVE=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE","TIME_WIN"]);
const NEGATIVE=new Set(["SL","TIME_LOSS","GAP_LOSS"]);
const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const iso=sec=>n(sec)!=null?new Date(Number(sec)*1000).toISOString():null;
const snap=(x,digits=10)=>n(x)==null?null:Number(Number(x).toFixed(Math.min(12,Math.max(2,digits))));
const parseDirection=x=>n(x?.direction)>0?1:n(x?.direction)<0?-1:0;
const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
const canonical=s=>String(s||"").toUpperCase().replace(/[.#].*$/,"").replace(/[^A-Z0-9]/g,"");
function hmaclessHash(body){return createHash("sha256").update(JSON.stringify(body)).digest("hex")}
export function pipConvention(symbol,point){
  const root=canonical(symbol);
  const fx=/^(EUR|GBP|USD|JPY|AUD|NZD|CAD|CHF|SGD|HKD|CNH|CNY)[A-Z]{3}$/.test(root);
  if(fx)return {pipSize:root.endsWith("JPY")?.01:.0001,origin:"STANDARD_FX_DISPLAY_CONVENTION"};
  if(root.startsWith("XAU"))return {pipSize:.10,origin:"GOLDFLOW_XAU_DISPLAY_CONVENTION_NOT_UNIVERSAL"};
  if(root.startsWith("XAG"))return {pipSize:.01,origin:"GOLDFLOW_XAG_DISPLAY_CONVENTION_NOT_UNIVERSAL"};
  return {pipSize:null,origin:"UNDEFINED_FOR_THIS_ASSET"};
}
export function metadataFromCatalog(info,requested,resolved){
  const row=info&&typeof info==="object"?info:{};
  const point=n(row.point),digits=n(row.digits),contractSize=n(row.contractSize),volumeMin=n(row.volumeMin),volumeStep=n(row.volumeStep);
  const cc=String(row.currencyProfit||"").toUpperCase(),lot=.01;
  const available=point>0&&contractSize>0&&volumeMin>0&&volumeStep>0&&!!cc;
  const volAligned=volumeStep>0&&Math.abs(Math.round((lot-volumeMin)/volumeStep)-((lot-volumeMin)/volumeStep))<1e-6;
  const supported=available&&lot+1e-10>=volumeMin&&volAligned;
  const pc=pipConvention(resolved||requested,point);
  const category=String(row.category||"").toUpperCase();
  const linear=["FOREX","METALS","ENERGY"].includes(category);
  return {symbolRequested:requested,symbolResolved:resolved,category,point,digits,contractSize,currencyProfit:cc||null,
    currencyBase:row.currencyBase||null,volumeMin,volumeStep,volumeMax:n(row.volumeMax),
    tickSize:n(row.tickSize??row.tradeTickSize),tickValueProfit:n(row.tickValueProfit??row.tradeTickValueProfit),
    tickValueLoss:n(row.tickValueLoss??row.tradeTickValueLoss),
    pipSize:pc.pipSize,pipConvention:pc.origin,lotExample:lot,lotExampleSupported:supported,
    grossEstimateAvailable:supported&&linear&&cc==="USD",
    metadataStatus:available?"BROKER_CATALOG":"BROKER_METADATA_INCOMPLETE"};
}
function touchStop(b,d,stop){return d>0?b.l<=stop:b.h>=stop}
function touchTarget(b,d,target){return d>0?b.h>=target:b.l<=target}
function move(d,entry,exit){return d*(exit-entry)}
function stoppedAt(b,d,level){return d>0?Math.min(b.o,level):Math.max(b.o,level)}

const NORMALIZED_MANAGEMENT={beTriggerR:.50,beLockR:.05,trailTriggerR:.75,trailDistanceR:.35};
export function normalizedTradePlan(signal,mode="105"){
  const d=parseDirection(signal),entry=n(signal?.entry),sl=n(signal?.invalidation??signal?.originalSL);
  const rawTp1=n(signal?.tp1),rawTp2=n(signal?.tp2),rawTp3=n(signal?.tp3);
  if(!d||entry==null||sl==null)return {valid:false,origin:"INCOMPLETE_SIGNAL",direction:d,entry,sl,tp1:rawTp1,tp2:rawTp2,tp3:rawTp3};
  const risk=Math.abs(entry-sl);
  if(!(risk>0)||move(d,entry,sl)>=0)return {valid:false,origin:"INVALID_RISK_GEOMETRY",direction:d,entry,sl,tp1:rawTp1,tp2:rawTp2,tp3:rawTp3};
  const nativeTarget=rawTp1!=null&&move(d,entry,rawTp1)>0;
  const tp1=nativeTarget?rawTp1:entry+d*risk;
  const tp2=rawTp2!=null&&move(d,entry,rawTp2)>0?rawTp2:entry+d*risk*2;
  const tp3=rawTp3!=null&&move(d,entry,rawTp3)>0?rawTp3:entry+d*risk*3;
  return {valid:true,direction:d,entry,sl,tp1:snap(tp1),tp2:snap(tp2),tp3:snap(tp3),risk:snap(risk),
    origin:nativeTarget?"ENGINE_TARGET_WITH_NORMALIZED_MANAGEMENT":"GOLDFLOW_NORMALIZED_STUDY_PLAN_1R_2R_3R",
    nativeTarget,management:{...NORMALIZED_MANAGEMENT,policy:"CLOSED_OHLC_CONSERVATIVE"}};
}
export function replayOutcome(signal,bars=[],tf="M5",mode="105"){
  const plan=normalizedTradePlan(signal,mode),d=plan.direction,entry=plan.entry,stop=plan.sl,tp=plan.tp1;
  const signalOpen=n(signal.time),close=n(signal.closeTime)??(signalOpen!=null?signalOpen+(TF_SECONDS[tf]||300):null);
  const blank={exitPrice:null,exitTimeUTC:null,exitRule:null,priceMove:null,outcome:"PENDING",dataQuality:[],
    replayRule:"OHLC conservative; last forming candle excluded; normalized management applies to all evaluable trade plans",
    planOrigin:plan.origin,management:plan.management||null};
  if(!plan.valid||signalOpen==null||close==null)return {...blank,outcome:"VALID_ONLY",dataQuality:["NO_EVALUABLE_ENTRY_SL_PLAN"]};
  const risk=plan.risk;
  if(move(d,entry,tp)<=0)return {...blank,outcome:"INVALID",dataQuality:["INVALID_SL_OR_TP_DIRECTION"]};
  const closed=Array.isArray(bars)?bars.slice(0,-1).map(x=>({t:n(x.t??x.time),o:n(x.o??x.open),h:n(x.h??x.high),l:n(x.l??x.low),c:n(x.c??x.close)})).filter(x=>x.t!=null&&x.o!=null&&x.h!=null&&x.l!=null&&x.c!=null&&x.h>=x.l&&x.t>=close).sort((a,b)=>a.t-b.t):[];
  if(!closed.length)return {...blank,outcome:"PENDING",dataQuality:["NO_CLOSED_FUTURE_BARS_IN_WINDOW"]};
  let activeStop=stop,best=entry,source="SL";
  for(const b of closed){
    const hitStop=touchStop(b,d,activeStop),hitTP=touchTarget(b,d,tp);
    if(hitStop&&hitTP)return {...blank,outcome:"AMBIGUOUS",exitTimeUTC:iso(b.t),exitRule:"TP_AND_STOP_SAME_CANDLE",dataQuality:["INTRABAR_ORDER_UNKNOWN"]};
    if(hitStop){
      const exit=stoppedAt(b,d,activeStop),p=move(d,entry,exit);
      const outcome=source==="SL"?"SL":p>1e-10?source==="TRAILING"?"TRAILING":"BE_POSITIVE":Math.abs(p)<=1e-10?"BE_ZERO":"SL";
      return {...blank,outcome,exitPrice:exit,exitTimeUTC:iso(b.t),priceMove:p,
        exitRule:source==="SL"?"ORIGINAL_SL_WITH_GAP_RULE":source+"_STOP_WITH_GAP_RULE",dataQuality:[]};
    }
    if(hitTP){
      return {...blank,outcome:"TP1",exitPrice:tp,exitTimeUTC:iso(b.t),priceMove:move(d,entry,tp),exitRule:"FIRST_TP_TARGET",dataQuality:[]};
    }
    best=d>0?Math.max(best,b.h):Math.min(best,b.l);
    const rr=move(d,entry,best)/risk;
    if(rr>=NORMALIZED_MANAGEMENT.beTriggerR){
      const lock=entry+d*NORMALIZED_MANAGEMENT.beLockR*risk;
      if(move(d,activeStop,lock)>0){activeStop=lock;source="BE"}
    }
    if(rr>=NORMALIZED_MANAGEMENT.trailTriggerR){
      const trail=d>0?best-NORMALIZED_MANAGEMENT.trailDistanceR*risk:best+NORMALIZED_MANAGEMENT.trailDistanceR*risk;
      if(move(d,activeStop,trail)>0){activeStop=trail;source="TRAILING"}
    }
  }
  return {...blank,outcome:"PENDING",dataQuality:["EXIT_NOT_YET_IN_AVAILABLE_CLOSED_BARS"]};
}
function grossEstimate(m,spec){
  if(!spec?.grossEstimateAvailable||n(m)==null)return null;
  // Only use broker catalog contract size for linear contracts quoted and settled in USD.
  return snap(m*spec.contractSize*spec.lotExample);
}

function pvtChart101Plan(x){
  const d=parseDirection(x),entry=n(x?.entry),sl=n(x?.invalidation),tp1=n(x?.tp1),tp2=n(x?.tp2),tp3=n(x?.tp3);
  const risk=entry!=null&&sl!=null&&d?Math.abs(entry-sl):null;
  return {valid:!!(d&&entry!=null&&sl!=null&&risk>0),direction:d,entry,sl,tp1,tp2,tp3,risk,
    origin:"PVT_CHART_CONFLUENCE_V1_01_NATIVE",
    nativeTarget:true,
    management:{beTriggerR:.50,beLockR:.05,trailTriggerR:1.0,trailDistanceR:.50,trailStepR:.10,maxHoldingBars:96,policy:"MQ5_SOURCE_OHLC_STOP_FIRST"}};
}
function pvtChart101Outcome(x){
  let out=String(x?.nativeOutcome||x?.status||"").toUpperCase();
  if(out==="TIME_FLAT")out="BE_ZERO";
  const d=parseDirection(x),entry=n(x?.entry),exit=n(x?.exitPrice),moveVal=d&&entry!=null&&exit!=null?move(d,entry,exit):null;
  const terminal=["TP3","TRAILING","BE_POSITIVE","SL","TIME_WIN","TIME_LOSS","GAP_LOSS","BE_ZERO"].includes(out);
  return {outcome:out||"PENDING",exitPrice:exit,exitTimeUTC:n(x?.exitTime)!=null?iso(n(x.exitTime)):null,
    exitRule:"PVT101_NATIVE_"+(out||"PENDING"),priceMove:moveVal,
    dataQuality:["PVT101_MQ5_SOURCE_OUTCOME_MODEL"],planOrigin:"PVT_CHART_CONFLUENCE_V1_01_NATIVE",
    management:pvtChart101Plan(x).management,terminal};
}
export function buildHistory(rawHistory=[],brokerBars=[],ctx={}){
  const tf=ctx.tf||"M5",mode=String(ctx.indicator||"105").toLowerCase(),resolved=ctx.resolved||ctx.requested||"";
  const offset=Number.isInteger(ctx.brokerServerUTCOffsetSeconds)?ctx.brokerServerUTCOffsetSeconds:0;
  const spec=ctx.spec||metadataFromCatalog({},ctx.requested,resolved);
  return (Array.isArray(rawHistory)?rawHistory:[]).map(x=>{
    const d=parseDirection(x),open=n(x.time),nativePVT101=mode==="pvtchart101",plan=nativePVT101?pvtChart101Plan(x):normalizedTradePlan(x,mode),entry=plan.entry,sl=plan.sl;
    const replaySignal={...x,tp1:plan.tp1,tp2:plan.tp2,tp3:plan.tp3,invalidation:plan.sl};
    const outcome=nativePVT101?pvtChart101Outcome(x):replayOutcome(replaySignal,brokerBars,tf,mode);
    const moveVal=n(outcome.priceMove),risk=plan.valid?plan.risk:null;
    const riskQuote=risk!=null?-risk:null;
    const priceUnit=spec.currencyProfit||(/XAU|XAG/i.test(resolved)?"USD quote":"SYMBOL QUOTE");
    const completed=VALID_OUTCOMES.has(outcome.outcome);
    const evidenceBase={recordMode:"HISTORICAL_SIM",symbolRequested:ctx.requested||resolved,symbolResolved:resolved,
      indicatorId:mode,indicatorVersion:ctx.indicatorVersion||mode,tf,
      triggerTF:ctx.triggerTF||tf,setupTF:ctx.setupTF||null,biasTF:ctx.biasTF||null,direction:d,
      signalCandleCloseUTC:n(x.closeTime)!=null?iso(n(x.closeTime)-offset):open!=null?iso(open+(TF_SECONDS[tf]||300)-offset):null,
      entry,originalSL:sl,tp1:plan.tp1,tp2:plan.tp2,tp3:plan.tp3,score:n(x.score)};
    const signalId=hmaclessHash(evidenceBase).slice(0,32);
    const rMultiple=completed&&moveVal!=null&&risk>0?snap(moveVal/risk):null;
    const signedPoints=moveVal!=null&&spec.point>0?snap(moveVal/spec.point,3):null;
    const signedPips=moveVal!=null&&spec.pipSize>0?snap(moveVal/spec.pipSize,3):null;
    const gross=grossEstimate(moveVal,spec);
    return {signalId,...evidenceBase,code:x.code||"",zone:x.zone||null,
      source:"VANTAGE_MT5_CANDLES",brokerServer:ctx.brokerServer||null,
      sourceBrokerBarEpoch:open,brokerServerUTCOffsetSeconds:offset,
      recordMode:"HISTORICAL_SIM",publishedAtUTC:null,capturedAtUTC:null,
      originalEngineStatus:x.status||null,originalEngineOutcome:n(x.outcome)??x.nativeOutcome??null,engineBuildHash:V8_ENGINE_BUILD,
      planOrigin:plan.origin,nativeTargetDefined:plan.nativeTarget===true,managementPlan:plan.management||null,
      nativePlan:{entry:n(x.entry),sl:n(x.invalidation),tp1:n(x.tp1),tp2:n(x.tp2),tp3:n(x.tp3)},
      reasons:Array.isArray(x.reasons)?x.reasons.filter(Boolean).map(String):[],
      pipSize:spec.pipSize,pipConvention:spec.pipConvention,point:spec.point,tickSize:spec.tickSize,
      tickValueProfit:spec.tickValueProfit,tickValueLoss:spec.tickValueLoss,contractSize:spec.contractSize,
      currencyProfit:spec.currencyProfit,volumeMin:spec.volumeMin,volumeStep:spec.volumeStep,
      lotExample:spec.lotExample,lotExampleSupported:spec.lotExampleSupported,
      outcome:outcome.outcome,status:outcome.outcome,exitPrice:outcome.exitPrice,
      exitTimeUTC:outcome.exitTimeUTC?new Date(Date.parse(outcome.exitTimeUTC)-offset*1000).toISOString():null,
      exitRule:outcome.exitRule,priceMove:moveVal,priceMoveUnit:priceUnit,
      signedPoints,signedPips,riskQuote,riskPoints:risk!=null&&spec.point>0?-snap(risk/spec.point,3):null,
      riskPips:risk!=null&&spec.pipSize>0?-snap(risk/spec.pipSize,3):null,
      grossPLUSD:gross,grossEstimateNote:gross!=null?"MODEL_GROSS_EXCLUDES_ALL_COSTS":spec.lotExampleSupported?"USD_CONVERSION_OR_CONTRACT_NOT_VERIFIED":"0.01_LOT_UNSUPPORTED_OR_METADATA_MISSING",
      netPLUSD:null,rMultiple,completed,positive:POSITIVE.has(outcome.outcome),negative:NEGATIVE.has(outcome.outcome),
      dataQuality:[...(outcome.dataQuality||[]),...(!nativePVT101&&plan.nativeTarget===false&&plan.valid?["NORMALIZED_TARGETS_1R_2R_3R_NOT_NATIVE_INDICATOR_TARGETS"]:[]),...(spec.metadataStatus==="BROKER_METADATA_INCOMPLETE"?["MISSING_CONTRACT_METADATA"]:[])],
      evidenceStatus:"BACKTEST_RECONSTRUCTED_NOT_FORWARD_PROOF",sourceUrl:null,newsContextId:null,
      disclaimer:"Historical reconstruction from currently available broker candles, not a contemporaneously published signal, executed trade, or profit guarantee."};
  });
}
const DEFAULT_TZ="Asia/Kuala_Lumpur";
function zonedDay(date,timezone=DEFAULT_TZ){
  if(!date)return null;
  const d=date instanceof Date?date:new Date(date);if(Number.isNaN(d.getTime()))return null;
  try{
    const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d).map(x=>[x.type,x.value]));
    return p.year+"-"+p.month+"-"+p.day;
  }catch{return d.toISOString().slice(0,10)}
}
function isoWeek(day){
  const d=new Date(day+"T00:00:00Z");
  d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
  const y=d.getUTCFullYear(),jan=new Date(Date.UTC(y,0,1));
  return y+"-W"+String(Math.ceil((((d-jan)/86400000)+1)/7)).padStart(2,"0");
}
export function periodKey(rec,period="month",timezone=DEFAULT_TZ){
  const day=zonedDay(rec.signalCandleCloseUTC,timezone);if(!day)return null;
  if(period==="day")return day;if(period==="week")return isoWeek(day);if(period==="year")return day.slice(0,4);
  return day.slice(0,7);
}
export function filterHistory(rows=[],f={}){
  return rows.filter(r=>{
    if(f.recordMode&&f.recordMode!=="ALL"&&r.recordMode!==f.recordMode)return false;
    if(f.indicator&&f.indicator!=="ALL"&&r.indicatorId!==String(f.indicator))return false;
    if(f.symbol&&f.symbol!=="ALL"&&r.symbolResolved!==f.symbol)return false;
    if(f.tf&&f.tf!=="ALL"&&r.tf!==f.tf)return false;
    if(f.direction&&f.direction!=="ALL"&&r.direction!==(f.direction==="BUY"?1:-1))return false;
    if(f.from&&(!r.signalCandleCloseUTC||zonedDay(r.signalCandleCloseUTC,f.timezone||DEFAULT_TZ)<f.from))return false;
    if(f.to&&(!r.signalCandleCloseUTC||zonedDay(r.signalCandleCloseUTC,f.timezone||DEFAULT_TZ)>f.to))return false;
    return true;
  });
}
export function aggregate(rows=[]){
  const sum=(arr,key)=>arr.reduce((a,x)=>a+(n(x[key])??0),0);
  const positives=rows.filter(x=>POSITIVE.has(x.outcome)&&n(x.priceMove)>0);
  const negatives=rows.filter(x=>NEGATIVE.has(x.outcome)&&n(x.priceMove)<0);
  const beZero=rows.filter(x=>x.outcome==="BE_ZERO");
  const pending=rows.filter(x=>x.outcome==="PENDING");
  const ambiguous=rows.filter(x=>x.outcome==="AMBIGUOUS");
  const validOnly=rows.filter(x=>x.outcome==="VALID_ONLY");
  const completed=positives.concat(negatives,beZero),totals=positives.concat(negatives);
  const signedR=totals.filter(x=>n(x.rMultiple)!=null),posR=positives.filter(x=>n(x.rMultiple)!=null),negR=negatives.filter(x=>n(x.rMultiple)!=null);
  const gross=totals.filter(x=>n(x.grossPLUSD)!=null);
  const outcomeCounts={};rows.forEach(x=>{const k=x.outcome||"UNKNOWN";outcomeCounts[k]=(outcomeCounts[k]||0)+1});
  const symbols=Array.from(new Set(rows.map(x=>x.symbolResolved).filter(Boolean)));
  const sideBreakdown=(key,sym)=>{
    const all=rows.filter(r=>r.symbolResolved===sym&&n(r[key])!=null),wins=all.filter(r=>Number(r[key])>0),losses=all.filter(r=>Number(r[key])<0);
    const winTotal=wins.length?snap(sum(wins,key),3):0,lossTotal=losses.length?snap(sum(losses,key),3):0,total=all.length?snap(sum(all,key),3):null;
    return {count:all.length,winCount:wins.length,lossCount:losses.length,winTotal,lossTotal,total,
      status:total==null?"N/A":total>0?"PROFIT":total<0?"LOSS":"FLAT"};
  };
  return {totalSignals:rows.length,completed:completed.length,positive:positives.length,negative:negatives.length,beZero:beZero.length,
    pending:pending.length,ambiguous:ambiguous.length,validOnly:validOnly.length,outcomes:outcomeCounts,
    strictWinRate:totals.length?100*positives.length/totals.length:null,
    strictDenominator:totals.length,legacyWinRate:(totals.length+beZero.length)?100*(positives.length+beZero.length)/(totals.length+beZero.length):null,
    totalR:signedR.length?snap(sum(signedR,"rMultiple"),4):null,rCoverage:signedR.length,
    winR:posR.length?snap(sum(posR,"rMultiple"),4):0,lossR:negR.length?snap(sum(negR,"rMultiple"),4):0,
    grossPLUSD:gross.length?snap(sum(gross,"grossPLUSD")):null,grossCoverage:gross.length,
    priceUnitMix:Array.from(new Set(rows.filter(x=>x.completed).map(x=>x.symbolResolved))),
    pipsBySymbol:Object.fromEntries(symbols.map(sym=>[sym,sideBreakdown("signedPips",sym)])),
    pointsBySymbol:Object.fromEntries(symbols.map(sym=>[sym,sideBreakdown("signedPoints",sym)]))};
}
export function groupHistory(rows=[],period="month"){
  const m=new Map();
  for(const r of rows){const key=periodKey(r,period);if(!key)continue;if(!m.has(key))m.set(key,[]);m.get(key).push(r)}
  return [...m].sort((a,b)=>a[0].localeCompare(b[0])).map(([periodKey,records])=>({period:periodKey,...aggregate(records)}));
}
export function compareMonths(rows=[],now=new Date(),timezone=DEFAULT_TZ){
  const local=zonedDay(now,timezone);if(!local)return null;
  const y=Number(local.slice(0,4)),m=Number(local.slice(5,7)),day=Number(local.slice(8,10));
  const current=local.slice(0,7),prevDate=new Date(Date.UTC(y,m-2,1)),previous=prevDate.toISOString().slice(0,7);
  const prevLast=new Date(Date.UTC(prevDate.getUTCFullYear(),prevDate.getUTCMonth()+1,0)).getUTCDate();
  const sameDay=String(Math.min(day,prevLast)).padStart(2,"0");
  const thisMonth=rows.filter(r=>periodKey(r,"month",timezone)===current);
  const lastMonth=rows.filter(r=>periodKey(r,"month",timezone)===previous);
  const matched=lastMonth.filter(r=>(zonedDay(r.signalCandleCloseUTC,timezone)||"").slice(8,10)<=sameDay);
  return {timezone,current:{period:current,label:"MONTH_TO_DATE",...aggregate(thisMonth)},
    previous:{period:previous,label:"FULL_CALENDAR_MONTH",...aggregate(lastMonth)},
    previousMatched:{period:previous,label:"MATCHED_DAYS_TO_DATE",throughDay:sameDay,...aggregate(matched)},
    note:"Comparisons reflect only the available broker candle window and selected indicator, not an all-time complete audited ledger."};
}
export function evidenceForRecord(rec,bars=[]){
  if(!rec)return null;
  const t=rec.signalCandleCloseUTC?Math.floor(Date.parse(rec.signalCandleCloseUTC)/1000):null;
  const s=TF_SECONDS[rec.tf]||300;
  const around=(bars||[]).filter(x=>n(x.t)!=null&&t!=null&&x.t>=t-45*s&&x.t<=t+25*s)
    .map(b=>({t:n(b.t),o:n(b.o),h:n(b.h),l:n(b.l),c:n(b.c),v:n(b.v)}));
  const audit={signalId:rec.signalId,recordMode:rec.recordMode,signalCandleCloseUTC:rec.signalCandleCloseUTC,
    publishedAtUTC:null,source:rec.source,indicatorId:rec.indicatorId,engineBuildHash:rec.engineBuildHash,
    tradePlan:{direction:rec.direction,entry:rec.entry,sl:rec.originalSL,tp1:rec.tp1,tp2:rec.tp2,tp3:rec.tp3,planOrigin:rec.planOrigin,managementPlan:rec.managementPlan},
    result:{outcome:rec.outcome,exitPrice:rec.exitPrice,exitTimeUTC:rec.exitTimeUTC,exitRule:rec.exitRule},
    archived:false,ohlc:around};
  return {recordMode:"HISTORICAL_SIM",verification:"NOT_FORWARD_VERIFIED",snapshotKind:"RENDERED_FROM_CURRENT_BROKER_CANDLES",
    evidenceHash:hmaclessHash(audit),hashScope:"CURRENT_RESPONSE_RECONSTRUCTION_ONLY",
    capturedAtUTC:new Date().toISOString(),publishedAtUTC:null,signalId:rec.signalId,
    signal:rec,ohlc:around,audit,
    disclaimer:"SHA-256 covers this reconstructed API payload. It is NOT evidence that the signal or candles were published and stored before subsequent price movement."};
}
export function explainRecord(r){
  if(!r)return null;
  const side=r.direction>0?"BUY":"SELL",cause=(r.reasons||[]).join("; ")||"Closed-candle condition";
  const risk=n(r.riskQuote)!=null?Math.abs(r.riskQuote).toFixed(4):"unknown";
  const result=r.outcome==="VALID_ONLY"?"Confirmation only: no TP/SL outcome defined.":r.outcome==="AMBIGUOUS"?"Both target and stop were touched in one candle; sequence cannot be verified.":r.outcome==="PENDING"?"Exit not resolved in the available closed candle window.":r.outcome+" at "+r.exitPrice;
  return {kind:"RULE_BASED_EXPLANATION_NOT_GENERATIVE_AI",headline:side+" "+r.symbolResolved+" "+r.tf,
    sections:[{label:"Structure and trigger",text:"The "+side+" research setup was reconstructed after candle close using: "+cause+"."},
    {label:"Trade plan",text:"Entry "+r.entry+", SL "+r.originalSL+", TP1 "+r.tp1+", TP2 "+r.tp2+", TP3 "+r.tp3+". Risk distance "+risk+" quote-price units. Plan source: "+(r.planOrigin||"N/A")+". BE/Trailing management: "+(r.managementPlan?("BE at +"+r.managementPlan.beTriggerR+"R; lock +"+r.managementPlan.beLockR+"R; trail from +"+r.managementPlan.trailTriggerR+"R by "+r.managementPlan.trailDistanceR+"R"+(r.managementPlan.trailStepR!=null?"; step "+r.managementPlan.trailStepR+"R":"")+"."):"N/A")},
    {label:"Replay result",text:result+" The result is historical simulation, not an executed trade."},
    {label:"Risk",text:"OHLC history cannot prove intra-candle order, fill quality or contemporaneous signal publication. Spread, swaps, slippage and fees are not included."}],
    newsContext:"No contemporaneous macro release is linked to this reconstructed signal. Latest Macro Regime is not a valid retrospective explanation unless it was already published at the signal time."};
}
export const DISCLAIMER="GoldFlow is market research and education, not a trade instruction. Historical simulations are not executed trades or contemporaneously published signals. Gross example P/L excludes costs; no guarantee of future results.";
