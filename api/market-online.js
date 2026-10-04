// Verified-now broker market filter; a CRYPTO label by itself NEVER proves market open.
import {bridgeConfigured,brokerGet,vantageBrokerUtcOffsetSeconds,classifySymbol} from "./_broker.js";
const safe=/^[A-Za-z0-9._#-]{1,42}$/;
export function verifyOnline(row,tick,bridgeTs,nowSec,offset=10800){
 const bid=Number(tick?.bid),ask=Number(tick?.ask),tickAt=Number(tick?.time),observed=Number(bridgeTs);
 const tradeMode=Number(row?.tradeMode);
 const exact=tick&&tick.symbol===row?.name; // never accept broker alias substitution
 const age=observed-(tickAt-offset),snapshotAge=nowSec-observed;
 const tradable=[1,2,4].includes(tradeMode);
 const priceOk=Number.isFinite(bid)&&Number.isFinite(ask)&&bid>0&&ask>=bid;
 const fresh=Number.isFinite(age)&&age>=-20&&age<=35&&Number.isFinite(snapshotAge)&&snapshotAge>=-25&&snapshotAge<=35;
 return {status:!exact?"UNKNOWN":!tradable?"TRADE_DISABLED":priceOk&&fresh?"ONLINE":"OFFLINE",
  quoteAgeSeconds:Number.isFinite(age)?Math.round(age):null,
  verifiedNow:!!(exact&&tradable&&priceOk&&fresh)};
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","s-maxage=20, stale-while-revalidate=15");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
 if(!bridgeConfigured())return res.status(200).json({ok:false,status:"BRIDGE_OFF",verified:[],sampled:0});
 const offset=vantageBrokerUtcOffsetSeconds();
 if(offset===null)return res.status(200).json({ok:false,status:"BROKER_OFFSET_UNVERIFIED",verified:[],sampled:0});
 try{
  const catalog=await brokerGet("/catalog",{limit:5000},14000,1);
  const all=(catalog.symbols||[]).filter(x=>safe.test(x.name||""));
  // Weekend prioritizes likely 24/7 instruments, but ALL sampled symbols still need fresh ticks.
  const priority={CRYPTO:0,INDICES:1,ENERGY:2,METALS:3,FOREX:4,STOCKS:5,OTHER:6};
  const pool=all.filter(x=>[1,2,4].includes(Number(x.tradeMode))).sort((a,b)=>(priority[a.category]??9)-(priority[b.category]??9));
  const selected=pool.slice(0,90),states={},nowSec=Math.floor(Date.now()/1000);
  for(let i=0;i<selected.length;i+=30){
   const batch=selected.slice(i,i+30);
   const snap=await brokerGet("/snapshot",{symbols:batch.map(x=>x.name).join(",")},18000,1);
   for(const x of batch){
    const v=verifyOnline(x,snap.data?.[x.name],snap.ts,nowSec,offset);
    states[x.name]=v;
   }
  }
  const utcDay=new Date(nowSec*1000).getUTCDay(),weekendUTC=utcDay===0||utcDay===6;
  const verified=selected.filter(x=>states[x.name]?.verifiedNow).map(x=>x.name);
  return res.status(200).json({ok:true,source:"VANTAGE_MT5_TICK_AND_TRADE_MODE",asOfUTC:new Date(nowSec*1000).toISOString(),
    verified,market24hWeekendVerified:weekendUTC?verified:[],states,sampled:selected.length,catalogCount:all.length,
    partialCoverage:selected.length<pool.length,coverageNote:"90 tradable catalog symbols sampled in category priority; unsampled symbols are UNKNOWN, never presumed offline or 24/7.",
    definition:"ONLINE = exact resolved broker symbol + tradable tradeMode + fresh BID/ASK tick <=35s. 24H weekend verification confirms ACTIVE NOW during weekend only, not a contractual 24/7 guarantee."});
 }catch(e){return res.status(200).json({ok:false,status:"MARKET_SCAN_UNAVAILABLE",verified:[],sampled:0,errorCode:String(e?.code||"BROKER_UNAVAILABLE")})}
}
