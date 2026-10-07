import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
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

test("own broker OHLC SVG renders chart safely without any external TradingView or chart CDN",()=>{
 const code=readFileSync(new URL("../ohlc-fallback.js",import.meta.url),"utf8"),window={};
 vm.runInNewContext(code,{window,Math,Number,Date,String,Object,Array});
 const node={innerHTML:"",textContent:""};
 const candles=Array.from({length:22},(_,i)=>({t:1700000000+i*900,o:4200+i,h:4202+i,l:4199+i,c:4201+i}));
 const ok=window.GFOHLC.render(node,candles,[{p:4210,name:"ENTRY"},{p:4190,name:"STOP"}]);
 assert.equal(ok,true);assert.ok(node.innerHTML.includes("<svg"));
 assert.ok(node.innerHTML.includes("ENTRY"));assert.ok(node.innerHTML.includes("STOP"));
 const builder=readFileSync(new URL("../cloudflare/build.mjs",import.meta.url),"utf8");
 assert.ok(builder.includes("ohlc-fallback.js"));
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(html.includes('<script src="/ohlc-fallback.js"></script>'));
});

test("broker chart defaults to nearest-only short labels and offers all/hide controls",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(app.includes('gf_chart_labels'));
 assert.ok(app.includes('chartLabelMode==="nearest"&&i<2'));
 assert.ok(app.includes('live+side+" L"'));
 assert.ok(app.includes('live+side+" H"'));
 assert.ok(html.includes('id="chartLabelMode"'));
 assert.ok(html.includes('value="nearest"'));
 assert.ok(html.includes('value="hide"'));
});
test("Market Study active lifecycle survives a later WAIT until TP1 or invalidation",()=>{
 const code=readFileSync(new URL("../study-lifecycle.js",import.meta.url),"utf8"),ctx={};
 vm.runInNewContext(code,ctx);
 const life=ctx.GFStudyLifecycle;
 const ready={mode:"study",status:"BUY_ENTRY_READY",canEnter:true,symbol:"XAUUSD.crp",tf:"M1",updatedAtUTC:"2026-10-07T01:00:00Z",
  entryQuote:4175.8,bid:4175.7,ask:4175.8,quoteAgeSeconds:0,
  confirmation:{direction:1,entryLow:4175.35,entryHigh:4176.15,invalidation:4175.24,tp1:4176.76,tp2:4184.35,tp3:4186.26,signalCandleTime:1900000000,confirmationCloseUTC:"2026-10-07T00:59:00Z"}};
 const active=life.candidate(ready);assert.equal(active.side,"BUY");
 const wait={...ready,status:"STUDY_WAIT_BUY_CONFIRMATION",canEnter:false,confirmation:null,bid:4176.2,ask:4176.3};
 assert.equal(life.evaluate(active,wait).state,"ACTIVE_VALID");
 assert.equal(life.evaluate(active,{...wait,bid:4175.2,ask:4175.3}).state,"INVALIDATED");
 assert.equal(life.evaluate(active,{...wait,bid:4176.8,ask:4176.9}).state,"COMPLETED_TP1");
 assert.equal(life.evaluate(active,{...wait,quoteAgeSeconds:90}).state,"ACTIVE_QUOTE_OFFLINE");
});
test("Market Study UI separates current WAIT from an earlier active observed setup",()=>{
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(ui.includes("NEW SIGNAL WAIT • "));
 assert.ok(ui.includes("remains ACTIVE until its stored SL/invalidation or TP1 is reached"));
 assert.ok(ui.includes("Browser lifecycle only; NOT proof that an MT5/broker position was opened."));
 assert.ok(html.includes('id="gfActiveSetupCard"'));
 assert.ok(html.includes("OBSERVED ENTRY LIFECYCLE"));
});

