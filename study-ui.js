"use strict";
// Additive V8.1.1 study controller. No legacy indicator output is overwritten.
(function(){
 const $=id=>document.getElementById(id);
 const isGF=()=>/^gf-(ai|news|study)$/.test(window.selectedIndicator||$("indicatorSelect")?.value||"");
 const mode=()=>({ "gf-ai":"ai","gf-news":"news","gf-study":"study"})[window.selectedIndicator||$("indicatorSelect")?.value]||"study";
 const safe=v=>v===undefined||v===null||!Number.isFinite(Number(v))?"—":Number(v).toLocaleString("en-US",{maximumFractionDigits:5});
 const state={busy:false,last:null,seq:0};
 function put(id,value){if($(id))$(id).textContent=String(value??"—")}
 let studyChart=null;
 function drawStudyChart(d){
  const node=$("gfStudyChart"),LW=window.LightweightCharts;
  if(!node||!$("gfStudyPage")?.classList.contains("on"))return;
  if(studyChart){studyChart.remove();studyChart=null}node.textContent="";
  if(!LW||!Array.isArray(d?.chartBars)||d.chartBars.length<25){
    node.textContent="Broker chart unavailable; never substitute synthetic candles.";
    put("gfStudyChartNote","Chart not ready or broker data unavailable. No inferred price line.");
    return;
  }
  try{
   const rows=d.chartBars.filter(b=>Number.isFinite(Number(b.t))&&[b.o,b.h,b.l,b.c].every(x=>Number.isFinite(Number(x))))
    .map(b=>({time:Number(b.t),open:Number(b.o),high:Number(b.h),low:Number(b.l),close:Number(b.c)})).sort((a,b)=>a.time-b.time);
   if(rows.length<25)throw Error("Insufficient valid broker chart bars");
   studyChart=LW.createChart(node,{width:Math.max(300,node.clientWidth),height:360,
    layout:{background:{color:"#07131c"},textColor:"#aab9c3"},grid:{vertLines:{color:"#10222e"},horzLines:{color:"#10222e"}},
    rightPriceScale:{borderColor:"#24404e"},timeScale:{borderColor:"#24404e",timeVisible:true,secondsVisible:false}});
   const candle=studyChart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",borderVisible:false,wickUpColor:"#31d6a4",wickDownColor:"#ff6079"});
   candle.setData(rows);
   const p=d.confirmation;if(p){
    const green=p.direction>0,col=green?"#31d6a4":"#ff6079";
    const markerTime=Number(p.signalCandleTime)-Number(d.brokerUtcOffsetSeconds);
    if(rows.some(b=>b.time===markerTime)&&candle.setMarkers)candle.setMarkers([{time:markerTime,
      position:green?"belowBar":"aboveBar",color:col,shape:green?"arrowUp":"arrowDown",text:(green?"BUY":"SELL")+" CLOSED CONFIRMED"}]);
    for(const [price,name,color,lineStyle] of [[p.entryLow,"ENTRY LOW",col,2],[p.entryHigh,"ENTRY HIGH",col,2],
     [p.invalidation,"INVALIDATION","#f2c75b",0],[p.tp1,"TP1","#71c3fa",2],[p.tp2,"TP2","#71c3fa",2],[p.tp3,"TP3","#71c3fa",2]]){
      if(Number.isFinite(Number(price)))candle.createPriceLine({price:Number(price),color,lineWidth:1,lineStyle,axisLabelVisible:true,title:name});
    }
   }
   studyChart.timeScale().fitContent();
   put("gfStudyChartNote","Vantage MT5 • chart times normalized from broker UTC+3 to UTC. Current forming bar may be drawn for context; the CONFIRMATION marker only uses a CLOSED candle. This is not an executed-trade record.");
  }catch(e){if(studyChart){studyChart.remove();studyChart=null}node.textContent="Broker chart rendering unavailable.";put("gfStudyChartNote","Data visualization unavailable; trade-ready status does not depend on chart rendering.")}
 }
 window.addEventListener("resize",function(){if(studyChart&&$("gfStudyChart"))studyChart.applyOptions({width:Math.max(300,$("gfStudyChart").clientWidth)})});
 const colors={BUY_ENTRY_READY:"g",SELL_ENTRY_READY:"r",BUY_CONFIRMED:"g",SELL_CONFIRMED:"r",BUY_INVALID:"r",SELL_INVALID:"r",WAIT_CONFIRMATION:"y",WAIT_CONFLICT:"y",MISSED_ENTRY:"y",EXPIRED:"y",DATA_UNVERIFIED:"y",MARKET_OFFLINE:"y"};
 function render(d){
  state.last=d;
  const st=String(d?.status||"DATA_UNVERIFIED"),p=d?.confirmation||null;
  put("gfStudyState",st.replaceAll("_"," "));
  $("gfStudyState").className=colors[st]||"y";
  put("gfStudyReason",d?.reason||"No verified study state.");
  put("gfStudyFresh",[d?.symbol||"",d?.tf||"",d?.closedAtUTC||"N/A",d?.quoteAgeSeconds==null?"Tick N/A":"Tick "+d.quoteAgeSeconds+" s"].filter(Boolean).join(" • "));
  put("gfConfirmTime",p?"Confirmed candle closed at "+p.confirmationCloseUTC+" • expires after 3 closed bars":"No confirmed closed trigger candle");
  let decision="NO ENTRY",hint="WAIT for a fresh confirmed candle. No broker order is sent.";
  if(d?.canEnter && ["BUY_ENTRY_READY","SELL_ENTRY_READY"].includes(st)){
    decision=p?.side+" • ENTRY READY";hint="Verified CLOSED candle + FRESH "+d.entryQuoteSide+" inside entry area. Study ONLY; confirm your own trade.";
  }else if(["BUY_CONFIRMED","SELL_CONFIRMED"].includes(st)){
    decision=p?.side+" CONFIRMED • WAIT RETEST";hint="The direction has confirmed but the quote is OUTSIDE the entry range. Do not chase.";
  }else if(["BUY_INVALID","SELL_INVALID"].includes(st)){
    decision=p?.side+" INVALID • NO ENTRY";hint=d?.invalidationBasis==="INTRABAR_QUOTE"?"Live price crossed study invalidation; close validation is pending but entry blocked.":"Closed candle crossed the original invalidation. Previous setup is cancelled.";
  }else if(st==="MISSED_ENTRY"){decision="MISSED ENTRY • NO CHASE";hint="Price already moved beyond the safe retest band. Wait for a NEW closed-candle setup."}
  else if(st==="EXPIRED"){decision="EXPIRED • NO ENTRY";hint="Three closed trigger candles passed; a new setup must be confirmed."}
  else if(st==="MARKET_OFFLINE"){decision="OFFLINE • NO ENTRY";hint="No verified fresh broker quote or closed-candle feed."}
  else if(st==="WAIT_CONFLICT"){decision="CONFLICT • WAIT";hint="Pattern disagrees with higher timeframe/fundamental context."}
  else if(st==="DATA_UNVERIFIED"){decision="DATA UNVERIFIED";hint="Source quality is insufficient; cannot issue a new trade-ready indication."}
  put("gfEntryDecision",decision);$("gfEntryDecision").className=d?.canEnter?(p?.direction>0?"g":"r"):"y";
  put("gfEntryHint",hint);
  put("gfEntryRange",p?safe(p.entryLow)+" — "+safe(p.entryHigh):"—");
  put("gfInvalidate",p?safe(p.invalidation):"—");put("gfTP1",p?safe(p.tp1):"—");
  put("gfTP2",p?safe(p.tp2):"—");put("gfTP3",p?safe(p.tp3):"—");
  const h1=v=>v===1?"BULLISH":v===-1?"BEARISH":"NEUTRAL / N/A";
  put("gfStudyTechnical",[
    "Broker: "+(d?.source||d?.technicalSource||"VANTAGE MT5"),
    "H1: "+h1(d?.h1Trend)+"; H4: "+h1(d?.h4Trend),
    p?"Closed candle: "+p.confirmationType+" • Confluence score "+p.score+"/100 (NOT win probability)":"No validated signal candle",
    p?"Entry quote "+(d?.entryQuoteSide||"—")+": "+safe(d?.entryQuote):"",
    p?"Exit plan: invalidation "+safe(p.invalidation)+"; TP levels are derived hypothetical R multiples.":""
  ].filter(Boolean).join("\n"));
  const macro=d?.news,events=macro?.cards||[],find=id=>events.find(x=>x.id===id);
  const ids=["CPI","FEDUPPER","USDBROAD","US2Y","US10Y","REAL10Y","NETLIQ"];
  put("gfStudyMacro",macro?[
    "Derived gold macro context: "+(macro.gold?.bias||"N/A")+" • Score "+safe(macro.gold?.score)+"/100 (NOT a directional guarantee)",
    "Official/derived coverage: "+safe(macro.quality?.available)+"/"+safe(macro.quality?.total)+"; source errors "+(macro.quality?.errors?.length||0),
    ...ids.map(id=>{const x=find(id);return x?id+": "+(x.display||"N/A")+" • Period "+(x.date||"N/A")+" • "+(x.status||""):""}),
    "Important: no verified release timestamp or consensus forecast is claimed here. Market price confirmation is required."
  ].filter(Boolean).join("\n"):"Macro context not verified / unavailable. AI & News modes must fail closed when required source data is incomplete.");
  $("gfStudyNote").textContent=d?.limitation||"CLOSED-CANDLE RESEARCH • A BUY/SELL CONFIRMED label does NOT mean an executed position.";
  $("gfStudyNote").className="notice "+(d?.ok?"info":"bad");
  drawStudyChart(d);
 }
 async function load(){
  if(!isGF())return;
  if(state.busy){state.seq++;return}
  const seq=++state.seq,symbol=window.selectedSymbol||$("symbolSelect")?.value,tf=window.selectedTF||$("tfSelect")?.value||"M15",m=mode();
  if(!symbol)return;
  state.busy=true;put("gfStudyFresh","Refreshing broker and fundamental observations...");
  try{
   const r=await fetch("/api/study?symbol="+encodeURIComponent(symbol)+"&tf="+encodeURIComponent(tf)+"&mode="+m,{cache:"no-store"});
   const d=await r.json();if(!r.ok)throw Error(d?.error||"HTTP "+r.status);
   if(symbol===(window.selectedSymbol||$("symbolSelect")?.value)&&tf===(window.selectedTF||$("tfSelect")?.value)&&m===mode())render(d);
  }catch(e){render({ok:false,status:"DATA_UNVERIFIED",reason:"Study API unavailable. Entry blocked.",limitation:String(e.message||e)})}
  finally{state.busy=false;if(state.seq!==seq&&isGF())setTimeout(load,0)}
 }
 window.GFStudy={load,getLast:()=>state.last};
 if($("gfStudyRefresh"))$("gfStudyRefresh").onclick=load;
 // API returns only positive exact-symbol fresh ticks. Unsampled symbols never count as ONLINE.
 const market={last:null,at:0,attempt:0,promise:null};
 function needsUpdate(){return !market.promise&&Date.now()-market.at>25000&&Date.now()-market.attempt>20000}
 async function ensure(){
  if(market.promise)return market.promise;
  if(!needsUpdate())return market.last;
  market.attempt=Date.now();
  market.promise=(async()=>{
   try{const r=await fetch("/api/market-online",{cache:"no-store"}),d=await r.json();market.last=r.ok&&d.ok?d:null;market.at=Date.now();return market.last}
   catch(e){market.last=null;market.at=Date.now();return null}
   finally{market.promise=null}
  })();
  return market.promise;
 }
 function has(symbol,cat){
  if(!market.last||market.last.ok!==true)return false;
  return cat==="MARKET_24H"?market.last.market24hWeekendVerified?.includes(symbol):market.last.verified?.includes(symbol);
 }
 function note(cat){
  if(!market.last)return "Checking Vantage MT5 tradeMode and fresh broker ticks… No unverified symbol is labelled ONLINE.";
  let s=market.last;
  return (cat==="MARKET_24H"?"Weekend LIVE verified currently: "+s.market24hWeekendVerified.length:
          "MARKET ONLINE verified: "+s.verified.length)+
    " • sampled "+s.sampled+"/"+s.catalogCount+" broker symbols • "+(s.partialCoverage?"PARTIAL COVERAGE":"FULL COVERAGE")+
    " • "+s.asOfUTC+". Weekend-active means verified NOW, not guaranteed permanent 24/7 opening.";
 }
 window.GFMarket={ensure,has,note,needsUpdate};
 setInterval(function(){
  if(["MARKET_ONLINE","MARKET_24H"].includes($("category")?.value)){
    market.at=0;ensure().then(function(){if(window.applySymbolFilter)window.applySymbolFilter()});
  }
 },30000);
})();
