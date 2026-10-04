import {bridgeConfigured,brokerGet,apiError,classifySymbol} from "./_broker.js";

export default async function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=86400");
  if(!bridgeConfigured()) return res.status(200).json({ok:false,configured:false,symbols:[],error:"BROKER_BRIDGE_URL_NOT_CONFIGURED"});
  const q=String(req.query?.q||"").trim();
  try{
    let rows=[];
    try{
      const c=await brokerGet("/catalog",{filter:q,limit:5000},10000);
      rows=Array.isArray(c?.symbols)?c.symbols:[];
    }catch{
      const s=await brokerGet("/symbols",{filter:q},10000);
      rows=(Array.isArray(s?.symbols)?s.symbols:[]).map(name=>({name}));
    }
    const seen=new Set();
    const symbols=[];
    for(const x of rows){
      const name=String(x?.name||x||"").trim();
      if(!name || seen.has(name)) continue;
      seen.add(name);
      symbols.push({
        name,
        description:x?.description||"",
        path:x?.path||"",
        category:classifySymbol(name,x?.path,x?.description),
        digits:Number.isFinite(Number(x?.digits))?Number(x.digits):null,
        point:Number.isFinite(Number(x?.point))?Number(x.point):null,
        visible:x?.visible!==false
      });
    }
    const priority={SYNTHETIC:0,METALS:1,FOREX:2,CRYPTO:3,INDICES:4,ENERGY:5,STOCKS:6,OTHER:7};
    symbols.sort((a,b)=>(priority[a.category]-priority[b.category])||a.name.localeCompare(b.name));
    return res.status(200).json({ok:true,configured:true,count:symbols.length,symbols});
  }catch(e){ res.setHeader("Cache-Control","no-store"); return apiError(res,e,200,{symbols:[]}); }
}
