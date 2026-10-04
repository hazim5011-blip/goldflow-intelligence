import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {classifySymbol} from "../api/_broker.js";
import {verifyOnline} from "../api/market-online.js";
const now=1900000000,offset=10800;
test("synthetic names appear separately, but catalog classification never implies online",()=>{
 assert.equal(classifySymbol("VOL80"),"SYNTHETIC");
 assert.equal(classifySymbol("Volatility 80 Index","Derived Indices\\Continuous"),"SYNTHETIC");
 assert.equal(classifySymbol("STEP0.5"),"SYNTHETIC");
 assert.equal(classifySymbol("Step Index"),"SYNTHETIC");
 assert.equal(classifySymbol("BTCUSD"),"CRYPTO");
 assert.equal(classifySymbol("XAUUSD247"),"METALS");
});
test("exact catalog trade mode plus fresh BID/ASK tick is required for synthetic ONLINE",()=>{
 const row={name:"VOL80",tradeMode:4},good={symbol:"VOL80",bid:100,ask:101,time:now+offset};
 assert.equal(verifyOnline(row,good,now,now,offset).status,"ONLINE");
 assert.equal(verifyOnline(row,{...good,symbol:"VOL75"},now,now,offset).status,"UNKNOWN");
 assert.equal(verifyOnline({...row,tradeMode:0},good,now,now,offset).status,"TRADE_DISABLED");
 assert.equal(verifyOnline(row,{...good,time:now+offset-100},now,now,offset).status,"OFFLINE");
});
test("no crypto-biased 90-instrument cap; attempted all broker tradables with fail-closed UNKNOWN batches",()=>{
 const s=readFileSync(new URL("../api/market-online.js",import.meta.url),"utf8");
 assert.ok(!s.includes("pool.slice(0,90)"));
 assert.ok(s.includes("cursor<batches.length"));
 assert.ok(s.includes("sampled:successful"));
 assert.ok(s.includes('status:"UNKNOWN"'));
 assert.ok(s.includes("weekendUTC"));
});
test("Evidence tab auto-loads first reconstruction, never fabricates GF-AI proof",()=>{
 const v=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
 assert.ok(v.includes('if(b.dataset.page==="v8Evidence")'));
 assert.ok(v.includes("await loadEvidence(first)"));
 assert.ok(v.includes('GF-AI/News/Market Study have no forward-published evidence archive yet'));
 assert.ok(v.includes('function historyIndicator()'));
 const ui=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(ui.includes('id="v8EvidenceContext"'));
});
test("TradingView never relies only on blank third-party iframe: authenticated Vantage OHLC fallback and official external link",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 assert.ok(app.includes('OPEN TRADINGVIEW ↗'));
 assert.ok(app.includes('/api/bars?symbol='));
 assert.ok(app.includes('tvNativeChart=LightweightCharts.createChart'));
 assert.ok(app.includes('TradingView can still open in a separate tab.'));
});
