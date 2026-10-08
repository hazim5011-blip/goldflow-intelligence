import {fetchV8Context,filterHistory,aggregate,groupHistory,compareMonths,DISCLAIMER} from "./_v8Data.js";
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=180");
  try{
    const ctx=await fetchV8Context(req.query||{});
    const period=["day","week","month","year"].includes(String(req.query?.period||"month"))?String(req.query.period):"month";
    const recordMode=ctx.historyMode==="GF_NEWS_FORWARD_ARCHIVE"?"FORWARD_LOGGED":"HISTORICAL_SIM";
    const filtered=filterHistory(ctx.rows,{direction:String(req.query?.direction||"ALL").toUpperCase(),
      from:String(req.query?.from||""),to:String(req.query?.to||""),recordMode});
    return res.status(200).json({ok:true,version:"8.0.0",symbol:ctx.symbolResolved,indicator:ctx.indicator,tf:ctx.tf,
      recordMode,historyMode:ctx.historyMode||"HISTORICAL_SIM",historyNote:ctx.historyNote||null,dataWindow:ctx.dataWindow,summary:aggregate(filtered),
      period,groups:groupHistory(filtered,period),comparison:compareMonths(filtered),
      metricDefinition:{strictWinRate:"P/L-weighted: WIN value / (WIN value + absolute LOSS value). Uses complete Gross USD coverage first; otherwise complete per-symbol PIP coverage. 50% is breakeven before costs. BE_ZERO and AMBIGUOUS add no win/loss value.",
        signalWinRate:"Count-based reference only: positive signal count / (positive + negative). It must not override a negative NET PIP/USD result.",
        legacyWinRate:"(positive + BE_ZERO) / (positive + negative + BE_ZERO); count-only legacy reference",
        ambiguous:"excluded from P/L weighting because intrabar order is unknown",pips:"Per-symbol only; WIN PIP + SL PIP = NET PIP.",RMultiple:"signed quote-price move / original SL risk",
        normalizedTradePlan:"Every evaluable signal requires Entry + SL. Missing native targets are filled only in the History study layer as 1R/2R/3R; management uses BE trigger +0.50R, lock +0.05R, trail trigger +0.75R, trail distance 0.35R.",
        grossPL:"Contract-based gross estimate for broker-supported 0.01 lot settled in USD; excludes spread, commission, swap and slippage."},
      completeness:"WINDOW_LIMITED_HISTORICAL_SIM",disclaimer:DISCLAIMER});
  }catch(e){res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:false,ready:false,error:String(e?.message||e),groups:[]});}
}