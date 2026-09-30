import {forwardConfigured,validateSecret,normalizePublishedPayload,storePublished} from "./_v8Ledger.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method==="GET")return res.status(200).json({
    ok:true,enabled:forwardConfigured(),mode:forwardConfigured()?"SECURE_PRIVATE_BLOB":"NOT_CONFIGURED",
    note:"No forward record is fabricated when this endpoint is disabled. Broker credentials are never returned."});
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"POST_ONLY"});
  if(!forwardConfigured())return res.status(503).json({ok:false,error:"FORWARD_STORAGE_NOT_CONFIGURED"});
  if(!validateSecret(req.headers?.["x-gf-forward-key"]))return res.status(401).json({ok:false,error:"UNAUTHORIZED"});
  try{
    if(!String(req.headers?.["content-type"]||"").toLowerCase().includes("application/json"))throw Error("APPLICATION_JSON_REQUIRED");
    const published=normalizePublishedPayload(req.body,new Date());
    const stored=await storePublished(published);
    return res.status(201).json({ok:true,mode:"FORWARD_LOGGED",signalId:published.signalId,publishedAtUTC:published.receivedAtUTC,
      publicationHash:published.recordHash,archivePath:stored.pathname,
      verification:"AUTHENTICATED_SERVER_RECEIPT; NOT AN INDEPENDENT BROKER FILL ATTESTATION",
      note:"Original record cannot be overwritten. Outcome events must use a separate append-only path."});
  }catch(e){
    const msg=String(e?.message||e);
    const conflict=/already.exists|overwrite|409|conflict/i.test(msg);
    const bad=/INVALID|NOT_CONTEMPORANEOUS|CANDLE|OVERSIZED|REQUIRED/i.test(msg);
    return res.status(conflict?409:bad?400:502).json({ok:false,error:conflict?"DUPLICATE_IMMUTABLE_RECORD":bad?msg:"ARCHIVE_WRITE_FAILED"});
  }
}