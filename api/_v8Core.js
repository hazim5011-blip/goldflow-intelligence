import {createHash} from "node:crypto";

export const V8_ENGINE_BUILD="v8.0.0-closed-candle-reconstruction";
export const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
const VALID_OUTCOMES=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE","BE_ZERO","SL"]);
const POSITIVE=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE"]);
const NEGATIVE=new Set(["SL"]);
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
export function replayOutcome(signal,bars=[],tf="M5",mode="105"){
  const d=parseDirection(signal),entry=n(signal.entry),stop=n(signal.invalidation??signal.originalSL),tp=n(signal.tp1);
  const signalOpen=n(signal.time),close=n(signal.closeTime)??(signalOpen!=null?signalOpen+(TF_SECONDS[tf]||300):null);
  const isValidation=["pattern132","snd107","pattern","snd"].includes(String(mode).toLowerCase());
  const blank={exitPrice:null,exitTimeUTC:null,exitRule:null,priceMove:null,outcome:"PENDING",dataQuality:[],replayRule:"OHLC conservative; last forming candle excluded"};
  if(isValidation||tp==null) return {...blank,outcome:"VALID_ONLY",dataQuality:["NO_DEFINED_EXIT_MODEL"]};
  if(!d||entry==null||stop==null||signalOpen==null||close==null) return {...blank,outcome:"INVALID",dataQuality:["INVALID_SIGNAL_FIELDS"]};
  const risk=Math.abs(entry-stop);
  if(!(risk>0)||move(d,entry,stop)>=0||move(d,entry,tp)<=0)return {...blank,outcome:"INVALID",dataQuality:["INVALID_SL_OR_TP_DIRECTION"]};
  const closed=Array.isArray(bars)?bars.slice(0,-1).map(x=>({t:n(x.t??x.time),o:n(x.o??x.open),h:n(x.h??x.high),l:n(x.l??x.low),c:n(x.c??x.close)})).filter(x=>x.t!=null&&x.o!=null&&x.h!=null&&x.l!=null&&x.c!=null&&x.h>=x.l&&x.t>=close).sort((a,b)=>a.t-b.t):[];
  if(!closed.length)return {...blank,outcome:"PENDING",dataQuality:["NO_CLOSED_FUTURE_BARS_IN_WINDOW"]};
  let activeStop=stop,best=entry,source="SL";
  const managed=String(mode)==="105"||String(mode)==="1.05";
  for(const b of closed){
    const hitStop=touchStop(b,d,activeStop),hitTP=touchTarget(b,d,tp);
    if(hitStop&&hitTP)return {...blank,outcome:"AMBIGUOUS",exitTimeUTC:iso(b.t),exitRule:"TP_AND_STOP_SAME_CANDLE",dataQuality:["INTRABAR_ORDER_UNKNOWN"]};
    if(hitStop){
      const exit=stoppedAt(b,d,activeStop),p=move(d,entry,exit);
      let outcome=source==="SL"?"SL":p>1e-10?source==="TRAILING"?"TRAILING":"BE_POSITIVE":Math.abs(p)<=1e-10?"BE_ZERO":"SL";
      return {...blank,outcome,exitPrice:exit,exitTimeUTC:iso(b.t),priceMove:p,exitRule:source==="SL"?"ORIGINAL_SL_WITH_GAP_RULE":source+"_STOP_WITH_GAP_RULE",dataQuality:[]};
    }
    if(hitTP){
      return {...blank,outcome:"TP1",exitPrice:tp,exitTimeUTC:iso(b.t),priceMove:move(d,entry,tp),exitRule:"FIRST_TP_TARGET",dataQuality:[]};
    }
    if(managed){
      best=d>0?Math.max(best,b.h):Math.min(best,b.l);
      const rr=move(d,entry,best)/risk;
      if(rr>=.5){const lock=entry+d*.05*risk;if(move(d,activeStop,lock)>0){activeStop=lock;source="BE"}}
      if(rr>=.75){const trail=d>0?best-.35*risk:best+.35*risk;if(move(d,activeStop,trail)>0){activeStop=trail;source="TRAILING"}}
    }
  }
  return {...blank,outcome:"PENDING",dataQuality:["EXIT_NOT_YET_IN_AVAILABLE_CLOSED_BARS"]};
}
function grossEstimate(m,spec){
  if(!spec?.grossEstimateAvailable||n(m)==null)return null;
  // Only use broker catalog contract size for linear contracts quoted and settled in USD.
  return snap(m*spec.contractSize*spec.lotExample);
}
export function buildHistory(rawHistory=[],brokerBars=[],ctx={}){
  const tf=ctx.tf||"M5",mode=String(ctx.indicator||"105").toLowerCase(),resolved=ctx.resolved||ctx.requested||"";
  const spec=ctx.spec||metadataFromCatalog({},ctx.requested,resolved);
  return (Array.isArray(rawHistory)?rawHistory:[]).map(x=>{
    const d=parseDirection(x),open=n(x.time),entry=n(x.entry),sl=n(x.invalidation);
    const outcome=replayOutcome(x,brokerBars,tf,mode);
    const moveVal=n(outcome.priceMove),risk=entry!=null&&sl!=null&&d?Math.abs(entry-sl):null;
    const riskQuote=risk!=null?-risk:null;
    const priceUnit=spec.currencyProfit||(/XAU|XAG/i.test(resolved)?"USD quote":"SYMBOL QUOTE");
    const completed=VALID_OUTCOMES.has(outcome.outcome);
    const evidenceBase={recordMode:"HISTORICAL_SIM",symbolRequested:ctx.requested||resolved,symbolResolved:resolved,
      indicatorId:mode,indicatorVersion:ctx.indicatorVersion||mode,tf,direction:d,
      signalCandleCloseUTC:n(x.closeTime)!=null?iso(x.closeTime):open!=null?iso(open+(TF_SECONDS[tf]||300)):null,
      entry,originalSL:sl,tp1:n(x.tp1),tp2:n(x.tp2),tp3:n(x.tp3),score:n(x.score)};
    const signalId=hmaclessHash(evidenceBase).slice(0,32);
    const rMultiple=completed&&moveVal!=null&&risk>0?snap(moveVal/risk):null;
    const signedPoints=moveVal!=null&&spec.point>0?snap(moveVal/spec.point,3):null;
    const signedPips=moveVal!=null&&spec.pipSize>0?snap(moveVal/spec.pipSize,3):null;
    const gross=grossEstimate(moveVal,spec);
    return {signalId,...evidenceBase,code:x.code||"",zone:x.zone||null,
      source:"VANTAGE_MT5_CANDLES",brokerServer:ctx.brokerServer||null,
      recordMode:"HISTORICAL_SIM",publishedAtUTC:null,capturedAtUTC:null,
      originalEngineStatus:x.status||null,originalEngineOutcome:n(x.outcome),engineBuildHash:V8_ENGINE_BUILD,
      reasons:Array.isArray(x.reasons)?x.reasons.filter(Boolean).map(String):[],
      pipSize:spec.pipSize,pipConvention:spec.pipConvention,point:spec.point,tickSize:spec.tickSize,
      tickValueProfit:spec.tickValueProfit,tickValueLoss:spec.tickValueLoss,contractSize:spec.contractSize,
      currencyProfit:spec.currencyProfit,volumeMin:spec.volumeMin,volumeStep:spec.volumeStep,
      lotExample:spec.lotExample,lotExampleSupported:spec.lotExampleSupported,
      outcome:outcome.outcome,status:outcome.outcome,exitPrice:outcome.exitPrice,exitTimeUTC:outcome.exitTimeUTC,
      exitRule:outcome.exitRule,priceMove:moveVal,priceMoveUnit:priceUnit,
      signedPoints,signedPips,riskQuote,riskPoints:risk!=null&&spec.point>0?-snap(risk/spec.point,3):null,
      riskPips:risk!=null&&spec.pipSize>0?-snap(risk/spec.pipSize,3):null,
      grossPLUSD:gross,grossEstimateNote:gross!=null?"MODEL_GROSS_EXCLUDES_ALL_COSTS":spec.lotExampleSupported?"USD_CONVERSION_OR_CONTRACT_NOT_VERIFIED":"0.01_LOT_UNSUPPORTED_OR_METADATA_MISSING",
      netPLUSD:null,rMultiple,completed,positive:POSITIVE.has(outcome.outcome),negative:NEGATIVE.has(outcome.outcome),
      dataQuality:[...(outcome.dataQuality||[]),...(spec.metadataStatus==="BROKER_METADATA_INCOMPLETE"?["MISSING_CONTRACT_METADATA"]:[])],
      evidenceStatus:"BACKTEST_RECONSTRUCTED_NOT_FORWARD_PROOF",sourceUrl:null,newsContextId:null,
      disclaimer:"Historical reconstruction from currently available broker candles, not a contemporaneously published signal, executed trade, or profit guarantee."};
  });
}
function utcDate(record){return record.signalCandleCloseUTC?new Date(record.signalCandleCloseUTC):null}
function isoWeek(d){
  const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));
  x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));
  const y=x.getUTCFullYear(),jan=new Date(Date.UTC(y,0,1));
  return y+"-W"+String(Math.ceil((((x-jan)/86400000)+1)/7)).padStart(2,"0");
}
export function periodKey(rec,period="month"){const d=utcDate(rec);if(!d||Number.isNaN(d.getTime()))return null;
  const isoDay=d.toISOString().slice(0,10);
  if(period==="day")return isoDay;if(period==="week")return isoWeek(d);if(period==="year")return isoDay.slice(0,4);
  return isoDay.slice(0,7);
}
export function filterHistory(rows=[],f={}){
  return rows.filter(r=>{
    if(f.recordMode&&f.recordMode!=="ALL"&&r.recordMode!==f.recordMode)return false;
    if(f.indicator&&f.indicator!=="ALL"&&r.indicatorId!==String(f.indicator))return false;
    if(f.symbol&&f.symbol!=="ALL"&&r.symbolResolved!==f.symbol)return false;
    if(f.tf&&f.tf!=="ALL"&&r.tf!==f.tf)return false;
    if(f.direction&&f.direction!=="ALL"&&r.direction!==(f.direction==="BUY"?1:-1))return false;
    if(f.from&&(!r.signalCandleCloseUTC||r.signalCandleCloseUTC.slice(0,10)<f.from))return false;
    if(f.to&&(!r.signalCandleCloseUTC||r.signalCandleCloseUTC.slice(0,10)>f.to))return false;
    return true;
  });
}
export function aggregate(rows=[]){
  const sum=(arr,key)=>arr.reduce((a,x)=>a+n(x[key]),0);
  const positives=rows.filter(x=>POSITIVE.has(x.outcome)&&n(x.priceMove)>0);
  const negatives=rows.filter(x=>NEGATIVE.has(x.outcome)&&n(x.priceMove)<0);
  const beZero=rows.filter(x=>x.outcome==="BE_ZERO");
  const pending=rows.filter(x=>x.outcome==="PENDING");
  const ambiguous=rows.filter(x=>x.outcome==="AMBIGUOUS");
  const validOnly=rows.filter(x=>x.outcome==="VALID_ONLY");
  const completed=positives.concat(negatives,beZero);
  const totals=positives.concat(negatives);
  const signedR=totals.filter(x=>n(x.rMultiple)!=null);
  const gross=totals.filter(x=>n(x.grossPLUSD)!=null);
  const outcomeCounts={};
  rows.forEach(x=>{const k=x.outcome||"UNKNOWN";outcomeCounts[k]=(outcomeCounts[k]||0)+1});
  return {totalSignals:rows.length,completed:completed.length,positive:positives.length,negative:negatives.length,beZero:beZero.length,
    pending:pending.length,ambiguous:ambiguous.length,validOnly:validOnly.length,outcomes:outcomeCounts,
    strictWinRate:totals.length?100*positives.length/totals.length:null,
    strictDenominator:totals.length,legacyWinRate:(totals.length+beZero.length)?100*(positives.length+beZero.length)/(totals.length+beZero.length):null,
    totalR:signedR.length?snap(sum(signedR,"rMultiple"),4):null,rCoverage:signedR.length,
    grossPLUSD:gross.length?snap(sum(gross,"grossPLUSD")):null,grossCoverage:gross.length,
    // Pips and points are not summed across unrelated assets: group these separately.
    priceUnitMix:Array.from(new Set(rows.filter(x=>x.completed).map(x=>x.symbolResolved))),
    pipsBySymbol:Object.fromEntries(Array.from(new Set(rows.map(x=>x.symbolResolved))).map(sym=>{
      const x=rows.filter(r=>r.symbolResolved===sym&&n(r.signedPips)!=null);return [sym,{count:x.length,total:x.length?snap(sum(x,"signedPips"),3):null}];
    })),
    pointsBySymbol:Object.fromEntries(Array.from(new Set(rows.map(x=>x.symbolResolved))).map(sym=>{
      const x=rows.filter(r=>r.symbolResolved===sym&&n(r.signedPoints)!=null);return [sym,{count:x.length,total:x.length?snap(sum(x,"signedPoints"),3):null}];
    }))};
}
export function groupHistory(rows=[],period="month"){
  const m=new Map();
  for(const r of rows){const key=periodKey(r,period);if(!key)continue;if(!m.has(key))m.set(key,[]);m.get(key).push(r)}
  return [...m].sort((a,b)=>a[0].localeCompare(b[0])).map(([periodKey,records])=>({period:periodKey,...aggregate(records)}));
}
export function compareMonths(rows=[],now=new Date()){
  const current=now.toISOString().slice(0,7),prevDate=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-1,1));
  const previous=prevDate.toISOString().slice(0,7),day=now.getUTCDate();
  const prevLast=new Date(Date.UTC(prevDate.getUTCFullYear(),prevDate.getUTCMonth()+1,0)).getUTCDate();
  const sameDay=String(Math.min(day,prevLast)).padStart(2,"0");
  const thisMonth=rows.filter(r=>periodKey(r,"month")===current);
  const lastMonth=rows.filter(r=>periodKey(r,"month")===previous);
  const matched=lastMonth.filter(r=>r.signalCandleCloseUTC?.slice(8,10)<=sameDay);
  return {current:{period:current,label:"MONTH_TO_DATE",...aggregate(thisMonth)},
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
    tradePlan:{direction:rec.direction,entry:rec.entry,sl:rec.originalSL,tp1:rec.tp1,tp2:rec.tp2,tp3:rec.tp3},
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
    {label:"Trade plan",text:"Entry "+r.entry+", original SL "+r.originalSL+", target 1 "+r.tp1+". Risk distance "+risk+" quote-price units."},
    {label:"Replay result",text:result+" The result is historical simulation, not an executed trade."},
    {label:"Risk",text:"OHLC history cannot prove intra-candle order, fill quality or contemporaneous signal publication. Spread, swaps, slippage and fees are not included."}],
    newsContext:"No contemporaneous macro release is linked to this reconstructed signal. Latest Macro Regime is not a valid retrospective explanation unless it was already published at the signal time."};
}
export const DISCLAIMER="GoldFlow is market research and education, not a trade instruction. Historical simulations are not executed trades or contemporaneously published signals. Gross example P/L excludes costs; no guarantee of future results.";
