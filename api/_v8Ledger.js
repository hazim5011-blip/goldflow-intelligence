import {createHash,timingSafeEqual} from "node:crypto";
const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
const INDICATORS=new Set(["105","103","pvt","pattern132","snd107","owl101"]);
const xnum=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const sha256=s=>createHash("sha256").update(s).digest("hex");
const timeIso=()=>new Date().toISOString();
const matchSafe=/^[A-Za-z0-9._#-]{1,42}$/;
export function forwardConfigured(){return Boolean(process.env.BLOB_READ_WRITE_TOKEN&&String(process.env.FORWARD_INGEST_SECRET||"").length>=32);}
export function publicReadEnabled(){return forwardConfigured()&&process.env.FORWARD_PUBLIC_READ==="true";}
export function validateSecret(input){
 const expected=process.env.FORWARD_INGEST_SECRET;
 if(!expected||expected.length<32||typeof input!=="string")return false;
 const a=createHash("sha256").update(input).digest(),b=createHash("sha256").update(expected).digest();
 return timingSafeEqual(a,b);
}
export function normalizePublishedPayload(body,now=new Date()){
 if(!body||typeof body!=="object"||Array.isArray(body)||JSON.stringify(body).length>250000)throw Error("INVALID_OR_OVERSIZED_PAYLOAD");
 const symbol=String(body.symbolResolved||""),indicator=String(body.indicatorId||"").toLowerCase(),tf=String(body.tf||"").toUpperCase();
 if(!matchSafe.test(symbol)||!INDICATORS.has(indicator)||!TF_SECONDS[tf])throw Error("INVALID_SYMBOL_INDICATOR_OR_TF");
 const direction=Number(body.direction),entry=xnum(body.entry),sl=xnum(body.originalSL),tp1=xnum(body.tp1);
 const validationOnly=indicator==="pattern132"||indicator==="snd107";
 if(![-1,1].includes(direction)||entry==null||sl==null||direction*(entry-sl)<=0||
    (!validationOnly&&(tp1==null||direction*(tp1-entry)<=0))||
    (validationOnly&&tp1!=null&&direction*(tp1-entry)<=0))throw Error("INVALID_TRADE_PLAN");
 const close=Date.parse(String(body.signalCandleCloseUTC||""));
 const maxDelay=Math.min(30*60000,Math.max(3*60000,TF_SECONDS[tf]*1000*.2));
 if(!Number.isFinite(close)||now.getTime()-close>maxDelay||close-now.getTime()>90*1000)throw Error("SIGNAL_NOT_CONTEMPORANEOUS");
 const candles=body.closedCandles;
 if(!Array.isArray(candles)||candles.length<25||candles.length>160)throw Error("INVALID_ARCHIVED_CANDLE_COUNT");
 let prev=-1;
 const archived=candles.map(c=>{
  const t=xnum(c?.t),o=xnum(c?.o),h=xnum(c?.h),l=xnum(c?.l),z=xnum(c?.c),v=xnum(c?.v);
  if(t==null||o==null||h==null||l==null||z==null||h<l||h<Math.max(o,z)||l>Math.min(o,z)||
     t<=prev||(t+TF_SECONDS[tf])*1000>now.getTime()+90000)throw Error("INVALID_OR_FUTURE_CANDLE");
  prev=t;return {t,o,h,l,c:z,v:v==null?null:v};
 });
 if(Math.abs((archived.at(-1).t+TF_SECONDS[tf])*1000-close)>90000)throw Error("LAST_CANDLE_NOT_SIGNAL_CLOSE");
 const reasons=Array.isArray(body.reasons)?body.reasons.slice(0,24).map(x=>String(x).slice(0,160)):[];
 const score=xnum(body.score),safeScore=score!=null&&score>=0&&score<=100?score:null;
 const spec=body.spec&&typeof body.spec==="object"?body.spec:{};
 const output={
   schema:"goldflow.forward.v1",recordMode:"FORWARD_LOGGED",symbolResolved:symbol,
   broker:"Vantage",brokerServer:body.brokerServer?String(body.brokerServer).slice(0,80):null,
   indicatorId:indicator,indicatorVersion:String(body.indicatorVersion||"").slice(0,80),
   engineBuildHash:body.engineBuildHash?String(body.engineBuildHash).slice(0,100):null,
   tf,direction,signalCandleCloseUTC:new Date(close).toISOString(),entry,originalSL:sl,tp1,tp2:xnum(body.tp2),tp3:xnum(body.tp3),
   score:safeScore,reasons,zone:body.zone&&typeof body.zone==="object"?{
     tf:String(body.zone.tf||"").slice(0,10),high:xnum(body.zone.high),low:xnum(body.zone.low),
     source:String(body.zone.source||"").slice(0,80)}:null,
   spec:{point:xnum(spec.point),digits:xnum(spec.digits),pipSize:xnum(spec.pipSize),
     tickSize:xnum(spec.tickSize),tickValueProfit:xnum(spec.tickValueProfit),tickValueLoss:xnum(spec.tickValueLoss),
     currencyProfit:String(spec.currencyProfit||"").slice(0,8),contractSize:xnum(spec.contractSize),
     volumeMin:xnum(spec.volumeMin),volumeStep:xnum(spec.volumeStep)},
   closedCandles:archived,receivedAtUTC:now.toISOString(),
   verification:"AUTHENTICATED_PUBLISHER_RECEIPT_NOT_INDEPENDENT_BROKER_EXECUTION_PROOF",
   dataQuality:["BROKER_CANDLES_SELF_REPORTED_BY_AUTHENTICATED_PUBLISHER"]};
 const id=sha256(JSON.stringify({symbol,indicator,tf,close:output.signalCandleCloseUTC,direction,entry,sl,tp1})).slice(0,32);
 output.signalId=id;
 output.recordHash=sha256(JSON.stringify({...output,recordHash:undefined}));
 return output;
}
export function forwardPath(record){return "goldflow-forward/v1/"+record.receivedAtUTC.slice(0,10)+"/"+record.signalId+"/published.json";}
export async function storePublished(record){
 if(!forwardConfigured())throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
 const {put}=await import("@vercel/blob");
 return put(forwardPath(record),JSON.stringify(record),{access:"private",allowOverwrite:false,
   contentType:"application/json",cacheControlMaxAge:60});
}
async function readPrivateJson(pathname,maxBytes=300000){
 const {get}=await import("@vercel/blob");
 const r=await get(pathname,{access:"private"});
 if(!r||r.statusCode!==200||!r.stream)return null;
 let out="",decoder=new TextDecoder();
 for await(const chunk of r.stream){out+=decoder.decode(chunk,{stream:true});if(out.length>maxBytes)throw Error("ARCHIVE_TOO_LARGE")}
 out+=decoder.decode();return JSON.parse(out);
}
function validateLookup(date,id){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^[a-f0-9]{32}$/.test(id))throw Error("INVALID_FORWARD_LOOKUP");
}
export async function readForwardPrivate(date,id){
 validateLookup(date,id);
 const parsed=await readPrivateJson("goldflow-forward/v1/"+date+"/"+id+"/published.json");
 if(!parsed)return null;
 if(parsed.recordMode!=="FORWARD_LOGGED"||parsed.signalId!==id||parsed.receivedAtUTC.slice(0,10)!==date)throw Error("ARCHIVE_INTEGRITY_ERROR");
 const {recordHash,...body}=parsed;
 if(sha256(JSON.stringify({...body,recordHash:undefined}))!==recordHash)throw Error("RECORD_HASH_MISMATCH");
 return parsed;
}
export async function readForward(date,id){
 if(!publicReadEnabled())throw Error("FORWARD_PUBLIC_READ_NOT_ENABLED");
 return readForwardPrivate(date,id);
}
const FINAL_OUTCOMES=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE","BE_ZERO","SL"]);
export function normalizeOutcomePayload(body,published,now=new Date()){
 if(!published||published.recordMode!=="FORWARD_LOGGED")throw Error("PUBLISHED_RECORD_REQUIRED");
 const signalId=String(body?.signalId||""),date=String(body?.date||"");
 if(signalId!==published.signalId||date!==published.receivedAtUTC.slice(0,10))throw Error("OUTCOME_RECORD_MISMATCH");
 const outcome=String(body?.outcome||"").toUpperCase();
 if(published.indicatorId==="pattern132"||published.indicatorId==="snd107")throw Error("VALIDATION_ONLY_ENGINE_HAS_NO_OUTCOME_MODEL");
 if(!FINAL_OUTCOMES.has(outcome))throw Error("INVALID_FINAL_OUTCOME");
 const exitPrice=xnum(body?.exitPrice),exitTime=Date.parse(String(body?.exitTimeUTC||""));
 const signalClose=Date.parse(published.signalCandleCloseUTC);
 if(exitPrice==null||!Number.isFinite(exitTime)||exitTime<signalClose||exitTime>now.getTime()+90000)throw Error("INVALID_EXIT_EVENT");
 const direction=Number(published.direction),entry=xnum(published.entry),risk=Math.abs(entry-xnum(published.originalSL));
 const priceMove=direction*(exitPrice-entry),rMultiple=risk>0?priceMove/risk:null;
 const event={schema:"goldflow.forward.outcome.v1",recordMode:"FORWARD_LOGGED",signalId,date,
   outcome,exitPrice,exitTimeUTC:new Date(exitTime).toISOString(),
   exitRule:String(body?.exitRule||"").slice(0,120)||"PUBLISHER_FINAL_OUTCOME",
   priceMove, signedPoints:xnum(published.spec?.point)>0?priceMove/Number(published.spec.point):null,
   signedPips:xnum(published.spec?.pipSize)>0?priceMove/Number(published.spec.pipSize):null,
   rMultiple,receivedAtUTC:now.toISOString(),
   verification:"AUTHENTICATED_OUTCOME_EVENT_LINKED_TO_IMMUTABLE_PUBLICATION; NOT BROKER_FILL_CERTIFICATION"};
 event.eventHash=sha256(JSON.stringify({...event,eventHash:undefined}));
 return event;
}
export function outcomePath(event){return "goldflow-forward/v1/"+event.date+"/"+event.signalId+"/outcome.json";}
export async function storeOutcome(event){
 if(!forwardConfigured())throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
 const {put}=await import("@vercel/blob");
 return put(outcomePath(event),JSON.stringify(event),{access:"private",allowOverwrite:false,
   contentType:"application/json",cacheControlMaxAge:60});
}
export async function readForwardOutcomePrivate(date,id){
 validateLookup(date,id);
 const event=await readPrivateJson("goldflow-forward/v1/"+date+"/"+id+"/outcome.json");
 if(!event)return null;
 if(event.recordMode!=="FORWARD_LOGGED"||event.signalId!==id||event.date!==date)throw Error("OUTCOME_ARCHIVE_INTEGRITY_ERROR");
 const {eventHash,...body}=event;
 if(sha256(JSON.stringify({...body,eventHash:undefined}))!==eventHash)throw Error("OUTCOME_HASH_MISMATCH");
 return event;
}
export async function readForwardOutcome(date,id){
 if(!publicReadEnabled())throw Error("FORWARD_PUBLIC_READ_NOT_ENABLED");
 return readForwardOutcomePrivate(date,id);
}
