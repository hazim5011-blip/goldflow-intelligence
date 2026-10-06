import {forwardConfigured,validateSecret,readForwardPrivate,normalizeOutcomePayload,storeOutcome} from "./_v8Ledger.js";

export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const runtime=req.cfEnv;
  const enabled=forwardConfigured(runtime);
  if(req.method==="GET")return res.status(200).json({
    ok:true,enabled,mode:enabled?"APPEND_ONLY_OUTCOME_EVENT":"NOT_CONFIGURED",
    note:"Final outcome is stored as a separate immutable event; the original forward publication is never rewritten."});
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"POST_ONLY"});
  if(!enabled)return res.status(503).json({ok:false,error:"FORWARD_STORAGE_NOT_CONFIGURED"});
  if(!validateSecret(req.headers?.["x-gf-forward-key"],runtime))return res.status(401).json({ok:false,error:"UNAUTHORIZED"});
  try{
    if(!String(req.headers?.["content-type"]||"").toLowerCase().includes("application/json"))throw Error("APPLICATION_JSON_REQUIRED");
    const date=String(req.body?.date||""),signalId=String(req.body?.signalId||"");
    const published=await readForwardPrivate(date,signalId,runtime);
    if(!published)return res.status(404).json({ok:false,error:"PUBLISHED_RECORD_NOT_FOUND"});
    const event=normalizeOutcomePayload(req.body,published,new Date());
    const stored=await storeOutcome(event,runtime);
    return res.status(201).json({ok:true,mode:"FORWARD_LOGGED_OUTCOME",signalId:event.signalId,outcome:event.outcome,
      exitTimeUTC:event.exitTimeUTC,eventHash:event.eventHash,archivePath:stored.pathname,
      verification:event.verification});
  }catch(e){
    const msg=String(e?.message||e),conflict=/already.exists|already_exists|immutable|overwrite|409|conflict/i.test(msg);
    const bad=/INVALID|MISMATCH|REQUIRED/i.test(msg);
    return res.status(conflict?409:bad?400:502).json({ok:false,error:conflict?"IMMUTABLE_OUTCOME_ALREADY_EXISTS":bad?msg:"OUTCOME_ARCHIVE_WRITE_FAILED"});
  }
}
