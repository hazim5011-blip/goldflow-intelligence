import {runRecommendedAI,RECOMMENDED_AI_INDICATORS} from "./_recommendedAIEngine.js";

const TF_ALLOWED=new Set(["M1","M5","M15","M30","H1","H4","D1"]);
function validSymbol(x){return /^[A-Za-z0-9._#-]{1,42}$/.test(String(x||""))}

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","no-store");
  const symbol=String(req.query?.symbol||"XAUUSD247").trim(),tf=String(req.query?.tf||"M15").toUpperCase(),
    indicator=String(req.query?.indicator||"105").toLowerCase(),shadow=String(req.query?.shadow??"1")!=="0";
  if(!validSymbol(symbol))return res.status(400).json({ok:false,error:"INVALID_SYMBOL"});
  if(!TF_ALLOWED.has(tf))return res.status(400).json({ok:false,error:"INVALID_TIMEFRAME"});
  if(!RECOMMENDED_AI_INDICATORS.includes(indicator)&&indicator!=="pvt")return res.status(400).json({ok:false,error:"INVALID_INDICATOR"});
  try{
    const out=await runRecommendedAI({symbol,tf,indicator,shadow});
    return res.status(200).json(out);
  }catch(e){
    return res.status(200).json({ok:false,ready:false,error:String(e?.message||e),symbol,tf,indicator,generatedAtUTC:new Date().toISOString()});
  }
}
