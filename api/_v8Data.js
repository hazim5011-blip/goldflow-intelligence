import analyzeHandler from "./analyze.js";
import {brokerGet,vantageBrokerUtcOffsetSeconds} from "./_broker.js";
import {buildHistory,metadataFromCatalog,filterHistory,aggregate,groupHistory,compareMonths,evidenceForRecord,explainRecord,DISCLAIMER} from "./_v8Core.js";
import {buildGFHistoricalSignals} from "./_gfHistoryAdapters.js";

const TF_ALLOWED=new Set(["M1","M5","M15","M30","H1","H4","D1"]);
const MODES=new Set(["105","103","pvt","pvt102","pvtchart101","pattern132","snd107","owl101","fund104","gf-ai","gf-news","gf-study"]);
const GF_MODES=new Set(["gf-ai","gf-news","gf-study"]);
const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
const AI_FRAMES=["M1","M5","M15","M30","H1","H4","D1"];

function fakeResponse(){
  let payload=null,code=200;
  const res={setHeader(){return res},status(n){code=n;return res},json(x){payload=x;return res},end(){return res}};
  return {res,result:()=>({payload,code})};
}
function validSymbol(x){return /^[A-Za-z0-9._#-]{1,42}$/.test(String(x||""))}
function gfFrameLimit(frame,selected,mode){
  const base=mode==="gf-ai"?72:90,fs=TF_SECONDS[frame]||60,ss=TF_SECONDS[selected]||300;
  const required=Math.ceil(base*ss/fs)+140;
  return Math.max(frame===selected?220:180,Math.min(5000,required));
}
function gfVersion(indicator){
  return indicator==="gf-ai"?"GF_AI_ADAPTIVE_ENTRY_INTELLIGENCE_V9":
    indicator==="gf-news"?"GF_NEWS_IMPACT_PRO_FORWARD_ARCHIVE":
    "GF_MARKET_STRUCTURE_SCENARIO_V2";
}
async function fetchGFContext({symbol,tf,indicator}){
  const frames=indicator==="gf-ai"?AI_FRAMES:[...new Set([tf,"H1","H4"])];
  const offset=vantageBrokerUtcOffsetSeconds();
  if(offset===null)throw new Error("BROKER_UTC_OFFSET_UNVERIFIED");
  const [bridge,catalog]=await Promise.all([
    brokerGet("/multi-bars",{symbol,tfs:frames.join(","),limits:frames.map(x=>gfFrameLimit(x,tf,indicator)).join(",")},22000,2),
    brokerGet("/catalog",{filter:symbol,limit:120},13000,1).catch(()=>null)
  ]);
  if(!bridge?.ok)throw new Error("BROKER_GF_HISTORY_NOT_READY");
  const requested=symbol,resolved=bridge.symbol||symbol,candidates=Array.isArray(catalog?.symbols)?catalog.symbols:[],
    matched=candidates.find(x=>x.name===resolved)||candidates.find(x=>x.name?.toUpperCase()===resolved.toUpperCase()),
    spec=metadataFromCatalog(matched||{point:bridge.point,digits:bridge.digits},requested,resolved),
    barWindow=Array.isArray(bridge.frames?.[tf])?bridge.frames[tf]:[];
  if(barWindow.length<20)throw new Error("INSUFFICIENT_GF_HISTORY_BARS");
  const replay=buildGFHistoricalSignals({mode:indicator,symbol:resolved,tf,frames:bridge.frames||{},offsetSeconds:offset,maxCandidates:indicator==="gf-ai"?72:100});
  const rows=buildHistory(replay.rawHistory,barWindow,{requested,resolved,tf,indicator,spec,indicatorVersion:gfVersion(indicator),
    triggerTF:tf,setupTF:tf,biasTF:indicator==="gf-ai"?"ALL_TF":"H1_H4",brokerServer:bridge.server||catalog?.server||null,brokerServerUTCOffsetSeconds:offset});
  const closed=barWindow.slice(0,-1);
  return {symbolRequested:requested,symbolResolved:resolved,broker:bridge.broker||"Vantage",brokerServer:bridge.server||catalog?.server||null,
    marketState:"MT5_HISTORY",indicator,tf,profile:indicator==="gf-ai"?"M1_D1_OWN_ENGINE_REPLAY":indicator==="gf-study"?"STRUCTURE_OWN_ENGINE_REPLAY":"FORWARD_NEWS_MACRO_ONLY",
    historyMode:replay.historyMode,historyNote:replay.historyNote,rows,spec,brokerBars:barWindow,
    dataWindow:{startUTC:closed[0]?.t?new Date((closed[0].t-offset)*1000).toISOString():null,
      endUTC:closed.at(-1)?.t?new Date((closed.at(-1).t-offset)*1000).toISOString():null,
      brokerServerUTCOffsetSeconds:offset,timeBasis:"BROKER_SERVER_EPOCH_NORMALIZED_TO_UTC",
      availableClosedCandles:closed.length,historyLimitedToAvailableBars:true},
    capturedAtUTC:new Date().toISOString(),
    warning:indicator==="gf-news"?
      "GF-News historical outcomes are forward-only because historical verified macro/news snapshots were not archived. No current macro is backfilled into old candles.":
      "GF history is a closed-candle reconstruction of the selected GF engine using Vantage MT5 bars and next-bar-open entry validation; it is not forward publication or broker execution proof."};
}
export async function fetchV8Context(query={}){
  const symbol=String(query.symbol||"XAUUSD").trim();
  const tf=String(query.tf||"M5").toUpperCase();
  const indicator=String(query.indicator||"105").toLowerCase();
  if(!validSymbol(symbol))throw new Error("INVALID_SYMBOL");
  if(!TF_ALLOWED.has(tf))throw new Error("INVALID_TIMEFRAME");
  if(!MODES.has(indicator))throw new Error("INVALID_INDICATOR");
  if(GF_MODES.has(indicator))return fetchGFContext({symbol,tf,indicator});
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
  const brokerServerUTCOffsetSeconds=vantageBrokerUtcOffsetSeconds();
  if(brokerServerUTCOffsetSeconds===null)throw new Error("BROKER_UTC_OFFSET_UNVERIFIED");
  const rows=buildHistory(raw,barWindow,{requested,resolved,tf,indicator,spec,
    indicatorVersion:payload.indicator?.engine||indicator,triggerTF:payload.triggerTF||tf,
    setupTF:payload.setupTF||null,biasTF:payload.biasTF||null,brokerServer,brokerServerUTCOffsetSeconds});
  return {symbolRequested:requested,symbolResolved:resolved,broker:payload.broker||"Vantage",brokerServer,marketState:payload.marketState||"UNKNOWN",
    indicator,tf,profile:payload.indicator?.profile||null,
    historyMode:"HISTORICAL_SIM",rows,spec,
    brokerBars:barWindow,
    dataWindow:{startUTC:closed[0]?.t?new Date((closed[0].t-brokerServerUTCOffsetSeconds)*1000).toISOString():null,
      endUTC:closed.at(-1)?.t?new Date((closed.at(-1).t-brokerServerUTCOffsetSeconds)*1000).toISOString():null,
      brokerServerUTCOffsetSeconds,timeBasis:"BROKER_SERVER_EPOCH_NORMALIZED_TO_UTC",
      availableClosedCandles:closed.length,historyLimitedToAvailableBars:true},
    capturedAtUTC:new Date().toISOString(),
    warning:"This is a reconstruction from currently accessible Vantage MT5 closed candles. It is not a forward-logged publication or executed-trade statement."};
}
export {filterHistory,aggregate,groupHistory,compareMonths,evidenceForRecord,explainRecord,DISCLAIMER};
