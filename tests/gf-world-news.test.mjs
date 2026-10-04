import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifyHeadline,makeEditorial,mechanism,parseRss,collectWorldNews,feedDefinitions,preOpeningNewsRisk} from "../api/_marketNews.js";
const now=Date.parse("2026-10-04T19:00:00.000Z");
const trusted=String.raw`<rss><channel>
<item><title><![CDATA[Oil and Strait of Hormuz attacks intensify as tankers reroute]]></title>
<link>https://news.google.com/rss/articles/TEST123?oc=5</link>
<pubDate>Sun, 04 Oct 2026 18:20:00 GMT</pubDate><source url="https://www.reuters.com">Reuters</source></item>
<item><title>Gold price will surely double &lt;script&gt;claim&lt;/script&gt; after attack</title>
<link>https://news.google.com/rss/articles/TEST124?oc=5</link>
<pubDate>Sun, 04 Oct 2026 18:20:00 GMT</pubDate><source>Unverified Blog</source></item>
<item><title><![CDATA[Treasury yields and gold report published three weeks ago]]></title>
<link>https://news.google.com/rss/articles/TEST125?oc=5</link>
<pubDate>Tue, 08 Sep 2026 12:00:00 GMT</pubDate><source>Reuters</source></item>
</channel></rss>`;
const feed={key:"HORMUZ",google:true,domains:["news.google.com"]};
test("trusted new source headline selected; unknown publisher, stale item and HTML claims fail",()=>{
 const r=parseRss(trusted,feed,now);
 assert.equal(r.length,1);assert.equal(r[0].publisher,"Reuters");
 assert.equal(r[0].headlineOnly,true);assert.equal(r[0].category,"GEOPOLITICS");
 assert.equal(r[0].impact,"HIGH");
 assert.equal(r[0].priceReactionVerified,false);
 assert.match(r[0].limitation,/belum disahkan/);
});
test("strict URL: no wrong Google host or injected script link",()=>{
 const spoof=trusted.replaceAll("news.google.com","evil.example");
 assert.equal(parseRss(spoof,feed,now).length,0);
 const unsafe=trusted.replaceAll("https://news.google.com/rss/articles/TEST123?oc=5","javascript:alert(1)");
 assert.equal(parseRss(unsafe,feed,now).length,0);
});
test("dated verified-source editorial stays attributed without fake exact publication time",()=>{
 const items=makeEditorial(now);
 assert.ok(items.some(x=>x.id==="wsj-hormuz-shipping-20261004"));
 assert.ok(items.some(x=>x.id==="ukmto-incident-149-20261002"));
 assert.ok(items.every(x=>x.publishedAtUTC===null&&x.publicationDatePrecision==="DAY"));
 assert.ok(items.every(x=>x.sourceUrl.startsWith("https://")&&x.goldStudyOnly===true));
 assert.ok(items.every(x=>x.priceReactionVerified===false));
 assert.equal(makeEditorial(now+200*3600000).length,0);
});
test("two-sided gold explanation is supplied; headlines never imply a guaranteed BUY or SELL",()=>{
 const a=mechanism("GEOPOLITICS");
 assert.match(a.pathway,/safe-haven/i);
 assert.match(a.opposing,/yields/i);
 assert.equal(classifyHeadline("Iran tanker attack in Strait of Hormuz").impact,"HIGH");
 assert.equal(classifyHeadline("OPEC oil supply update").category,"ENERGY_SUPPLY");
 assert.equal(classifyHeadline("Gold chart").impact,"MEDIUM");
});
test("seven independent public feeds are tried; one source can recover; exact duplicated headline deduplicated",async()=>{
 let hits=0;
 const fetcher=async u=>{
   hits++;
   if(!u.startsWith("https://news.google.com/rss/"))throw Error("FAKE_UPSTREAM_FAIL");
   return {ok:true,text:async()=>trusted};
 };
 const result=await collectWorldNews(fetcher,now);
 assert.equal(hits,feedDefinitions().length);
 assert.equal(result.ok,true);assert.equal(result.sourceStatus,"PARTIAL");
 assert.equal(result.sourceChecks.filter(x=>x.status==="FETCHED").length,4);
 assert.equal(result.items.filter(x=>x.sourceMode==="AGGREGATOR_RSS_HEADLINE").length,1);
 assert.ok(result.items.some(x=>x.sourceMode==="CURATED_SOURCE_ATTRIBUTED"));
 assert.ok(result.openingWatch.some(x=>x.includes("XAUUSD247")));
});
test("Cloudflare world-news route / Blog and 5-minute UI monitoring do not depend on Vantage/MT5",()=>{
 const worker=readFileSync(new URL("../cloudflare/worker.js",import.meta.url),"utf8");
 const api=readFileSync(new URL("../api/news-live.js",import.meta.url),"utf8");
 const app=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
 const page=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const build=readFileSync(new URL("../cloudflare/build.mjs",import.meta.url),"utf8");
 assert.ok(worker.includes('"/api/news-live":liveNews'));
 assert.ok(!api.includes("brokerGet")&&!api.includes("bridgeConfigured"));
 assert.ok(app.includes('"/api/news-live"'));
 assert.ok(app.includes("300000"));
 assert.ok(page.includes('id="gfWorldFeature"'));
 assert.ok(page.includes('id="gfBlogLiveJournal"'));
 assert.ok(build.includes('"api/news-live.js"'));
 const blog=JSON.parse(readFileSync(new URL("../blog/posts.json",import.meta.url),"utf8"));
 assert.ok(blog.posts.filter(x=>x.category==="MARKET INTELLIGENCE"||x.category==="ENERGY & MACRO").length>=2);
 assert.ok(blog.posts.filter(x=>x.dateUTC==="2026-10-04").every(x=>x.sources!==undefined));
});

