async function selfJson(req,path){
  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0],host=req.headers["x-forwarded-host"]||req.headers.host;
  const r=await fetch(proto+"://"+host+path,{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error||("HTTP "+r.status));return j;
}
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  res.setHeader("Cache-Control","no-store");
  const q=new URLSearchParams({symbol:String(req.query?.symbol||"XAUUSD247"),tf:String(req.query?.tf||"M5"),indicator:String(req.query?.indicator||"105")});
  try{
    const h=await selfJson(req,"/api/history?"+q.toString());if(!h.ok)return res.status(200).json(h);
    const r=h.records||[];const c={total:r.length,completed:0,tp:0,trailing:0,bePositive:0,beZero:0,sl:0,pending:0,ambiguous:0,validOnly:0};
    for(const x of r){switch(x.status){case"TP1":case"TP2":case"TP3":c.tp++;c.completed++;break;case"TRAILING":c.trailing++;c.completed++;break;case"BE_POSITIVE":c.bePositive++;c.completed++;break;case"BE_ZERO":c.beZero++;c.completed++;break;case"SL":c.sl++;c.completed++;break;case"AMBIGUOUS":c.ambiguous++;break;case"VALID_ONLY":c.validOnly++;break;default:c.pending++;}}
    const positive=c.tp+c.trailing+c.bePositive,negative=c.sl,den=positive+negative;
    const legacyDen=c.tp+c.trailing+c.bePositive+c.beZero+c.sl;
    const sums=r.reduce((a,x)=>{if(Number.isFinite(x.signedPoints))a.points+=x.signedPoints;if(Number.isFinite(x.estimatedGrossPL))a.gross+=x.estimatedGrossPL;return a},{points:0,gross:0});
    const havePoints=r.some(x=>Number.isFinite(x.signedPoints)),haveGross=r.some(x=>Number.isFinite(x.estimatedGrossPL));
    return res.status(200).json({ok:true,mode:h.mode,counts:c,strictWinRate:den?100*positive/den:null,strictNumerator:positive,strictDenominator:den,
      legacyWinRate:legacyDen?100*(c.tp+c.trailing+c.bePositive+c.beZero)/legacyDen:null,
      signedPoints:havePoints?sums.points:null,grossPL001:haveGross?sums.gross:null,
      note:c.validOnly?"VALID_ONLY records are excluded from win rate.":null});
  }catch(e){return res.status(200).json({ok:false,error:String(e.message||e)})}
}
