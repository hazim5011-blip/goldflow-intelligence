// New additive read-only GF AI/News/Study API. Old six engines + Fund104 are untouched.
import {bridgeConfigured,brokerGet,vantageBrokerUtcOffsetSeconds} from "./_broker.js";
import macroHandler from "./macro.js";
import {evaluateStudy,TF_SECONDS} from "./_studyEngine.js";
import {evaluateAILive} from "./_aiLiveEngine.js";
import {evaluateMarketStudy} from "./_marketStudyEngine.js";

const memo={time:0,value:null,pending:null};
function capture(){let status=200,body=null;const res={setHeader(){return res},status(v){status=v;return res},json(x){body=x;return res},end(){return res}};return {res,get:()=>({status,body})}}
async function macroSnapshot(){
 if(memo.value&&Date.now()-memo.time<180000)return memo.value;
 if(memo.pending)return memo.pending;
 memo.pending=(async()=>{const cap=capture();await macroHandler({method:"GET",query:{}},cap.res);
   const {body}=cap.get();return body?.ok?body:null})();
 try{const data=await memo.pending;if(data){memo.value=data;memo.time=Date.now()}return data}finally{memo.pending=null}
}
const allowed=/^[A-Za-z0-9._#-]{1,42}$/;
const NEWS_DRIVER_IDS=["CPI","FEDUPPER","US2Y","US10Y","REAL10Y","USDBROAD","NETLIQ"];
const side=n=>Number(n)>0?"BUY":Number(n)<0?"SELL":"NEUTRAL";
export function buildNewsDecision(output,macro){
  if(!output||output.mode!=="news")return null;
  const gold=macro?.gold||{},bias=String(gold.bias||"UNAVAILABLE"),score=Number.isFinite(Number(gold.score))?Number(gold.score):null;
  const macroDir=bias==="PRESSURE"?-1:bias==="SUPPORTIVE"?1:0;
  const technicalDir=Number(output.confirmation?.direction)||Number(output.direction)||0;
  const technicalSide=side(technicalDir),macroSide=macroDir<0?"SELL PRESSURE":macroDir>0?"BUY SUPPORT":"MIXED / NEUTRAL";
  const drivers=(macro?.cards||[]).filter(c=>NEWS_DRIVER_IDS.includes(c.id)).map(c=>({
    id:c.id,name:c.name||c.id,display:c.display||null,period:c.date||null,status:c.status||"UNKNOWN",
    impact:c.goldImpact||"MIXED",change:Number.isFinite(Number(c.change))?Number(c.change):null,
    changeLabel:c.changeLabel||null,detail:c.detail||null,source:c.source||null
  }));
  const pressure=drivers.filter(x=>x.impact==="PRESSURE"),support=drivers.filter(x=>x.impact==="SUPPORTIVE");
  const trigger=output.confirmation?.confirmationType||null,h1=side(output.h1Trend),h4=side(output.h4Trend);
  let headline="WHY WAIT • NO VERIFIED DIRECTION",summary="No fresh technical direction is confirmed. Macro context alone is not an entry signal.",decision="WAIT";
  if(["MARKET_OFFLINE","DATA_UNVERIFIED","BRIDGE_OFF"].includes(String(output.status||""))){
    headline="WHY NO ENTRY • DATA NOT VERIFIED";summary="Broker or required source data is not fresh enough. BUY/SELL reasoning is withheld until verified data returns.";decision="NO_ENTRY";
  }else if(technicalDir&&macroDir&&technicalDir!==macroDir){
    headline="WHY WAIT • TECHNICAL "+technicalSide+" vs MACRO "+macroSide;
    summary="A "+technicalSide+" technical candidate exists, but verified derived Gold macro points the opposite way ("+macroSide+"). The News Impact policy blocks the candidate. This is NOT an automatic "+(macroDir>0?"BUY":"SELL")+" entry; an opposite closed-candle confirmation is still required.";
    decision="WAIT_CONFLICT";
  }else if(output.canEnter&&technicalDir){
    headline="WHY "+technicalSide+" • TECHNICAL + MACRO CONDITIONS PASSED";
    summary=technicalSide+" is permitted because a fresh closed-candle technical confirmation is valid, the broker quote is inside its entry band, and verified Gold macro does not oppose it"+(macroDir===technicalDir?" (macro agrees: "+macroSide+")":"")+".";
    decision=technicalSide+"_ENTRY_READY";
  }else if(technicalDir&&String(output.status||"").includes("CONFIRMED")){
    headline="WHY "+technicalSide+" BIAS • WAIT RETEST";
    summary=technicalSide+" direction is technically confirmed"+(macroDir===technicalDir?" and macro agrees ("+macroSide+")":"")+", but price is not yet inside the verified entry band. Do not chase; wait for the retest.";
    decision=technicalSide+"_CONFIRMED_WAIT_RETEST";
  }else if(macroDir){
    headline="WHY WAIT • MACRO "+macroSide+" BUT NO CLOSED-CANDLE ENTRY";
    summary="Verified derived Gold macro currently gives "+macroSide+", but macro context alone cannot create an entry. A matching closed-candle technical trigger and valid broker entry zone are still required.";
    decision="WAIT_TECHNICAL_CONFIRMATION";
  }
  const technicalReasons=["Technical side: "+technicalSide,"H1: "+h1+" • H4: "+h4,
    trigger?"Closed-candle trigger: "+trigger:"Closed-candle trigger: NONE",
    output.confirmation?"Entry band: "+output.confirmation.entryLow+" — "+output.confirmation.entryHigh:null,
    "Engine state: "+String(output.status||"DATA_UNVERIFIED").replaceAll("_"," ")].filter(Boolean);
  const macroReasons=["Derived Gold macro: "+bias+(score===null?"":" • score "+score+"/100 (not win probability)"),
    ...(bias==="PRESSURE"?pressure:bias==="SUPPORTIVE"?support:drivers.filter(x=>x.impact!=="MIXED")).slice(0,5).map(x=>
      x.name+": "+(x.display||"N/A")+" • "+x.impact+" in GoldFlow macro model"+(x.changeLabel?" • "+x.changeLabel:""))];
  return {headline,decision,summary,technicalSide,macroSide,macroBias:bias,macroScore:score,
    technicalReasons,macroReasons,drivers,pressureDrivers:pressure,supportiveDrivers:support,
    disclaimer:"Macro driver labels are derived context from official observations, not a verified event surprise or guaranteed price direction."};
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method==="OPTIONS")return res.status(204).end();
 if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
 const symbol=String(req.query?.symbol||"XAUUSD247"),tf=String(req.query?.tf||"M15").toUpperCase(),mode=String(req.query?.mode||"ai").toLowerCase();
 if(!allowed.test(symbol)||!TF_SECONDS[tf]||!["ai","study","news"].includes(mode))return res.status(400).json({ok:false,error:"INVALID_STUDY_INPUT"});
 if(!bridgeConfigured())return res.status(200).json({ok:false,status:"BRIDGE_OFF",error:"BROKER_NOT_CONFIGURED"});
 const offset=vantageBrokerUtcOffsetSeconds();
 if(offset===null)return res.status(200).json({ok:false,status:"DATA_UNVERIFIED",error:"BROKER_UTC_OFFSET_UNVERIFIED"});
 try{
  const allAiFrames=["M1","M5","M15","M30","H1","H4","D1"];
  const frames=mode==="ai"?allAiFrames:[...new Set([tf,"H1","H4"])];
  const limitFor=f=>mode==="ai"?(f===tf?240:["M1","M5"].includes(f)?220:["M15","M30","H1"].includes(f)?190:150):(f===tf?180:100);
  const [bridge,macro]=await Promise.all([
   brokerGet("/multi-bars",{symbol,tfs:frames.join(","),limits:frames.map(limitFor).join(",")},30000,2),
   /^(XAU|GOLD)/i.test(symbol)?macroSnapshot().catch(()=>null):Promise.resolve(null)
  ]);
  const nowSec=Math.floor(Date.now()/1000);
  const evaluator=mode==="ai"?evaluateAILive:mode==="study"?evaluateMarketStudy:evaluateStudy;
  const output=evaluator({symbol:bridge.symbol||symbol,tf,mode,bars:bridge.frames?.[tf]||[],
   h1:bridge.frames?.H1||[],h4:bridge.frames?.H4||[],frames:mode==="ai"?(bridge.frames||{}):undefined,
   quote:{bid:bridge.bid,ask:bridge.ask,tickTime:bridge.serverTime,observedAt:nowSec},
   offsetSeconds:offset,macro,nowSec});
  const publicMacro=macro?{fetchedAtUTC:macro.fetchedAt,quality:macro.quality,gold:macro.gold,
   cards:(macro.cards||[]).filter(c=>NEWS_DRIVER_IDS.includes(c.id)).map(c=>({id:c.id,name:c.name,display:c.display,value:c.value,date:c.date,status:c.status,source:c.source,stale:c.stale,goldImpact:c.goldImpact,change:c.change,changeLabel:c.changeLabel,detail:c.detail}))}:null;
  return res.status(200).json({...output,source:"VANTAGE_MT5",marketResearchOnly:true,autoTrading:false,news:publicMacro,
   chartBars:(bridge.frames?.[tf]||[]).slice(-160).map(b=>({t:Number(b.t)-offset,o:b.o,h:b.h,l:b.l,c:b.c})),
   limitation:mode==="ai"?"GF-AI v1.40 reads M1/M5/M15/M30/H1/H4/D1 Vantage closed candles using a professional hierarchy: D1/H4 regime, H1/M30 thesis, M15/M5 setup, M1 precision. One parent Trade Idea spans lower-TF confirmations. No trained-ML probability or automatic execution.":"Mode-specific auditable research. No verified publication timestamp, forecast surprise, intrabar fill or ML-trained win probability."});
 }catch(e){
  return res.status(200).json({ok:false,status:"DATA_UNVERIFIED",reason:"BROKER_DATA_UNAVAILABLE",errorCode:String(e?.code||"FETCH_FAILED"),
    marketResearchOnly:true,autoTrading:false});
 }
}
