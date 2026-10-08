import {bridgeConfigured,brokerGet,apiError,vantageBrokerUtcOffsetSeconds} from "./_broker.js";
import {runIndicator as run105} from "./_indicator105.js";
import {runIndicator as run103} from "./_indicator103.js";
import {runPVT} from "./_indicatorPVT102.js";
import {runPVTChart101} from "./_indicatorPVTChart101.js";
import {runIndicator as runOWL101} from "./_indicatorOWL101.js";
import {runPattern132} from "./_indicatorPattern132.js";
import {runPattern132AutoFibo} from "./_pattern132AutoFibo.js";
import {buildPattern132FiboSndConfluence} from "./_pattern132FiboSndConfluence.js";
import {runSND107} from "./_indicatorSND107.js";
import {runFund104} from "./_indicatorFund104.js";

const PROFILE={
  M1:["M1","M5","M15"],
  M5:["M5","M15","H1"],
  M15:["M15","M30","H4"],
  M30:["M30","H1","H4"],
  H1:["H1","H4","D1"],
  H4:["H4","D1","W1"],
  D1:["D1","W1","MN1"]
};

const NEXT={M1:"M5",M5:"M15",M15:"M30",M30:"H1",H1:"H4",H4:"D1",D1:"W1",W1:"MN1",MN1:"MN1"};
const BAR_LIMIT={M1:1400,M5:1100,M15:950,M30:850,H1:750,H4:550,D1:420,W1:320,MN1:220};
// Extended History is requested ONLY when a user opens a V8 research tab; normal V7.5 dashboard stays lightweight.
const V8_HISTORY_LIMIT={M1:5000,M5:5000,M15:5000,M30:4500,H1:3000,H4:1600,D1:800};

function patternProfile(tf){
  if(tf==="M1"||tf==="M5") return [tf,"M15","H1"];
  if(tf==="M15") return [tf,"H1","H4"];
  if(tf==="M30"||tf==="H1") return [tf,"H4","D1"];
  if(tf==="H4") return [tf,"D1","W1"];
  if(tf==="D1") return [tf,"W1","MN1"];
  return PROFILE[tf]||[tf,NEXT[tf]||"H1",NEXT[NEXT[tf]]||"H4"];
}
function sndProfile(sourceTF){
  let bias="M15";
  if(sourceTF==="M15"||sourceTF==="M30") bias="H1";
  else if(sourceTF==="H1") bias="H4";
  else if(sourceTF==="H4") bias="D1";
  else if(sourceTF==="D1") bias="W1";
  return ["M1",sourceTF,bias];
}
function resolveProfile(tf,mode){
  if(mode==="pvtchart101"||mode==="pvt-chart-101")return [tf,tf,tf];
  if(mode==="fund104"||mode==="fundstructure"||mode==="1.04")return [tf,"H1","H4"];
  if(mode==="pattern132"||mode==="pattern"||mode==="1.32") return patternProfile(tf);
  if(mode==="snd107"||mode==="snd"||mode==="1.07") return sndProfile(tf);
  return PROFILE[tf];
}

async function fetchFrames(symbol,frames,historyMode=false){
  const unique=[...new Set(frames.filter(Boolean))];
  const trigger=frames[0];
  const limits=unique.map(tf=>historyMode&&tf===trigger?(V8_HISTORY_LIMIT[tf]||BAR_LIMIT[tf]||500):(BAR_LIMIT[tf]||500));
  try{
    const batch=await brokerGet("/multi-bars",{symbol,tfs:unique.join(","),limits:limits.join(",")},historyMode?25000:15000,2);
    return {
      meta:{symbol:batch.symbol,broker:batch.broker,server:batch.server,bid:batch.bid,ask:batch.ask,spread:batch.spread,digits:batch.digits,point:batch.point,serverTime:batch.serverTime},
      frames:batch.frames||{}
    };
  }catch(batchErr){
    const msg=String(batchErr?.message||batchErr);
    if(!/404|Not Found|detail|multi-bars/i.test(msg)) throw batchErr;
    const rows=await Promise.all(unique.map((tf,i)=>brokerGet("/bars",{symbol,tf,limit:limits[i]},18000,2)));
    const map={};for(let i=0;i<unique.length;i++)map[unique[i]]=rows[i].bars||[];
    const first=rows[0]||{};
    return {meta:{symbol:first.symbol,broker:first.broker,server:first.server,bid:first.bid,ask:first.ask,spread:first.spread,digits:first.digits,point:first.point,serverTime:first.serverTime},frames:map};
  }
}

