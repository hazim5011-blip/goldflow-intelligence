import {forwardConfigured,publicReadEnabled,readForward} from "./_v8Ledger.js";
export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  if(!publicReadEnabled())return res.status(200).json({ok:true,enabled:false,forwardCount:null,status:forwardConfigured()?"PRIVATE_ARCHIVE_RESTRICTED":"NOT_CONFIGURED",
    note:"No public forward evidence until durable storage and explicit public-read setting are configured."});
  try{
    const date=String(req.query?.date||""),id=String(req.query?.id||"");
    if(!date||!id)return res.status(400).json({ok:false,error:"DATE_AND_SIGNAL_ID_REQUIRED"});
    const record=await readForward(date,id);
    if(!record)return res.status(404).json({ok:false,error:"RECORD_NOT_FOUND"});
    const safe={...record,closedCandles:record.closedCandles}; // Whitelisted publisher schema contains no credentials.
    return res.status(200).json({ok:true,enabled:true,
      record:safe,verification:"AUTHENTICATED_CONTEMPORANEOUS_RECEIPT_AND_IMMUTABLE_HASH",
      disclaimer:"Published-at server receipt is not proof of executed trades, fill prices, future outcomes or independent broker certification."});
  }catch(e){
    const msg=String(e?.message||e);return res.status(/INVALID/.test(msg)?400:502).json({ok:false,error:/INVALID/.test(msg)?msg:"FORWARD_ARCHIVE_READ_FAILED"});
  }
}