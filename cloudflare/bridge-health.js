// Cloudflare edge has no portable node:dns/promises diagnostic. Main MT5 health stays real.
import {bridgeConfigured,brokerGet,apiError,bridgeEndpointMode} from "../api/_broker.js";
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(!bridgeConfigured())return res.status(200).json({ok:true,configured:false,online:false,status:"BRIDGE OFF"});
 try{const h=await brokerGet("/health",{},15000);
  return res.status(200).json({ok:true,configured:true,online:!!h?.connected,
   status:h?.connected?"MT5 LIVE":"BRIDGE DATA",bridgeRoute:bridgeEndpointMode(),...h,
   ...(String(req.query?.dns||"")==="1"?{dns:{status:"EDGE_DNS_DIAGNOSTIC_UNAVAILABLE"}}:{})});}
 catch(e){return apiError(res,e,200,{configured:true,online:false,status:"BRIDGE ERROR",bridgeRoute:bridgeEndpointMode()})}
}