export default async function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  const extended=String(req.query?.history||"")==="1";
  res.setHeader("Cache-Control",extended?"s-maxage=90, stale-while-revalidate=120":"s-maxage=5, stale-while-revalidate=5");
  if(!bridgeConfigured()) return res.status(200).json({ok:false,ready:false,bridgeConfigured:false,error:"BROKER_BRIDGE_URL_NOT_CONFIGURED"});

  const symbol=String(req.query?.symbol||"").trim();
  const selectedTF=String(req.query?.tf||"M5").toUpperCase();
  const indicatorMode=String(req.query?.indicator||"105").toLowerCase();
  if(!symbol) return res.status(400).json({ok:false,error:"symbol required"});
  if(!PROFILE[selectedTF]) return res.status(400).json({ok:false,error:"unsupported tf"});

  const [tTF,sTF,bTF]=resolveProfile(selectedTF,indicatorMode);
  const extra=(indicatorMode==="snd107"||indicatorMode==="snd"||indicatorMode==="1.07")?["M5","M15"]:[];
  try{
    const data=await fetchFrames(symbol,[tTF,sTF,bTF,...extra],extended);
    const bars=tf=>data.frames?.[tf]||[];
    const meta=data.meta||{};
    let indicator;

    if(indicatorMode==="pvtchart101"||indicatorMode==="pvt-chart-101"){
      indicator=runPVTChart101({triggerBars:bars(tTF),triggerTF:tTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }else if(indicatorMode==="fund104"||indicatorMode==="fundstructure"||indicatorMode==="1.04"){
      indicator=runFund104({triggerBars:bars(tTF),setupBars:bars(sTF),biasBars:bars(bTF),triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }else if(indicatorMode==="pvt"||indicatorMode==="pvt102"){
      indicator=runPVT({triggerBars:bars(tTF),triggerTF:tTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }else if(indicatorMode==="103"||indicatorMode==="1.03"){
      indicator=run103({triggerBars:bars(tTF),setupBars:bars(sTF),biasBars:bars(bTF),triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }else if(indicatorMode==="owl101"||indicatorMode==="owl"||indicatorMode==="1.01"){
      indicator=runOWL101({triggerBars:bars(tTF),setupBars:bars(sTF),biasBars:bars(bTF),triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }else if(indicatorMode==="pattern132"||indicatorMode==="pattern"||indicatorMode==="1.32"){
      const pattern=runPattern132({triggerBars:bars(tTF),setupBars:bars(sTF),biasBars:bars(bTF),triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:meta.symbol||symbol,point:meta.point||0});
      const autoFibo=runPattern132AutoFibo({bars:bars(tTF)});
      const fiboSnd=buildPattern132FiboSndConfluence({activeZones:pattern.activeZones,autoFibo,point:meta.point||0});
      const {activeZones:confluenceZones,...fiboSndMeta}=fiboSnd;
      indicator={...pattern,activeZones:confluenceZones,autoFibo,fiboSndConfluence:fiboSndMeta,entryMode:"SND_FIBO_CONFLUENCE"};
    }else if(indicatorMode==="snd107"||indicatorMode==="snd"||indicatorMode==="1.07"){
      indicator=runSND107({triggerBars:bars(tTF),setupBars:bars(sTF),biasBars:bars(bTF),m5Bars:bars("M5"),m15Bars:bars("M15"),triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }else{
      indicator=run105({triggerBars:bars(tTF),setupBars:bars(sTF),biasBars:bars(bTF),triggerTF:tTF,setupTF:sTF,biasTF:bTF,symbol:meta.symbol||symbol,point:meta.point||0});
    }

    const now=Math.floor(Date.now()/1000);
    const primaryBars=bars(tTF);
    const last=primaryBars?.at(-1)?.t||null;
    const brokerUTCOffsetSeconds=vantageBrokerUtcOffsetSeconds();
    const lastUTC=last!=null&&brokerUTCOffsetSeconds!==null?last-brokerUTCOffsetSeconds:null;
    const rawAgeMin=lastUTC!=null?(now-lastUTC)/60:null;
    const ageMin=rawAgeMin!=null?Math.max(0,rawAgeMin):null;
    const tfMin={M1:1,M5:5,M15:15,M30:30,H1:60,H4:240,D1:1440,W1:10080,MN1:43200};
    const marketState=brokerUTCOffsetSeconds===null?"MT5_CLOCK_UNVERIFIED":rawAgeMin<-2?"MT5_CLOCK_MISMATCH":
      ageMin>Math.max(3,(tfMin[tTF]||5)*3)?"MT5_STALE":"MT5_LIVE";

    return res.status(200).json({
      ok:true,ready:indicator.ready,bridgeConfigured:true,source:"MT5_BRIDGE",
      requested:symbol,symbol:meta.symbol||symbol,broker:meta.broker||"Vantage",brokerServer:meta.server||null,indicatorMode,selectedTF,
      triggerTF:tTF,setupTF:sTF,biasTF:bTF,
      tick:{bid:meta.bid??null,ask:meta.ask??null,spread:meta.spread??null},
      price:meta.bid??primaryBars?.at(-1)?.c??null,digits:meta.digits??null,point:meta.point??null,
      serverTime:meta.serverTime??null,lastBarTime:last,
      lastBarTimeUTC:lastUTC!=null?new Date(lastUTC*1000).toISOString():null,
      brokerServerUTCOffsetSeconds:brokerUTCOffsetSeconds,ageMin,marketState,
      indicator,
      chartBars:(primaryBars||[]).slice(-500),
      // V8 internal history route requests the complete fetched trigger window for OHLC replay.
      historyBars:extended ? (primaryBars||[]).slice(-5000) : undefined
    });
  }catch(e){
    res.setHeader("Cache-Control","no-store");
    return apiError(res,e,200,{ready:false,symbol,triggerTF:tTF,selectedTF,bridgeConfigured:true});
  }
}
