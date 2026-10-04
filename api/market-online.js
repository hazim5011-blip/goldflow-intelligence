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
  // The scan prioritizes likely 24/7 instruments, but ALL sampled symbols still need fresh ticks.
  const priority={SYNTHETIC:0,OTHER:1,INDICES:2,CRYPTO:3,ENERGY:4,METALS:5,FOREX:6,STOCKS:7};
  // NO 90-symbol cap: previously crypto exhausted the whole sample and hid
  // other live classes. Inspect EVERY exact tradable broker catalog symbol.
  const pool=all.filter(x=>[1,2,4].includes(Number(x.tradeMode)))
    .sort((a,b)=>(priority[a.category]??9)-(priority[b.category]??9)||a.name.localeCompare(b.name));
  const states={},nowSec=Math.floor(Date.now()/1000),batchSize=42,batches=[];
  for(let i=0;i<pool.length;i+=batchSize)batches.push(pool.slice(i,i+batchSize));
  let cursor=0,successful=0;const scanErrors=[];
  async function worker(){
   while(cursor<batches.length){
    const idx=cursor++,batch=batches[idx];
    try{
     const snap=await brokerGet("/snapshot",{symbols:batch.map(x=>x.name).join(",")},16000,1);
     for(const x of batch){states[x.name]=verifyOnline(x,snap.data?.[x.name],snap.ts,nowSec,offset);successful++}
    }catch{
     // Failed scans are UNKNOWN, NEVER falsely labelled OFFLINE.
     for(const x of batch)states[x.name]={status:"UNKNOWN",verifiedNow:false,quoteAgeSeconds:null};
     scanErrors.push({batchIndex:idx,symbolCount:batch.length,error:"BROKER_SNAPSHOT_UNAVAILABLE"});
    }
   }
  }
  await Promise.all(Array.from({length:Math.min(3,batches.length)},()=>worker()));
  const mytDay=new Date((nowSec+8*3600)*1000).getUTCDay(),weekendMYT=mytDay===0||mytDay===6;
  const verified=pool.filter(x=>states[x.name]?.verifiedNow).map(x=>x.name);
  const byCategory={};for(const x of pool){if(!byCategory[x.category])byCategory[x.category]={catalogTradable:0,verifiedOnline:0,unknown:0};
   byCategory[x.category].catalogTradable++;
   if(states[x.name]?.verifiedNow)byCategory[x.category].verifiedOnline++;
   if(states[x.name]?.status==="UNKNOWN")byCategory[x.category].unknown++;
  }
  const requested=["VOL80","STEP0.5"];
  const matchingSynthetic=pool.filter(x=>x.category==="SYNTHETIC")
   .map(x=>({symbol:x.name,status:states[x.name]?.status||"UNKNOWN",online:!!states[x.name]?.verifiedNow}));
  return res.status(200).json({ok:true,source:"VANTAGE_MT5_TICK_AND_TRADE_MODE",asOfUTC:new Date(nowSec*1000).toISOString(),
    verified,market24hWeekendVerified:weekendMYT?verified:[],states,sampled:successful,attempted:pool.length,tradableCatalogCount:pool.length,catalogCount:all.length,
    byCategory,syntheticSamples:matchingSynthetic,
    examplesNotListed:requested.filter(name=>!all.some(x=>x.name.toUpperCase()===name)),
    scanErrors,partialCoverage:successful<pool.length,coverageNote:"Full tradable catalog was attempted with bounded batches; failed/unknown symbols are NOT reported offline or permanently 24/7. Exact symbol and fresh tick required.",
    definition:"ONLINE = exact resolved broker symbol + tradable tradeMode + fresh BID/ASK tick <=35s. 24H weekend verification confirms ACTIVE NOW during weekend only, not a contractual 24/7 guarantee."});
 }catch(e){return res.status(200).json({ok:false,status:"MARKET_SCAN_UNAVAILABLE",verified:[],sampled:0,errorCode:String(e?.code||"BROKER_UNAVAILABLE")})}
}
