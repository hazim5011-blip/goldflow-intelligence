import crypto from "node:crypto";

const mapStatus=s=>{
  const x=String(s||"").toUpperCase();
  if(x==="TP")return "TP1";
  if(x==="TR")return "TRAILING";
  if(x==="SL")return "SL";
  if(x==="BE")return "AMBIGUOUS";
  if(x==="VALID")return "VALID_ONLY";
  return x==="P"||x==="PENDING"?"PENDING":"PENDING";
};
const hash=o=>crypto.createHash("sha256").update(JSON.stringify(o)).digest("hex");
const pipSizeFor=(symbol,point)=>{
  const s=String(symbol||"").toUpperCase();
  if(!Number.isFinite(point)||point<=0)return null;
  if(/XAU|XAG/.test(s))return point*10;
  if(/JPY/.test(s))return point*10;
  if(/^[A-Z]{6}/.test(s))return point*10;
  return null;
};
async function selfJson(req,path){
  const proto=(req.headers["x-forwarded-proto"]||"https").split(",")[0];
  const host=req.headers["x-forwarded-host"]||req.headers.host;
  const r=await fetch(proto+"://"+host+path,{cache:"no-store"});
  const j=await r.json();
  if(!r.ok)throw new Error(j.error||("HTTP "+r.status));
  return j;
}
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  res.setHeader("Cache-Control","no-store");
  const symbol=String(req.query?.symbol||"XAUUSD247");
  const tf=String(req.query?.tf||"M5");
  const indicator=String(req.query?.indicator||"105");
  try{
    const a=await selfJson(req,"/api/analyze?symbol="+encodeURIComponent(symbol)+"&tf="+encodeURIComponent(tf)+"&indicator="+encodeURIComponent(indicator));
    if(!a.ok||!a.ready)return res.status(200).json({ok:false,ready:false,error:a.error||"analysis unavailable"});
    let spec=null;
    try{spec=await selfJson(req,"/api/symbol-spec?symbol="+encodeURIComponent(a.symbol||symbol));}catch{}
    const meta=spec?.spec||{};
    const point=Number(a.point||meta.point||0)||null;
    const pipSize=pipSizeFor(a.symbol||symbol,point);
    const rows=(a.indicator?.history||[]).map((x,i)=>{
      const direction=Number(x.direction||0);
      const normalized=mapStatus(x.status);
      const recordMode="HISTORICAL_SIM";
      const base={
        recordMode,symbolRequested:symbol,symbolResolved:a.symbol||symbol,brokerServer:spec?.server||null,
        indicatorId:indicator,indicatorVersion:a.indicator?.engine||null,triggerTF:a.triggerTF,biasTF:a.biasTF,setupTF:a.setupTF,
        direction:direction>0?"BUY":direction<0?"SELL":"WAIT",signalCandleCloseUTC:x.closeTime?new Date(x.closeTime*1000).toISOString():new Date(Number(x.time)*1000).toISOString(),
        publishedAtUTC:null,entry:x.entry??null,originalSL:x.invalidation??null,tp1:x.tp1??null,tp2:x.tp2??null,tp3:x.tp3??null,
        score:x.score??null,reasons:x.reasons||[],zone:x.zone||null,pipSize,point,tickSize:meta.tradeTickSize??null,
        tickValue:meta.tradeTickValueProfit??null,contractSize:meta.contractSize??null,currencyProfit:meta.currencyProfit??null,
        volumeMin:meta.volumeMin??null,volumeStep:meta.volumeStep??null,lotExample:.01,status:normalized,legacyStatus:x.status||null,
        exitTimeUTC:x.exitTime?new Date(x.exitTime*1000).toISOString():null,exitPrice:x.exitPrice??null,exitRule:x.exitRule||null,
        priceMove:null,signedPoints:null,signedPips:null,estimatedGrossPL:null,estimatedNetPL:null,newsContextId:null,
        engineBuildHash:null,capturedAtUTC:new Date().toISOString(),sourceUrl:"/api/analyze",dataQuality:"LEGACY_SIM_NO_EXACT_EXIT"
      };
      if(Number.isFinite(Number(base.exitPrice))&&Number.isFinite(Number(base.entry))){
        const d=direction>0?1:direction<0?-1:0;
        base.priceMove=d*(Number(base.exitPrice)-Number(base.entry));
        if(point)base.signedPoints=base.priceMove/point;
        if(pipSize)base.signedPips=base.priceMove/pipSize;
        if(Number.isFinite(Number(meta.contractSize))&&Number(meta.contractSize)>0&&meta.currencyProfit==="USD"&&(!meta.volumeMin||Number(meta.volumeMin)<=.01)){
          base.estimatedGrossPL=base.priceMove*Number(meta.contractSize)*.01;
        }
        base.dataQuality="SIM_WITH_EXACT_EXIT";
      }
      const idPayload={symbol:base.symbolResolved,indicator,tf:a.triggerTF,time:base.signalCandleCloseUTC,entry:base.entry,direction:base.direction};
      return {signalId:"sim_"+hash(idPayload).slice(0,24),...base};
    });
    return res.status(200).json({ok:true,ready:true,mode:"HISTORICAL_SIM",warning:"Closed-candle reconstruction. Not proof of contemporaneous publication.",count:rows.length,records:rows});
  }catch(e){return res.status(200).json({ok:false,ready:false,error:String(e.message||e)})}
}
