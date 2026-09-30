import {fetchV8Context,filterHistory,aggregate,groupHistory,compareMonths,DISCLAIMER} from "./_v8Data.js";
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=180");
  try{
    const ctx=await fetchV8Context(req.query||{});
    const period=["day","week","month","year"].includes(String(req.query?.period||"month"))?String(req.query.period):"month";
    const filtered=filterHistory(ctx.rows,{direction:String(req.query?.direction||"ALL").toUpperCase(),
      from:String(req.query?.from||""),to:String(req.query?.to||""),recordMode:"HISTORICAL_SIM"});
    return res.status(200).json({ok:true,version:"8.0.0-staging",symbol:ctx.symbolResolved,indicator:ctx.indicator,tf:ctx.tf,
      recordMode:"HISTORICAL_SIM",dataWindow:ctx.dataWindow,summary:aggregate(filtered),
      period,groups:groupHistory(filtered,period),comparison:compareMonths(filtered),
      metricDefinition:{strictWinRate:"positive / (positive + negative); BE_ZERO excluded",legacyWinRate:"(positive + BE_ZERO) / (positive + negative + BE_ZERO)",
        ambiguous:"excluded from completion denominator",pips:"Per-symbol only; not added across unlike assets.",RMultiple:"signed quote-price move / original SL risk",
        grossPL:"Contract-based estimate for broker-supported 0.01 lot settled in USD; excludes costs."},
      completeness:"WINDOW_LIMITED_HISTORICAL_SIM",disclaimer:DISCLAIMER});
  }catch(e){res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:false,ready:false,error:String(e?.message||e),groups:[]});}
}