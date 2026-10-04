import {collectWorldNews} from "./_marketNews.js";
// Best-effort per-isolate memo. Not a persistent archive or push notification.
// Pages edge cache may additionally reuse fresh responses for 3 minutes.
const TTL=180000;
let memo={at:0,result:null,promise:null,lastRefreshAttempt:0};
export default async function handler(req,res){
 res.setHeader("Cache-Control","public, s-maxage=150, stale-while-revalidate=90");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
 const now=Date.now(),force=String(req.query?.force||"")==="1"&&now-memo.lastRefreshAttempt>30000;
 if(force)memo.lastRefreshAttempt=now;
 try{
  if(!force&&memo.result&&now-memo.at<TTL)return res.status(200).json(memo.result);
  if(!memo.promise)memo.promise=collectWorldNews().then(d=>{
   memo.result=d;memo.at=Date.now();return d;
  }).finally(()=>{memo.promise=null});
  const d=await memo.promise;
  return res.status(200).json(d);
 }catch(e){
  res.setHeader("Cache-Control","no-store");
  if(memo.result)return res.status(200).json({...memo.result,sourceStatus:"STALE_LAST_FETCH",
   staleAsOfUTC:new Date(memo.at).toISOString(),errorCode:"CURRENT_SOURCE_FETCH_FAILED"});
  return res.status(503).json({ok:false,error:"WORLD_NEWS_FEED_UNAVAILABLE",
   detail:"Please retry; no unverified or synthetic fresh news was generated."});
 }
}
