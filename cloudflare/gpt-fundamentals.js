// Optional official macro snapshot from GoldFlow's OWN existing provider pipeline.
// Strictly transport/public metadata; missing, stale or non-official observations stay disclosed.
import {runLegacy} from "./compat.js";
import macroHandler from "../api/macro.js";
const FINITE=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x));
export async function gptFundamentals(env={},run=runLegacy,now=Date.now()){
 if(env.GF_GPT_INCLUDE_MACRO!=="1")return {status:"UNAVAILABLE",reason:"MACRO_ADAPTER_DISABLED",cards:[]};
 try{
  const source=await run(macroHandler,new Request("https://goldflow.internal/api/macro"),env);
  if(source.status!==200)return {status:"UNAVAILABLE",reason:"MACRO_SOURCE_HTTP_ERROR",cards:[]};
  const obj=await source.json();
  if(obj.ok!==true||!obj.quality||!Array.isArray(obj.cards))
   return {status:"UNAVAILABLE",reason:"MACRO_SOURCE_INVALID",cards:[]};
  const ts=Date.parse(obj.fetchedAt||"");
  if(!Number.isFinite(ts)||now-ts>15*60*1000||ts>now+30000)
   return {status:"UNAVAILABLE",reason:"MACRO_SNAPSHOT_STALE",cards:[]};
  const cards=obj.cards.filter(c=>{
   const observationTime=Date.parse(String(c?.date||"")+"T00:00:00Z");
   return c&&typeof c.id==="string"&&FINITE(c.value)&&typeof c.source==="string"
    &&c.source.length>3&&!c.stale&&Number.isFinite(observationTime)
    &&observationTime<=now+86400000&&observationTime>=now-120*86400000
    &&["OFFICIAL","SECONDARY_MIRROR"].includes(c.status);
  }).slice(0,20).map(c=>({id:c.id,name:String(c.name||c.id).slice(0,90),
   value:Number(c.value),date:c.date,status:c.status,source:c.source.slice(0,160),
   change:FINITE(c.change)?Number(c.change):null}));
  if(cards.length===0)return {status:"UNAVAILABLE",reason:"NO_VALID_OFFICIAL_OBSERVATIONS",cards:[]};
  return {status:cards.length===obj.cards.length?"AVAILABLE":"PARTIAL",
   provider:obj.provider||"GoldFlow existing macro pipeline",
   fetchedAtUTC:obj.fetchedAt,sourceQuality:{
    fresh:obj.quality.fresh,official:obj.quality.official,
    primarySourceHealth:obj.quality.primarySourceHealth,
    secondaryMirror:obj.quality.secondaryMirror
   },cards,derivedContext:obj.gold&&typeof obj.gold==="object"?{
    bias:String(obj.gold.bias||"UNKNOWN").slice(0,32),
    note:"GoldFlow calculated context, NOT observed direction or probability"
   }:null};
 }catch{
  return {status:"UNAVAILABLE",reason:"MACRO_SOURCE_UNREACHABLE",cards:[]};
 }
}