test("GF AI/News/Market Study populate Dashboard and Broker Chart instead of being hidden or redirected",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 assert.ok(app.includes('async function loadGFAnalysis()'));
 assert.ok(app.includes('/api/study?symbol='));
 assert.ok(app.includes('renderGFDashboard(d,requestedSymbol,requestedTF,requestedIndicator)'));
 assert.ok(app.includes('if(lastAnalysis.gfStudy)'));
 assert.ok(app.includes('GF LIVE STUDY • Current-state research only.'));
 assert.ok(!app.includes('b.dataset.page==="chartPage"&&/^gf-/.test(selectedIndicator)'));
 assert.ok(!app.includes('if(/^gf-/.test(selectedIndicator))document.querySelector(\'[data-page="gfStudyPage"]\')?.click()'));
});
test("GF Market Study dashboard uses SBR/RBS labels without importing the protected SND/SNR engine",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const engine=readFileSync(new URL("../api/_marketStudyEngine.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 assert.ok(app.includes('source=d.structureFlip.type'));
 assert.ok(app.includes('d.structureFlipWatch.type+" WATCH"'));
 assert.ok(engine.includes('"RBS_BREAK_CONFIRMED"'));
 assert.ok(engine.includes('"SBR_BREAK_CONFIRMED"'));
 assert.ok(engine.includes('structureFlipWatch:flipWatch'));
 assert.ok(ui.includes('"SBR/RBS: "'));
 assert.ok(!engine.includes('_indicatorSnd'));
});

test("TradingView page no longer renders a blank cross-origin iframe box",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 assert.ok(app.includes("embedded TradingView iframe is intentionally not shown"));
 assert.ok(!app.includes('document.createElement("iframe")'));
 assert.ok(app.includes("OPEN TRADINGVIEW ↗"));
 assert.ok(app.includes('tvNativeChart=LightweightCharts.createChart'));
});
test("GF News/AI UI distinguishes stale selected-symbol quote from whole-market offline",()=>{
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 assert.ok(ui.includes("SYMBOL QUOTE STALE • NO ENTRY"));
 assert.ok(ui.includes("Vantage terminal/bridge may still be LIVE"));
 assert.ok(ui.includes("daily rollover"));
});
test("AI UI exposes Market Intelligence engines and states that 24h signals are not yet archived",()=>{
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 const engine=readFileSync(new URL("../api/_aiLiveEngine.js",import.meta.url),"utf8");
 const brain=readFileSync(new URL("../api/_aiMarketBrain.js",import.meta.url),"utf8");
 assert.ok(engine.includes('persistent24hSignalArchive:false'));
 assert.ok(engine.includes('"BOS_CHOCH"'));
 assert.ok(engine.includes('"LIQUIDITY_SWEEP_EQUAL_HIGHS_LOWS"'));
 assert.ok(engine.includes('"SND_SNR_SBR_RBS"'));
 assert.ok(engine.includes('fibonacciRole:"OPTIONAL_OVERLAP_BONUS_ONLY_NOT_REQUIRED"'));
 assert.ok(brain.includes('"DOUBLE_TOP"'));
 assert.ok(brain.includes('"HEAD_AND_SHOULDERS"'));
 assert.ok(ui.includes("AI MARKET BRAIN:"));
 assert.ok(ui.includes("24H AI HISTORY: NOT ARCHIVED YET"));
});
test("Fund104 Performance explains validation-only N/A rather than implying missing data",()=>{
 const v=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
 assert.ok(v.includes("FUND 1.04 WEB STUDY is validation-only"));
 assert.ok(v.includes("WR/R/P&L remain N/A"));
});

