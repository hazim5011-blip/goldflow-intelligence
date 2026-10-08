// New additive read-only GF AI/News/Study API. Old six engines + Fund104 are untouched.
import {bridgeConfigured,brokerGet,vantageBrokerUtcOffsetSeconds} from "./_broker.js";
import macroHandler from "./macro.js";
import {evaluateStudy,TF_SECONDS} from "./_studyEngine.js";
import {evaluateAILive} from "./_aiLiveEngine.js";
import {evaluateMarketStudy} from "./_marketStudyEngine.js";
import {enforceGFTradePlan} from "./_gfTradePlan.js";
import {forwardConfigured,normalizePublishedPayload,storePublished,listForwardPrivate,normalizeOutcomePayload,storeOutcome} from "./_v8Ledger.js";
import {replayOutcome} from "./_v8Core.js";

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
const GF_MODE_ID={ai:"gf-ai",news:"gf-news",study:"gf-study"};
function closedUtcBars(raw,tf,offset,nowSec){
 const sec=TF_SECONDS[tf]||300;
 return (Array.isArray(raw)?raw:[]).map(b=>({t:Number(b.t)-offset,o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:Number(b.v||0)}))
  .filter(b=>[b.t,b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.h>=b.l&&b.t+sec<=nowSec-1)
  .sort((a,b)=>a.t-b.t);
}
function samePlan(a,p){
 const tol=Math.max(1e-9,Math.abs(Number(p.entryHigh)-Number(p.entryLow))*.08);
 return Number(a.direction)===Number(p.direction)&&Math.abs(Number(a.originalSL)-Number(p.sl))<=tol&&Math.abs(Number(a.tp1)-Number(p.tp1))<=tol;
}
async function archiveAndSettleGF(output,mode,bridge,tf,offset,nowSec){
 const indicator=GF_MODE_ID[mode];
 if(!indicator||!forwardConfigured())return {configured:false,status:"FORWARD_ARCHIVE_NOT_CONFIGURED"};
 const tradePlan=output?.tradePlan,raw=bridge.frames?.[tf]||[],closed=closedUtcBars(raw,tf,offset,nowSec);
 if(closed.length<25)return {configured:true,status:"WAIT_ARCHIVE_CANDLES"};
 let pairs=[];
 try{pairs=await listForwardPrivate({indicator,symbol:bridge.symbol,tf,limit:80})}catch{}
 let publishedNow=false,signalId=null;
 if(output?.canEnter===true&&tradePlan?.valid){
  const exists=pairs.some(x=>!x.outcome&&samePlan(x.published,tradePlan));
  if(!exists){
   const entry=(Number(tradePlan.entryLow)+Number(tradePlan.entryHigh))/2;
   const payload={symbolResolved:bridge.symbol,brokerServer:bridge.server||null,indicatorId:indicator,
    indicatorVersion:String(output.engine||indicator),engineBuildHash:String(output.engine||indicator),tf,
    direction:tradePlan.direction,signalCandleCloseUTC:output.closedAtUTC,entry,originalSL:tradePlan.sl,
    tp1:tradePlan.tp1,tp2:tradePlan.tp2,tp3:tradePlan.tp3,score:tradePlan.score,
    reasons:[...(tradePlan.reasons||[]),"Forward archive records ENTRY READY decision; no broker order is placed."],
    zone:{tf,low:tradePlan.entryLow,high:tradePlan.entryHigh,source:tradePlan.entryMethod||tradePlan.confirmationType||indicator},
    spec:{point:bridge.point,digits:bridge.digits},closedCandles:closed.slice(-160)};
   try{
    const normalized=normalizePublishedPayload(payload,new Date(nowSec*1000));
    await storePublished(normalized);publishedNow=true;signalId=normalized.signalId;
    pairs=await listForwardPrivate({indicator,symbol:bridge.symbol,tf,limit:80}).catch(()=>pairs);
   }catch(e){
    if(!/duplicate|already.exists|immutable|overwrite|409|conflict/i.test(String(e?.message||e)))throw e;
   }
  }
 }
 const replayBars=(Array.isArray(raw)?raw:[]).map(b=>({t:Number(b.t)-offset,o:Number(b.o),h:Number(b.h),l:Number(b.l),c:Number(b.c),v:Number(b.v||0)}))
  .filter(b=>[b.t,b.o,b.h,b.l,b.c].every(Number.isFinite)&&b.h>=b.l).sort((a,b)=>a.t-b.t);
 let settled=0;
 for(const pair of pairs){
  if(pair.outcome)continue;
  const p=pair.published,close=Math.floor(Date.parse(p.signalCandleCloseUTC)/1000);
  if(!Number.isFinite(close))continue;
  const sig={time:close-(TF_SECONDS[tf]||300),closeTime:close,direction:p.direction,entry:p.entry,originalSL:p.originalSL,
   invalidation:p.originalSL,tp1:p.tp1,tp2:p.tp2,tp3:p.tp3,lockedTradePlan:true};
  const out=replayOutcome(sig,replayBars,tf,indicator);
  if(!["TP1","TP2","TP3","TRAILING","BE_POSITIVE","BE_ZERO","SL"].includes(out.outcome))continue;
  try{
   const event=normalizeOutcomePayload({date:p.receivedAtUTC.slice(0,10),signalId:p.signalId,outcome:out.outcome,
    exitPrice:out.exitPrice,exitTimeUTC:out.exitTimeUTC,exitRule:out.exitRule},p,new Date(nowSec*1000));
   await storeOutcome(event);settled++;
  }catch(e){
   if(!/already.exists|already_exists|immutable|overwrite|409|conflict/i.test(String(e?.message||e)))throw e;
  }
 }
 return {configured:true,status:publishedNow?"FORWARD_SIGNAL_ARCHIVED":"FORWARD_ARCHIVE_ACTIVE",signalId,settled};
}
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
   brokerGet("/multi-bars",{symbol,tfs:frames.join(","),limits:frames.map(limitFor).join(",")},18000,2),
   /^(XAU|GOLD)/i.test(symbol)?macroSnapshot().catch(()=>null):Promise.resolve(null)
  ]);
  const nowSec=Math.floor(Date.now()/1000);
  const evaluator=mode==="ai"?evaluateAILive:mode==="study"?evaluateMarketStudy:evaluateStudy;
  const output=evaluator({symbol:bridge.symbol||symbol,tf,mode,bars:bridge.frames?.[tf]||[],
   h1:bridge.frames?.H1||[],h4:bridge.frames?.H4||[],frames:mode==="ai"?(bridge.frames||{}):undefined,
   quote:{bid:bridge.bid,ask:bridge.ask,tickTime:bridge.serverTime,observedAt:nowSec},
   offsetSeconds:offset,macro,nowSec});
  const safeOutput=enforceGFTradePlan(output,GF_MODE_ID[mode]);
  const archive=await archiveAndSettleGF(safeOutput,mode,bridge,tf,offset,nowSec).catch(e=>({configured:forwardConfigured(),status:"FORWARD_ARCHIVE_ERROR",errorCode:String(e?.message||e).slice(0,80)}));
  const publicMacro=macro?{fetchedAtUTC:macro.fetchedAt,quality:macro.quality,gold:macro.gold,
   cards:(macro.cards||[]).filter(c=>NEWS_DRIVER_IDS.includes(c.id)).map(c=>({id:c.id,name:c.name,display:c.display,value:c.value,date:c.date,status:c.status,source:c.source,stale:c.stale,goldImpact:c.goldImpact,change:c.change,changeLabel:c.changeLabel,detail:c.detail}))}:null;
  return res.status(200).json({...safeOutput,source:"VANTAGE_MT5",marketResearchOnly:true,autoTrading:false,forwardArchive:archive,news:publicMacro,
   chartBars:(bridge.frames?.[tf]||[]).slice(-160).map(b=>({t:Number(b.t)-offset,o:b.o,h:b.h,l:b.l,c:b.c})),
   limitation:mode==="ai"?"GF-AI v1.60 reads current Vantage closed-candle motion and separates thesis from entry. A zone touch is not enough: a setup-specific CLOSED retest/rejection/reclaim and anti-chase execution band are required before ENTRY READY. HOLD/PROTECT/CUT/RECOVERY remains active after entry. No full-margin/martingale automation or broker execution.":"Mode-specific auditable research. No verified publication timestamp, forecast surprise, intrabar fill or ML-trained win probability."});
 }catch(e){
  return res.status(200).json({ok:false,status:"DATA_UNVERIFIED",reason:"BROKER_DATA_UNAVAILABLE",errorCode:String(e?.code||"FETCH_FAILED"),
    marketResearchOnly:true,autoTrading:false});
 }
}
