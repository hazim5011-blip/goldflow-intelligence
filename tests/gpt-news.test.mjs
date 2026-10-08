import test from "node:test";
import assert from "node:assert/strict";
import {gptWorldNews} from "../cloudflare/gpt-news.js";
test("external news is opt-in only",async()=>{
 const r=await gptWorldNews({},async()=>{throw Error("must not call")});
 assert.equal(r.status,"UNAVAILABLE");assert.deepEqual(r.items,[]);
});
test("only 48-hour dated publisher RSS headlines with HTTPS links reach GPT",async()=>{
 const now=Date.now(),stamp=new Date(now-30*60000).toISOString();
 const provider=async()=>new Response(JSON.stringify({ok:true,sourceStatus:"PARTIAL",
  updatedAtUTC:new Date(now).toISOString(),fetchedLiveHeadlines:3,items:[
   {title:"Official publisher report about Gold markets",publisher:"Reuters",sourceUrl:"https://www.reuters.com/story",publishedAtUTC:stamp,headlineOnly:true,sourceMode:"LIVE_RSS"},
   {title:"Editorial fake",publisher:"Editor",sourceUrl:"https://example.com",publishedAtUTC:stamp,headlineOnly:false,sourceMode:"CURATED_SOURCE_ATTRIBUTED"},
   {title:"URL to untrusted HTTP",publisher:"RSS",sourceUrl:"http://example.org",publishedAtUTC:stamp,headlineOnly:true,sourceMode:"LIVE_RSS"}
  ]}));
 const r=await gptWorldNews({GF_GPT_INCLUDE_NEWS:"1"},provider,now);
 assert.equal(r.status,"PARTIAL");assert.equal(r.items.length,1);
 assert.equal(r.items[0].verification,"PUBLISHER_RSS_HEADLINE_ONLY");
});
test("stale feed is marked UNAVAILABLE, never relabeled as current",async()=>{
 const now=Date.now();
 const r=await gptWorldNews({GF_GPT_INCLUDE_NEWS:"1"},async()=>new Response(JSON.stringify({
  ok:true,sourceStatus:"AVAILABLE",updatedAtUTC:new Date(now-86400000).toISOString(),
  fetchedLiveHeadlines:1,items:[]})),now);
 assert.equal(r.status,"UNAVAILABLE");assert.deepEqual(r.items,[]);
});