test("TradingView Hybrid Tools have a tested Vantage fallback instead of blank cards",()=>{
 const v=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
 const calc=readFileSync(new URL("../tv-hybrid.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const build=readFileSync(new URL("../cloudflare/build.mjs",import.meta.url),"utf8");
 assert.ok(v.includes("renderTVTechnicalFallback"));
 assert.ok(v.includes("renderTVMarketFallback"));
 assert.ok(v.includes("TradingView widget blocked/unavailable"));
 assert.ok(calc.includes('row("SMA ("'));
 assert.ok(v.includes("VANTAGE MULTI-TIMEFRAME OVERVIEW"));
 assert.ok(html.includes('<script src="/tv-hybrid.js"></script>'));
 assert.ok(build.includes("tv-hybrid.js"));
});
test("TradingView Hybrid fallback computes common technical indicators from broker OHLC",()=>{
 const code=readFileSync(new URL("../tv-hybrid.js",import.meta.url),"utf8"),ctx={};
 vm.runInNewContext(code,ctx);
 const bars=Array.from({length:220},(_,i)=>{const c=4100+i*.25+Math.sin(i/4)*2;return {t:1700000000+i*300,o:c-.4,h:c+1.1,l:c-1,c,v:100+i}});
 const x=ctx.GFTVHybrid.calc(bars);
 assert.equal(x.ok,true);assert.equal(x.count,220);
 assert.ok(x.movingAverages.some(r=>r.name==="SMA (200)"&&Number.isFinite(r.value)));
 assert.ok(x.movingAverages.some(r=>r.name==="EMA (50)"&&Number.isFinite(r.value)));
 assert.ok(x.oscillators.some(r=>r.name==="RSI (14)"&&Number.isFinite(r.value)));
 assert.ok(x.oscillators.some(r=>r.name==="MACD Hist (12,26,9)"&&Number.isFinite(r.value)));
 assert.ok(x.info.some(r=>r.name==="ATR (14)"&&Number.isFinite(r.value)));
 assert.ok(["BUY","SELL","NEUTRAL"].includes(x.summaries.overall.action));
});

test("Broker and TradingView charts expose first-party chart tools and indicator settings",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const toolsCode=readFileSync(new URL("../chart-tools.js",import.meta.url),"utf8");
 const build=readFileSync(new URL("../cloudflare/build.mjs",import.meta.url),"utf8");
 assert.ok(html.includes('id="brokerChartTools"'));
 assert.ok(html.includes('<script src="/chart-tools.js"></script>'));
 assert.ok(app.includes('GFChartTools.render("broker"'));
 assert.ok(app.includes('GFChartTools.render("tv"'));
 assert.ok(app.includes('timeframes:["M1","M5","M15","M30","H1","H4","D1","W1","MN1"]'));
 assert.ok(toolsCode.includes('Horizontal line price'));
 assert.ok(toolsCode.includes('Trendline: click first point on chart'));
 assert.ok(toolsCode.includes('SMA20'));
 assert.ok(toolsCode.includes('EMA200'));
 assert.ok(toolsCode.includes('BB20'));
 assert.ok(build.includes("chart-tools.js"));
});
test("Chart tool indicators compute overlays from broker closes without changing signal engines",()=>{
 const code=readFileSync(new URL("../chart-tools.js",import.meta.url),"utf8");
 assert.ok(code.includes("function smaData"));
 assert.ok(code.includes("function emaData"));
 assert.ok(code.includes("function bbData"));
 assert.ok(code.includes("createMainSeries"));
 assert.ok(!code.includes("/api/analyze"));
 assert.ok(!code.includes("/api/study"));
});

test("TradingView Gold reference uses ThinkMarkets XAUUSD247 and is not silently remapped to OANDA",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const v8=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
 assert.ok(app.includes('return "THINKMARKETS:XAUUSD247"'));
 assert.ok(!app.includes('if(r==="XAUUSD247")return "OANDA:XAUUSD"'));
 assert.ok(!v8.includes('if(/THINKMARKETS:XAUUSD247/.test(sym))sym="OANDA:XAUUSD"'));
 assert.ok(v8.includes('{s:"THINKMARKETS:XAUUSD247",d:"Gold • ThinkMarkets XAUUSD247"}'));
 assert.ok(v8.includes("XAUUSD247 uses ThinkMarkets Spot Gold Continuous"));
});

test("bridge transport loss demotes displayed GF study to fail-closed LAST KNOWN state",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 assert.ok(app.includes("window.GFStudy?.transportLost?."));
 assert.ok(ui.includes("function transportLost(reason)"));
 assert.ok(ui.includes("DATA UNVERIFIED • LAST KNOWN"));
 assert.ok(ui.includes("BRIDGE OFFLINE • NO NEW ENTRY"));
 assert.ok(ui.includes("(LAST KNOWN)"));
 assert.ok(ui.includes("canEnter:false,bid:null,ask:null,entryQuote:null,quoteAgeSeconds:null"));
});
test("TradingView Hybrid multi-timeframe fallback paces broker requests sequentially",()=>{
 const v=readFileSync(new URL("../v8.js",import.meta.url),"utf8");
 assert.ok(v.includes("for(const tf of tfs)"));
 assert.ok(v.includes("await new Promise(r=>setTimeout(r,140))"));
 assert.ok(v.includes('if(!$("tvPage")?.classList.contains("on"))return;'));
 assert.ok(!v.includes("var rows=await Promise.all(tfs.map"));
});

