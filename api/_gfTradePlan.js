import {UNIVERSAL_MANAGEMENT} from "./_dynamicTradeManagement.js";
const N=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const rnd=(v,d=10)=>N(v)==null?null:Number(Number(v).toFixed(d));
const side=d=>d>0?"BUY":d<0?"SELL":"NEUTRAL";

export const GF_HISTORY_MANAGEMENT=UNIVERSAL_MANAGEMENT;

function origin(mode){
  return mode==="gf-ai"?"GF_AI_V1_60_NATIVE_MARKET_PLAN":
    mode==="gf-news"?"GF_NEWS_NATIVE_TECHNICAL_MACRO_PLAN":
    mode==="gf-study"?"GF_MARKET_STUDY_NATIVE_STRUCTURE_PLAN":"GF_NATIVE_PLAN";
}

export function extractGFTradePlan(output={},mode="gf-ai"){
  const p=output?.confirmation||output?.candidatePlan||null;
  const d=Number(p?.direction??output?.direction);
  if(!p||![1,-1].includes(d))return {valid:false,reason:"NO_DIRECTIONAL_PLAN",direction:[1,-1].includes(d)?d:0};
  const low=N(p.entryLow),high=N(p.entryHigh),sl=N(p.invalidation),tp1=N(p.tp1),tp2=N(p.tp2),tp3=N(p.tp3);
  if(low==null||high==null||sl==null||tp1==null||tp2==null||tp3==null||!(high>low))
    return {valid:false,reason:"MISSING_ENTRY_SL_OR_TP",direction:d,entryLow:low,entryHigh:high,sl,tp1,tp2,tp3};
  const quote=N(output?.entryQuote),mid=(low+high)/2;
  const entry=quote!=null&&quote>=low&&quote<=high?quote:mid;
  const risk=d*(entry-sl);
  const targetOk=d*(tp1-entry)>0&&d*(tp2-tp1)>0&&d*(tp3-tp2)>0;
  if(!(risk>0)||!targetOk)return {valid:false,reason:"INVALID_TRADE_PLAN_GEOMETRY",direction:d,entryLow:low,entryHigh:high,entry,sl,tp1,tp2,tp3};
  return {
    valid:true,direction:d,side:side(d),entryLow:rnd(low),entryHigh:rnd(high),entry:rnd(entry),
    sl:rnd(sl),tp1:rnd(tp1),tp2:rnd(tp2),tp3:rnd(tp3),risk:rnd(risk),
    score:N(p.score??output?.analysis?.directionScore),confirmationType:p.confirmationType||null,
    signalCandleTime:N(p.signalCandleTime),confirmationCloseUTC:p.confirmationCloseUTC||output?.closedAtUTC||null,
    entryMethod:p.entryMethod||null,targetMethod:p.targetMethod||null,
    origin:origin(mode),management:{...GF_HISTORY_MANAGEMENT},
    reasons:Array.isArray(p.explanation)?p.explanation.filter(Boolean).map(String):
      [output?.reason,p.confirmationType,p.entryMethod].filter(Boolean).map(String)
  };
}

export function enforceGFTradePlan(output={},mode="gf-ai"){
  const tradePlan=extractGFTradePlan(output,mode);
  const entryReady=output?.canEnter===true||/_ENTRY_READY$/.test(String(output?.status||""));
  if(entryReady&&!tradePlan.valid){
    return {...output,canEnter:false,status:"WAIT_TRADE_PLAN_INCOMPLETE",
      reason:"Directional entry blocked because complete ENTRY + SL + TP1 + TP2 + TP3 geometry is not available.",
      tradePlan};
  }
  return {...output,tradePlan};
}
