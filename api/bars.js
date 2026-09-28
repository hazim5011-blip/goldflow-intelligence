import {bridgeConfigured,brokerGet,apiError} from "./_broker.js";
const ALLOWED=new Set(["M1","M5","M15","M30","H1","H4","D1","W1","MN1"]);

export default async function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=5, stale-while-revalidate=10");
  if(!bridgeConfigured()) return res.status(200).json({ok:false,configured:false,error:"BROKER_BRIDGE_URL_NOT_CONFIGURED"});
  const symbol=String(req.query?.symbol||"").trim();
  const tf=String(req.query?.tf||"M5").toUpperCase();
  const limit=Math.min(5000,Math.max(20,Number(req.query?.limit)||500));
  if(!symbol) return res.status(400).json({ok:false,error:"symbol required"});
  if(!ALLOWED.has(tf)) return res.status(400).json({ok:false,error:"unsupported tf"});
  try{
    const d=await brokerGet("/bars",{symbol,tf,limit},10000);
    return res.status(200).json({ok:true,configured:true,...d});
  }catch(e){ return apiError(res,e,200,{symbol,tf}); }
}
