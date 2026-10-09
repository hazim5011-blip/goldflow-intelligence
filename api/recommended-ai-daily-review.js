import {reasonDailyUnderperformance} from "./_internetResearchScout.js";
export const maxDuration=60;

const safeIndicator=x=>/^[a-z0-9._-]{1,32}$/.test(String(x||""));
const safeSymbol=x=>/^[A-Za-z0-9._#-]{1,42}$/.test(String(x||""));

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="POST")return res.status(405).json({ok:false,error:"POST_ONLY"});
  res.setHeader("Cache-Control","no-store");
  const body=req.body&&typeof req.body==="object"?req.body:{},items=Array.isArray(body.items)?body.items.slice(0,16):[];
  if(items.some(x=>!safeIndicator(x?.indicator)||!safeSymbol(x?.symbol)))return res.status(400).json({ok:false,error:"INVALID_DAILY_REVIEW_ITEM"});
  const reviewDateMYT=String(body.reviewDateMYT||"").slice(0,10),context=body.context&&typeof body.context==="object"?body.context:null;
  try{
    const reasoning=await reasonDailyUnderperformance({items,reviewDateMYT,context});
    return res.status(200).json({ok:true,version:"RECOMMENDED_AI_DAILY_REVIEW_V1",generatedAtUTC:new Date().toISOString(),
      reviewDateMYT,flagged:items,reasoning,
      safety:{protectedEngineAutoEdit:false,managementChangesRequireShadowOOS:true,performanceNumbersModelEditable:false}});
  }catch(e){
    return res.status(200).json({ok:false,error:String(e?.message||e),generatedAtUTC:new Date().toISOString(),reviewDateMYT,flagged:items});
  }
}
