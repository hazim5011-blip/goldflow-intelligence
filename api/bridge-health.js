import {bridgeConfigured,brokerGet,apiError} from "./_broker.js";

export default async function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  res.setHeader("Cache-Control","no-store");
  if(!bridgeConfigured()) return res.status(200).json({ok:true,configured:false,online:false,status:"BRIDGE OFF"});
  try{
    const h=await brokerGet("/health",{},6000);
    return res.status(200).json({ok:true,configured:true,online:!!h?.connected,status:h?.connected?"MT5 LIVE":"BRIDGE DATA",...h});
  }catch(e){
    return apiError(res,e,200,{configured:true,online:false,status:"BRIDGE ERROR"});
  }
}
