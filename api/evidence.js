import {fetchV8Context,evidenceForRecord,explainRecord,DISCLAIMER} from "./_v8Data.js";
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","s-maxage=60, stale-while-revalidate=180");
  try{
    const ctx=await fetchV8Context(req.query||{});
    const id=String(req.query?.id||"");
    const rec=id?ctx.rows.find(x=>x.signalId===id):ctx.rows.at(-1);
    if(!rec)return res.status(404).json({ok:false,error:"SIGNAL_ID_NOT_IN_CURRENT_BROKER_WINDOW"});
    const evidence=evidenceForRecord(rec,ctx.brokerBars);
    if(req.query?.format==="csv"){
      const keys=["signalId","recordMode","symbolResolved","indicatorId","tf","direction","signalCandleCloseUTC","entry","originalSL","tp1","exitPrice","exitTimeUTC","outcome","priceMove","signedPips","signedPoints","grossPLUSD"];
      const escape=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
      res.setHeader("Content-Type","text/csv; charset=utf-8");
      res.setHeader("Content-Disposition","attachment; filename=goldflow-reconstructed-evidence.csv");
      return res.status(200).end(keys.join(",")+"\n"+keys.map(k=>escape(rec[k])).join(",")+"\n");
    }
    return res.status(200).json({ok:true,...evidence,explanation:explainRecord(rec),disclaimer:DISCLAIMER,
      evidencePolicy:{forwardLogged:false,immutableArchive:false,
        contemporaneousPublicationProof:false,hashOnlyVerifiesCurrentResponse:true,
        tradingView:"Independent reference only. Its candles are NOT Vantage broker evidence."}});
  }catch(e){res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:false,error:String(e?.message||e)});}
}