test("Hormuz risk offers conditional Gold upside-gap scenario, not guaranteed BUY, with G7 counterforce",()=>{
 const x=preOpeningNewsRisk(makeEditorial(now),now);
 assert.equal(x.status,"SAFE_HAVEN_UPSIDE_GAP_RISK_UNCONFIRMED");
 assert.equal(x.probability,null);
 assert.equal(x.validatedGoldMove,false);
 assert.equal(x.automaticEntry,false);
 assert.equal(x.requiresFreshQuote,true);
 assert.equal(x.requiresClosedM15,true);
 assert.ok(x.driver?.sourceUrl?.startsWith("https://"));
 assert.ok(x.counterforce?.sourceUrl?.startsWith("https://"));
});
test("a reliable easing headline is not classified as automatic safe-haven BUY",()=>{
 const x=preOpeningNewsRisk([{
  id:"ceasefire",category:"GEOPOLITICS",impact:"HIGH",
  titleEN:"Ceasefire agreed and shipping resumes in Strait of Hormuz",
  publishedAtUTC:new Date(now-60000).toISOString(),
  sourceUrl:"https://www.reuters.com/example",publisher:"Reuters"
 }],now);
 assert.equal(x.status,"SAFE_HAVEN_PREMIUM_EASING_SCENARIO");
 assert.equal(x.automaticEntry,false);
});
test("openingRisk is published separately from official macro, with bilingual watch reasons",async()=>{
 const d=await collectWorldNews(async()=>{
  throw Error("MOCK_ALL_FEEDS_FAIL");
 },now);
 assert.equal(d.sourceStatus,"LIVE_FEEDS_UNAVAILABLE");
 assert.ok(d.items.length>0,"dated real-source fallback remains clearly labelled");
 assert.equal(d.openingRisk.status,"SAFE_HAVEN_UPSIDE_GAP_RISK_UNCONFIRMED");
 assert.ok(d.openingWatchEN.length>=3);
 assert.equal(d.openingRisk.probability,null);
});
