import {runInternetResearch} from "./_internetResearchScout.js";
export const maxDuration=60;

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","no-store");
  try{
    const useReasoning=String(req.query?.reasoning??"1")!=="0";
    return res.status(200).json(await runInternetResearch({useReasoning}));
  }catch(e){
    return res.status(200).json({ok:false,error:String(e?.message||e),generatedAtUTC:new Date().toISOString()});
  }
}
