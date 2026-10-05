import {forwardConfigured,validateSecret,readForwardPrivate,readForwardOutcomePrivate,normalizeOutcomePayload,storeOutcome,storeCalibrationSample} from "./_v8Ledger.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method==="GET")return res.status(200).json({
    ok:true,enabled:forwardConfigured(),mode:forwardConfigured()?"APPEND_ONLY_OUTCOME_EVENT":"NOT_CONFIGURED",
    note:"Final outcome is stored as a separate immutable event; the original forward publication is never rewritten."});
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"POST_ONLY"});
  if(!forwardConfigured())return res.status(503).json({ok:false,error:"FORWARD_STORAGE_NOT_CONFIGURED"});
  if(!validateSecret(req.headers?.["x-gf-forward-key"]))return res.status(401).json({ok:false,error:"UNAUTHORIZED"});
  try{
    if(!String(req.headers?.["content-type"]||"").toLowerCase().includes("application/json"))throw Error("APPLICATION_JSON_REQUIRED");
    const date=String(req.body?.date||""),signalId=String(req.body?.signalId||"");
    const published=await readForwardPrivate(date,signalId);
    if(!published)return res.status(404).json({ok:false,error:"PUBLISHED_RECORD_NOT_FOUND"});
    let event=normalizeOutcomePayload(req.body,published,new Date()),stored=null,outcomeAlreadyExists=false;
    try{
      stored=await storeOutcome(event);
    }catch(storeErr){
      const msg=String(storeErr?.message||storeErr),conflict=/already.exists|overwrite|409|conflict/i.test(msg);
      if(!conflict)throw storeErr;
      const existing=await readForwardOutcomePrivate(date,signalId);
      const same=existing&&existing.outcome===event.outcome&&Number(existing.exitPrice)===Number(event.exitPrice)&&
        existing.exitTimeUTC===event.exitTimeUTC&&existing.exitRule===event.exitRule;
      if(!same)throw Error("IMMUTABLE_OUTCOME_CONFLICT");
      event=existing;outcomeAlreadyExists=true;
    }

    let calibrationIndexed=false,calibrationIndexError=null;
    try{
      if(published.score!=null){
        try{await storeCalibrationSample(published,event);calibrationIndexed=true}
        catch(indexErr){
          const imsg=String(indexErr?.message||indexErr);
          if(/already.exists|overwrite|409|conflict/i.test(imsg))calibrationIndexed=true;
          else throw indexErr;
        }
      }else calibrationIndexError="CALIBRATION_SCORE_UNAVAILABLE";
    }catch(indexErr){
      // Outcome immutability is primary. The endpoint remains retryable for calibration repair.
      calibrationIndexError="CALIBRATION_INDEX_WRITE_FAILED";
      console.error("[GoldFlow calibration index]",{signalId:event.signalId,error:String(indexErr?.message||indexErr)});
    }
    return res.status(outcomeAlreadyExists?200:201).json({ok:true,
      mode:outcomeAlreadyExists?"FORWARD_LOGGED_OUTCOME_EXISTING":"FORWARD_LOGGED_OUTCOME",
      signalId:event.signalId,outcome:event.outcome,exitTimeUTC:event.exitTimeUTC,eventHash:event.eventHash,
      archivePath:stored?.pathname||null,outcomeAlreadyExists,calibrationIndexed,calibrationIndexError,
      verification:event.verification});
  }catch(e){
    const msg=String(e?.message||e),conflict=/IMMUTABLE_OUTCOME_CONFLICT|already.exists|overwrite|409|conflict/i.test(msg);
    const bad=/INVALID|MISMATCH|REQUIRED/i.test(msg);
    return res.status(conflict?409:bad?400:502).json({ok:false,error:conflict?"IMMUTABLE_OUTCOME_CONFLICT":bad?msg:"OUTCOME_ARCHIVE_WRITE_FAILED"});
  }
}
