// New additive read-only GF AI/News/Study API. Old six engines + Fund104 are untouched.
import {bridgeConfigured,brokerGet,vantageBrokerUtcOffsetSeconds} from "./_broker.js";
import macroHandler from "./macro.js";
import {evaluateStudy,TF_SECONDS} from "./_studyEngine.js";

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
  const frames=[...new Set([tf,"H1","H4"])];
  const [bridge,macro]=await Promise.all([
   brokerGet("/multi-bars",{symbol,tfs:frames.join(","),limits:frames.map(f=>f===tf?180:100).join(",")},25000,2),
   /^(XAU|GOLD)/i.test(symbol)&&mode!=="study"?macroSnapshot().catch(()=>null):Promise.resolve(null)
  ]);
  const nowSec=Math.floor(Date.now()/1000);
  const output=evaluateStudy({symbol:bridge.symbol||symbol,tf,mode,bars:bridge.frames?.[tf]||[],
   h1:bridge.frames?.H1||[],h4:bridge.frames?.H4||[],
   quote:{bid:bridge.bid,ask:bridge.ask,tickTime:bridge.serverTime,observedAt:nowSec},
   offsetSeconds:offset,macro,nowSec});
  const publicMacro=mode!=="study"&&macro?{fetchedAtUTC:macro.fetchedAt,quality:macro.quality,gold:macro.gold,
   cards:(macro.cards||[]).filter(c=>["CPI","FEDUPPER","US2Y","US10Y","REAL10Y","USDBROAD","NETLIQ"].includes(c.id)).map(c=>({id:c.id,name:c.name,display:c.display,value:c.value,date:c.date,status:c.status,source:c.source,stale:c.stale}))}:null;
  return res.status(200).json({...output,source:"VANTAGE_MT5",marketResearchOnly:true,autoTrading:false,news:publicMacro,
   chartBars:(bridge.frames?.[tf]||[]).slice(-160).map(b=>({t:Number(b.t)-offset,o:b.o,h:b.h,l:b.l,c:b.c})),
   limitation:"No verified release timestamp/consensus surprise or intrabar fill proof. This is a rule-based confluence study, not ML-trained prediction."});
 }catch(e){
  return res.status(200).json({ok:false,status:"DATA_UNVERIFIED",reason:"BROKER_DATA_UNAVAILABLE",errorCode:String(e?.code||"FETCH_FAILED"),
    marketResearchOnly:true,autoTrading:false});
 }
}
