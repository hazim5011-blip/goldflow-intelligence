import analyzeHandler from "./analyze.js";
import macroHandler from "./macro.js";
import {buildSmartFeatures,assessDataHealth,isGoldSymbol} from "./_sqFeatures.js";
import {classifySmartRegime} from "./_sqRegime.js";
import {buildDecisionFunnel} from "./_sqDecisionFunnel.js";
import {buildHistoricalEdge} from "./_sqHistoryEdge.js";
import {buildDirectionalEdge} from "./_sqFairValue.js";
import {buildRiskReference} from "./_sqRisk.js";
import {runMonteCarlo} from "./_sqMonteCarlo.js";
import {fetchOfficialNewsRisk} from "./_sqNewsRisk.js";

export const SMART_QUANT_BUILD="sq-phase1-2026-10-05";

function fakeResponse(){
  let payload=null,code=200;
  const res={
    setHeader(){return res},
    status(n){code=n;return res},
    json(x){payload=x;return res},
    end(){return res}
  };
  return {res,result:()=>({payload,code})};
}
async function callHandler(handler,req){
  const mock=fakeResponse();
  await handler(req,mock.res);
  return mock.result();
}
function safeMacro(m){
  if(!m?.ok)return {ok:false,error:m?.error||"MACRO_UNAVAILABLE"};
  const wanted=new Set(["US2Y","US10Y","REAL10Y","USDBROAD","BREAKEVEN10","FEDUPPER","NETLIQ","CPI","COREPCE"]);
  return {
    ok:true,fetchedAt:m.fetchedAt||null,provider:m.provider||null,
    scores:m.scores||null,regime:m.regime||null,gold:m.gold||null,quality:m.quality||null,
    drivers:(m.cards||[]).filter(x=>wanted.has(String(x.id))).map(x=>({
      id:x.id,name:x.name,value:x.value,display:x.display,date:x.date,source:x.source,
      change:x.change,changeLabel:x.changeLabel,goldImpact:x.goldImpact,frequency:x.frequency,stale:x.stale,status:x.status
    }))
  };
}
function slimAnalysis(a){
  const sig=a?.indicator?.latestSignal||{},ind=a?.indicator||{};
  return {
    requested:a?.requested||null,symbol:a?.symbol||null,broker:a?.broker||null,brokerServer:a?.brokerServer||null,
    selectedTF:a?.selectedTF||null,triggerTF:a?.triggerTF||null,setupTF:a?.setupTF||null,biasTF:a?.biasTF||null,
    indicatorMode:a?.indicatorMode||null,marketState:a?.marketState||null,ageMin:a?.ageMin??null,
    price:a?.price??null,tick:a?.tick||null,digits:a?.digits??null,point:a?.point??null,
    latestSignal:{code:sig.code||"WAIT",direction:sig.direction??0,score:sig.score??null,status:sig.status||null,grade:sig.grade||null,
      entry:sig.entry??null,invalidation:sig.invalidation??null,tp1:sig.tp1??null,tp2:sig.tp2??null,tp3:sig.tp3??null,
      reasons:Array.isArray(sig.reasons)?sig.reasons:[]},
    setupState:ind.setupState||null,biasState:ind.biasState||null,
    activeZones:{buy:(ind.activeZones?.buy||[]).slice(0,8),sell:(ind.activeZones?.sell||[]).slice(0,8)}
  };
}
function validSymbol(x){return /^[A-Za-z0-9._#-]{1,42}$/.test(String(x||""))}

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"METHOD_NOT_ALLOWED"});
  res.setHeader("Cache-Control","s-maxage=20, stale-while-revalidate=40");

  const symbol=String(req.query?.symbol||"XAUUSD247").trim();
  const tf=String(req.query?.tf||"M5").toUpperCase();
  const indicator=String(req.query?.indicator||"105").toLowerCase();
  if(!validSymbol(symbol))return res.status(400).json({ok:false,error:"INVALID_SYMBOL"});

  try{
    const analyzePromise=callHandler(analyzeHandler,{method:"GET",query:{symbol,tf,indicator}});
    const wantsMacro=isGoldSymbol(symbol);
    const macroPromise=wantsMacro?callHandler(macroHandler,{method:"GET",query:{}}):Promise.resolve({code:200,payload:{ok:false,error:"NOT_APPLICABLE"}});
    const newsPromise=fetchOfficialNewsRisk(new Date()).catch(e=>({ok:false,verification:"PARTIAL_UNVERIFIED",status:"PARTIAL_UNVERIFIED",block:false,error:String(e?.message||e),upcoming:[],sources:[]}));
    const [aResult,mResult,newsRisk]=await Promise.all([analyzePromise,macroPromise,newsPromise]);
    const analysis=aResult.payload;
    if(aResult.code>=400||!analysis?.ok||!analysis?.ready){
      return res.status(200).json({ok:false,ready:false,build:SMART_QUANT_BUILD,error:analysis?.error||"BROKER_ANALYSIS_NOT_READY",
        requested:{symbol,tf,indicator},analysis:analysis?slimAnalysis(analysis):null});
    }

    const macro=wantsMacro?safeMacro(mResult.payload):{ok:false,error:"NOT_APPLICABLE"};
    const features=buildSmartFeatures(analysis);
    const dataHealth=assessDataHealth(analysis,macro,features);
    const regime=classifySmartRegime(features,analysis);
    const directionalEdge=buildDirectionalEdge({analysis,features,regime,macro});
    const historicalEdge=buildHistoricalEdge(analysis);
    const risk=buildRiskReference(historicalEdge,{hardCapPct:.50,kellyFraction:.25});
    const monteCarlo=runMonteCarlo(historicalEdge,risk,{paths:2000,trades:100,seedKey:(analysis.symbol||symbol)+"|"+tf+"|"+indicator});
    const decision=buildDecisionFunnel({analysis,macro,features,regime,dataHealth,newsRisk});

    return res.status(200).json({
      ok:true,ready:true,build:SMART_QUANT_BUILD,researchOnly:true,
      capturedAtUTC:new Date().toISOString(),
      requested:{symbol,tf,indicator},
      analysis:slimAnalysis(analysis),
      features,dataHealth,regime,macro,newsRisk,directionalEdge,historicalEdge,risk,monteCarlo,decision,
      disclaimer:"Smart Quant is a research decision-support layer. Directional Edge is not a price target, historical evidence is not forward calibration, and no broker order is placed."
    });
  }catch(e){
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ok:false,ready:false,build:SMART_QUANT_BUILD,error:String(e?.message||e),requested:{symbol,tf,indicator}});
  }
}
