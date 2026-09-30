import {brokerGet,bridgeConfigured,apiError} from "./_broker.js";
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=30, stale-while-revalidate=300");
  if(!bridgeConfigured())return res.status(200).json({ok:false,error:"BROKER_BRIDGE_URL_NOT_CONFIGURED"});
  const symbol=String(req.query?.symbol||"").trim();if(!symbol)return res.status(400).json({ok:false,error:"symbol required"});
  try{
    const j=await brokerGet("/catalog",{filter:symbol,limit:100},15000,2);
    const exact=(j.symbols||[]).find(x=>x.name===symbol)||(j.symbols||[])[0]||null;
    if(!exact)return res.status(404).json({ok:false,error:"symbol not found"});
    return res.status(200).json({ok:true,server:j.server||null,spec:{
      name:exact.name,digits:exact.digits,point:exact.point,currencyProfit:exact.currencyProfit,contractSize:exact.contractSize,
      volumeMin:exact.volumeMin,volumeStep:exact.volumeStep,tradeTickSize:exact.tradeTickSize??null,
      tradeTickValueProfit:exact.tradeTickValueProfit??null,tradeTickValueLoss:exact.tradeTickValueLoss??null
    }});
  }catch(e){return apiError(res,e,200)}
}
