import {forwardConfigured,publicReadEnabled} from "./_v8Ledger.js";
import {fetchV8Context,filterHistory,aggregate,DISCLAIMER} from "./_v8Data.js";
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","s-maxage=45, stale-while-revalidate=120");
  try{
    const ctx=await fetchV8Context(req.query||{});
    const limit=Math.min(160,Math.max(1,Number(req.query?.limit)||160));
    const rows=filterHistory(ctx.rows,{direction:String(req.query?.direction||"ALL").toUpperCase(),
      from:String(req.query?.from||""),to:String(req.query?.to||"")}).slice(-limit).reverse();
    const {brokerBars,...publicContext}=ctx;
    return res.status(200).json({ok:true,version:"8.0.0-staging",...publicContext,rows,stats:aggregate(rows),
      availableSignals:ctx.rows.length,forwardLedger:{configured:forwardConfigured(),count:null,status:!forwardConfigured()?"NOT_CONFIGURED":publicReadEnabled()?"ARCHIVE_CONNECTED_PUBLISHER_STATUS_UNVERIFIED":"PRIVATE_ARCHIVE_CONNECTED",
        note:"Forward records must be separately published by an authenticated publisher at candle close. Historical simulations are never relabelled as forward proof."},
      disclaimer:DISCLAIMER});
  }catch(e){res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:false,ready:false,error:String(e?.message||e),rows:[]});}
}