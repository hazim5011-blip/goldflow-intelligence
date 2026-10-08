// Optional sourced, dated publisher headlines from the existing GoldFlow news API.
// Headline-only evidence is never mistaken for a verified article or market reaction.
import {runLegacy} from "./compat.js";
import worldNews from "../api/news-live.js";
export async function gptWorldNews(env={},run=runLegacy,now=Date.now()){
 if(env.GF_GPT_INCLUDE_NEWS!=="1")return {status:"UNAVAILABLE",reason:"NEWS_ADAPTER_DISABLED",items:[]};
 try{
  const reply=await run(worldNews,new Request("https://goldflow.internal/api/news-live"),env);
  if(reply.status!==200)return {status:"UNAVAILABLE",reason:"NEWS_TRANSPORT_ERROR",items:[]};
  const d=await reply.json(),updated=Date.parse(d?.updatedAtUTC||"");
  if(d?.ok!==true||!Array.isArray(d.items)||!Number.isFinite(updated)||now-updated>360000||
    updated>now+30000)return {status:"UNAVAILABLE",reason:"NEWS_FEED_UNVERIFIED_OR_STALE",items:[]};
  if(!["AVAILABLE","PARTIAL"].includes(d.sourceStatus)||!Number.isFinite(d.fetchedLiveHeadlines)||
     d.fetchedLiveHeadlines<1)return {status:"UNAVAILABLE",reason:"NO_LIVE_PUBLISHER_HEADLINES",items:[]};
  const items=d.items.filter(i=>{
   const pub=Date.parse(i?.publishedAtUTC||"");
   let url;try{url=new URL(i?.sourceUrl||"")}catch{return false}
   return i?.headlineOnly===true&&i?.sourceMode!=="CURATED_SOURCE_ATTRIBUTED"&&
     typeof i.title==="string"&&i.title.length>6&&i.title.length<=400&&
     typeof i.publisher==="string"&&i.publisher.length>1&&
     url.protocol==="https:"&&now-pub<=48*3600000&&now-pub>=-300000;
  }).slice(0,6).map(i=>({headline:i.title,publisher:i.publisher,
    publishedAtUTC:i.publishedAtUTC,sourceUrl:i.sourceUrl,verification:"PUBLISHER_RSS_HEADLINE_ONLY"}));
  if(items.length===0)return {status:"UNAVAILABLE",reason:"NO_FRESH_ATTRIBUTED_HEADLINES",items:[]};
  return {status:d.sourceStatus,updatedAtUTC:d.updatedAtUTC,items,
   limitation:"Headline only; article content and causality unverified; don't infer Gold direction without broker evidence."};
 }catch{return {status:"UNAVAILABLE",reason:"NEWS_SOURCE_UNREACHABLE",items:[]}}
}