test("Production bridge v3.0.1 serializes MetaTrader5 access across FastAPI requests",()=>{
 const py=readFileSync(new URL("../bridge/mt5_bridge.py",import.meta.url),"utf8");
 assert.ok(py.includes('BRIDGE_RUNTIME_VERSION="3.0.1"'));
 assert.ok(py.includes("MT5_LOCK=threading.RLock()"));
 assert.ok(py.includes("def mt5_serialized(fn):"));
 for(const route of ["/health","/symbols","/catalog","/bars","/multi-bars","/snapshot"]){
  const marker='@app.get("'+route+'")\n@mt5_serialized';
  assert.ok(py.includes(marker),"missing serialized route "+route);
 }
});
test("Production bridge recovery uses named tunnel and explicitly rejects Quick Tunnel as production",()=>{
 const recover=readFileSync(new URL("../bridge/RECOVER_GOLDFLOW_BRIDGE.bat",import.meta.url),"utf8");
 const named=readFileSync(new URL("../bridge/START_NAMED_TUNNEL.bat",import.meta.url),"utf8");
 const http2=readFileSync(new URL("../bridge/START_TUNNEL_HTTP2.bat",import.meta.url),"utf8");
 const quick=readFileSync(new URL("../bridge/START_QUICK_TUNNEL.bat",import.meta.url),"utf8");
 assert.ok(recover.includes("https://bridge.hazim5011.com/health"));
 assert.ok(recover.includes("LOCAL BRIDGE + NAMED TUNNEL + PUBLIC HOST"));
 assert.ok(named.includes("TUNNEL_TOKEN"));
 assert.ok(named.includes("cloudflared service"));
 assert.ok(http2.includes("START_NAMED_TUNNEL.bat"));
 assert.ok(quick.includes("DEVELOPMENT ONLY - NOT GOLDFLOW PRODUCTION"));
});

test("GF-News Impact Dashboard and Study UI expose WHY BUY/SELL/WAIT reasoning",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 assert.ok(html.includes('id="newsWhyCard"'));
 assert.ok(html.includes('id="newsWhyTechnical"'));
 assert.ok(html.includes('id="newsWhyMacro"'));
 assert.ok(app.includes("function renderNewsWhy(d)"));
 assert.ok(app.includes('d.mode==="news"&&d.newsDecision?.summary'));
 assert.ok(ui.includes("WHY WAIT • NEWS IMPACT"));
 assert.ok(ui.includes("PRESSURE/SUPPORTIVE are GoldFlow derived macro-context labels"));
});

test("Market Intelligence AI UI exposes WATCH direction, thesis, BOS/CHOCH evidence and market-driven plans",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 assert.ok(html.includes("GF-AI Live Analyst v1.21 • All-TF Market Intelligence"));
 assert.ok(app.includes("BUY WATCH"));
 assert.ok(app.includes("d.analysis.directionScore"));
 assert.ok(app.includes("d.candidatePlan"));
 assert.ok(ui.includes("WATCH • MARKET THESIS"));
 assert.ok(ui.includes("Market-intelligence confluence"));
 assert.ok(ui.includes("STRUCTURE: "));
 assert.ok(ui.includes("LIQUIDITY: "));
 assert.ok(ui.includes("CHART PATTERN: "));
 assert.ok(ui.includes("ORDER BLOCK: "));
 assert.ok(ui.includes("FVG: "));
 assert.ok(ui.includes("NOT win probability"));
});

test("GF-AI v1.21 UI proves M1-to-D1 hierarchy and guards mixed-version policy fields",()=>{
 const app=readFileSync(new URL("../app.js",import.meta.url),"utf8");
 const ui=readFileSync(new URL("../study-ui.js",import.meta.url),"utf8");
 const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
 const api=readFileSync(new URL("../api/study.js",import.meta.url),"utf8");
 assert.ok(html.includes("M1/M5/M15/M30/H1/H4/D1 market hierarchy"));
 assert.ok(api.includes('const allAiFrames=["M1","M5","M15","M30","H1","H4","D1"]'));
 assert.ok(api.includes('frames:mode==="ai"?(bridge.frames||{}):undefined'));
 assert.ok(ui.includes("ALL TF MATRIX:"));
 assert.ok(ui.includes("ALL TF CONSENSUS:"));
 assert.ok(ui.includes("Array.isArray(d.aiPolicy.primaryEngines)"));
 assert.ok(app.includes('ALL TF • M1→D1 • Entry '));
 assert.ok(app.includes("d.analysis?.allTfConsensus"));
});
