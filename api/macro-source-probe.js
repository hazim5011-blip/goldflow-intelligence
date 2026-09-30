export default async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  const urls=[
    "https://markets.newyorkfed.org/api/rp/reverserepo/all/results/latest.json",
    "https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json",
    "https://fred.stlouisfed.org/graph/fredgraph.csv?id=RRPONTSYD"
  ];
  const result=await Promise.all(urls.map(async url=>{
    const c=new AbortController(),t=setTimeout(()=>c.abort(),7000);
    try{
      const r=await fetch(url,{signal:c.signal,headers:{Accept:"application/json,text/csv"}});
      const body=await r.text();
      let parsed;try{parsed=JSON.parse(body)}catch{}
      return {url,http:r.status,
        rootKeys:parsed&&typeof parsed==="object"?Object.keys(parsed):null,
        repoKeys:parsed?.repo?Object.keys(parsed.repo):null,
        operationsType:Array.isArray(parsed?.repo?.operations)?"array":typeof parsed?.repo?.operations,
        operationCount:parsed?.repo?.operations?.length??null,
        firstOperation:parsed?.repo?.operations?.[0]??null,
        otherRootKeys:parsed?.rp?Object.keys(parsed.rp):null,
        sample:parsed?null:body.slice(0,180)
      };
    }catch(e){return {url,error:String(e.message)}}
    finally{clearTimeout(t)}
  }));
  return res.status(200).json({probe:"official-public-data-only",result});
}