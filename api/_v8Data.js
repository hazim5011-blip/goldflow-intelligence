import analyzeHandler from "./analyze.js";
import {brokerGet} from "./_broker.js";
import {buildHistory,metadataFromCatalog,filterHistory,aggregate,groupHistory,compareMonths,evidenceForRecord,explainRecord,DISCLAIMER} from "./_v8Core.js";

const TF_ALLOWED=new Set(["M1","M5","M15","M30","H1","H4","D1"]);
const MODES=new Set(["105","103","pvt","pvt102","pattern132","snd107","owl101"]);
function fakeResponse(){
  let payload=null,code=200;
  const res={setHeader(){return res},status(n){code=n;return res},json(x){payload=x;return res},end(){return res}};
  return {res,result:()=>({payload,code})};
}
function validSymbol(x){return /^[A-Za-z0-9._#-]{1,42}$/.test(String(x||""))}
export async function fetchV8Context(query={}){
  const symbol=String(query.symbol||"XAUUSD").trim();
  const tf=String(query.tf||"M5").toUpperCase();
  const indicator=String(query.indicator||"105").toLowerCase();
  if(!validSymbol(symbol))throw new Error("INVALID_SYMBOL");
  if(!TF_ALLOWED.has(tf))throw new Error("INVALID_TIMEFRAME");
  if(!MODES.has(indicator))throw new Error("INVALID_INDICATOR");
  const mock=fakeResponse();
  const catalogPromise=brokerGet("/catalog",{filter:symbol,limit:120},13000,1).catch(()=>null);
  await analyzeHandler({method:"GET",query:{symbol,tf,indicator,history:"1"}},mock.res);
  const {payload,code}=mock.result();
  if(code>=400||!payload?.ok||!payload?.ready)throw new Error(payload?.error||"BROKER_ANALYSIS_NOT_READY");
  const catalog=await catalogPromise;
  const requested=payload.requested||symbol,resolved=payload.symbol||symbol;
  const candidates=Array.isArray(catalog?.symbols)?catalog.symbols:[];
  const matched=candidates.find(x=>x.name===resolved)||candidates.find(x=>x.name?.toUpperCase()===resolved.toUpperCase());
  const spec=metadataFromCatalog(matched||{point:payload.point,digits:payload.digits},requested,resolved);
  const barWindow=Array.isArray(payload.historyBars)?payload.historyBars:payload.chartBars||[];
  const closed=barWindow.slice(0,-1);
  const raw=payload.indicator?.history||[];
  const brokerServer=catalog?.server||null;
  const rows=buildHistory(raw,barWindow,{requested,resolved,tf,indicator,spec,
    indicatorVersion:payload.indicator?.engine||indicator,triggerTF:payload.triggerTF||tf,
    setupTF:payload.setupTF||null,biasTF:payload.biasTF||null,brokerServer});
  return {symbolRequested:requested,symbolResolved:resolved,broker:payload.broker||"Vantage",brokerServer,marketState:payload.marketState||"UNKNOWN",
    indicator,tf,profile:payload.indicator?.profile||null,
    historyMode:"HISTORICAL_SIM",rows,spec,
    brokerBars:barWindow,
    dataWindow:{startUTC:closed[0]?.t?new Date(closed[0].t*1000).toISOString():null,
      endUTC:closed.at(-1)?.t?new Date(closed.at(-1).t*1000).toISOString():null,
      availableClosedCandles:closed.length,historyLimitedToAvailableBars:true},
    capturedAtUTC:new Date().toISOString(),
    warning:"This is a reconstruction from currently accessible Vantage MT5 closed candles. It is not a forward-logged publication or executed-trade statement."};
}
export {filterHistory,aggregate,groupHistory,compareMonths,evidenceForRecord,explainRecord,DISCLAIMER};