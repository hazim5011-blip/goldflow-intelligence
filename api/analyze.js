import {bridgeConfigured,brokerGet,apiError} from "./_broker.js";
import {runIndicator} from "./_indicator105.js";

const PROFILE={
  M1:["M1","M5","M15"],
  M5:["M5","M15","H1"],
  M15:["M15","M30","H4"],
  M30:["M30","H1","H4"],
  H1:["H1","H4","D1"],
  H4:["H4","D1","W1"],
  D1:["D1","W1","MN1"]
};

export default async function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=10, stale-while-revalidate=86400");
  if(!bridgeConfigured()) return res.status(200).json({ok:false,ready:false,bridgeConfigured:false,error:"BROKER_BRIDGE_URL_NOT_CONFIGURED"});
  const symbol=String(req.query?.symbol||"").trim();
  const triggerTF=String(req.query?.tf||"M5").toUpperCase();
  if(!symbol) return res.status(400).json({ok:false,error:"symbol required"});
  if(!PROFILE[triggerTF]) return res.status(400).json({ok:false,error:"unsupported tf"});
  const [tTF,sTF,bTF]=PROFILE[triggerTF];
  const LIMITS={
    M1:[1000,800,600],M5:[1000,800,600],M15:[900,700,550],
    M30:[800,650,500],H1:[700,550,420],H4:[500,400,300],D1:[400,320,250]
  };
  const [lt,ls,lb]=LIMITS[triggerTF]||[700,550,420];
  try{
    let t,s,b;
    try{
      const batch=await brokerGet("/multi-bars",{symbol,tfs:[tTF,sTF,bTF].join(","),limits:[lt,ls,lb].join(",")},55000);
      t={bars:batch.frames?.[tTF]||[],symbol:batch.symbol,broker:batch.broker,bid:batch.bid,ask:batch.ask,spread:batch.spread,digits:batch.digits,point:batch.point,serverTime:batch.serverTime};
      s={bars:batch.frames?.[sTF]||[]};
      b={bars:batch.frames?.[bTF]||[]};
    }catch(batchErr){
      const msg=String(batchErr?.message||batchErr);
      if(!/404|Not Found|detail/i.test(msg) && !/multi-bars/i.test(msg)) throw batchErr;
      [t,s,b]=await Promise.all([
        brokerGet("/bars",{symbol,tf:tTF,limit:lt},30000),
        brokerGet("/bars",{symbol,tf:sTF,limit:ls},30000),
        brokerGet("/bars",{symbol,tf:bTF,limit:lb},30000)
      ]);
    }
    const indicator=runIndicator({
      triggerBars:t.bars,setupBars:s.bars,biasBars:b.bars,
      triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:t.symbol||symbol,point:t.point||0
    });
    const now=Math.floor(Date.now()/1000);
    const last=t.bars?.at(-1)?.t||null;
    const ageMin=last?Math.max(0,(now-last)/60):null;
    return res.status(200).json({
      ok:true,ready:indicator.ready,bridgeConfigured:true,source:"MT5_BRIDGE",
      requested:symbol,symbol:t.symbol||symbol,broker:t.broker||"Vantage",
      triggerTF:tTF,setupTF:sTF,biasTF:bTF,
      tick:{bid:t.bid??null,ask:t.ask??null,spread:t.spread??null},
      price:t.bid??t.bars?.at(-1)?.c??null,digits:t.digits??null,point:t.point??null,
      serverTime:t.serverTime??null,lastBarTime:last,ageMin,
      marketState:ageMin!=null&&ageMin>Math.max(3,({M1:1,M5:5,M15:15,M30:30,H1:60,H4:240,D1:1440}[tTF]||5)*3)?"MT5_STALE":"MT5_LIVE",
      indicator,
      chartBars:(t.bars||[]).slice(-500)
    });
  }catch(e){res.setHeader("Cache-Control","no-store");return apiError(res,e,200,{ready:false,symbol,triggerTF,bridgeConfigured:true});}
}
