(function(root){
 "use strict";
 const TFSEC={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400,W1:604800,MN1:2592000};
 const RANGESEC={D1:86400,D5:432000,M1:2592000,M3:7776000,M6:15552000,Y1:31536000,Y5:157680000};
 const DEFAULT={style:"candles",crosshair:true,grid:true,range:"ALL",shiftBars:16,indicators:{SMA20:false,SMA50:false,SMA200:false,EMA20:true,EMA50:false,EMA200:false,BB20:false}};
 const S={};
 const clone=o=>JSON.parse(JSON.stringify(o));
 function state(scope){
  if(S[scope])return S[scope];
  let prefs=clone(DEFAULT);
  try{const x=JSON.parse(localStorage.getItem("gf_chart_tools_"+scope)||"null");if(x&&typeof x==="object")prefs={...prefs,...x,indicators:{...prefs.indicators,...(x.indicators||{})}}}catch(e){}
  return S[scope]={prefs,ctx:null,callbacks:null,drawings:{hlines:[],trends:[]},drawMode:null,firstPoint:null,contextKey:null};
 }
 function save(scope){try{localStorage.setItem("gf_chart_tools_"+scope,JSON.stringify(state(scope).prefs))}catch(e){}}
 function normBars(bars){return (Array.isArray(bars)?bars:[]).map(b=>({time:Number(b.time??b.t),close:Number(b.close??b.c),open:Number(b.open??b.o),high:Number(b.high??b.h),low:Number(b.low??b.l)})).filter(b=>[b.time,b.close].every(Number.isFinite)).sort((a,b)=>a.time-b.time)}
 function smaData(bars,n){
  const out=[],q=[];let sum=0;
  bars.forEach(b=>{q.push(b.close);sum+=b.close;if(q.length>n)sum-=q.shift();if(q.length===n)out.push({time:b.time,value:sum/n})});return out;
 }
 function emaData(bars,n){
  if(bars.length<n)return[];const out=[],k=2/(n+1);let e=bars.slice(0,n).reduce((a,b)=>a+b.close,0)/n;
  out.push({time:bars[n-1].time,value:e});for(let i=n;i<bars.length;i++){e=bars[i].close*k+e*(1-k);out.push({time:bars[i].time,value:e})}return out;
 }
 function bbData(bars,n=20,m=2){
  const up=[],mid=[],lo=[],q=[];
  bars.forEach(b=>{q.push(b.close);if(q.length>n)q.shift();if(q.length===n){const mean=q.reduce((a,x)=>a+x,0)/n,sd=Math.sqrt(q.reduce((a,x)=>a+(x-mean)*(x-mean),0)/n);mid.push({time:b.time,value:mean});up.push({time:b.time,value:mean+m*sd});lo.push({time:b.time,value:mean-m*sd})}});
  return {up,mid,lo};
 }
 function addLine(chart,data,title,color,width=1){
  if(!data.length)return null;const s=chart.addLineSeries({title,color,lineWidth:width,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});s.setData(data);return s;
 }
 function applyIndicators(scope,chart,bars){
  const p=state(scope).prefs,b=normBars(bars),i=p.indicators||{};
  if(i.SMA20)addLine(chart,smaData(b,20),"SMA20","#7ab8ff");
  if(i.SMA50)addLine(chart,smaData(b,50),"SMA50","#b090ff");
  if(i.SMA200)addLine(chart,smaData(b,200),"SMA200","#f2c75b",2);
  if(i.EMA20)addLine(chart,emaData(b,20),"EMA20","#31d6a4");
  if(i.EMA50)addLine(chart,emaData(b,50),"EMA50","#ff9f5a");
  if(i.EMA200)addLine(chart,emaData(b,200),"EMA200","#ff6079",2);
  if(i.BB20){const bb=bbData(b,20,2);addLine(chart,bb.up,"BB U","#6f8796");addLine(chart,bb.mid,"BB M","#8aa3b1");addLine(chart,bb.lo,"BB L","#6f8796")}
 }
 function createMainSeries(scope,chart,bars){
  const p=state(scope).prefs,b=normBars(bars);let series;
  if(p.style==="line"){series=chart.addLineSeries({color:"#6fd6ff",lineWidth:2,priceLineVisible:true,lastValueVisible:true});series.setData(b.map(x=>({time:x.time,value:x.close})))}
  else{series=chart.addCandlestickSeries({upColor:"#31d6a4",downColor:"#ff6079",borderVisible:false,wickUpColor:"#31d6a4",wickDownColor:"#ff6079"});series.setData(b.map(x=>({time:x.time,open:x.open,high:x.high,low:x.low,close:x.close})))}
  return series;
 }
 function safeShiftBars(p){const n=Math.trunc(Number(p?.shiftBars));return Number.isFinite(n)?Math.max(0,Math.min(50,n)):16}
 function applyShift(scope){const s=state(scope),c=s.ctx;if(!c)return;try{c.chart.timeScale().applyOptions({rightOffset:safeShiftBars(s.prefs)})}catch(e){}}
 function applyView(scope){
  const s=state(scope),c=s.ctx;if(!c)return;const p=s.prefs,shift=safeShiftBars(p);
  c.chart.applyOptions({grid:{vertLines:{visible:p.grid,color:"#10222e"},horzLines:{visible:p.grid,color:"#10222e"}},crosshair:{vertLine:{visible:p.crosshair},horzLine:{visible:p.crosshair}},timeScale:{rightOffset:shift}});
  const bars=normBars(c.bars),range=p.range;
  if(!bars.length)return;
  if(range==="ALL"){c.chart.timeScale().fitContent();applyShift(scope);return}
  let seconds=RANGESEC[range];
  if(range==="YTD"){const now=new Date(),start=Date.UTC(now.getUTCFullYear(),0,1)/1000,latest=bars.at(-1).time;seconds=Math.max(86400,latest-start)}
  if(!seconds){c.chart.timeScale().fitContent();applyShift(scope);return}
  const tf=TFSEC[c.tf]||300,count=Math.max(10,Math.ceil(seconds/tf)),len=bars.length;
  c.chart.timeScale().setVisibleLogicalRange({from:Math.max(-1,len-count-1),to:Math.max(len-1,len-1+shift)});
 }
 function drawStored(scope){
  const s=state(scope),c=s.ctx;if(!c)return;
  s.drawings.hlines.forEach(x=>{try{x.handle=c.main.createPriceLine({price:x.price,color:"#f2c75b",lineWidth:1,lineStyle:2,axisLabelVisible:true,title:"H-LINE"})}catch(e){}});
  s.drawings.trends.forEach(x=>{try{const ls=c.chart.addLineSeries({color:"#f2c75b",lineWidth:2,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false});ls.setData(x.points.slice().sort((a,b)=>a.time-b.time));x.handle=ls}catch(e){}});
 }
 function register(scope,ctx){
  const s=state(scope);s.ctx=ctx;
  if(s.contextKey!==ctx.contextKey){s.drawings={hlines:[],trends:[]};s.drawMode=null;s.firstPoint=null;s.contextKey=ctx.contextKey}
  applyIndicators(scope,ctx.chart,ctx.bars);drawStored(scope);applyView(scope);
  ctx.chart.subscribeClick(param=>{
   const st=state(scope);if(st.drawMode!=="trend"||!param?.point||param.time==null)return;
   const price=ctx.main.coordinateToPrice(param.point.y);if(!Number.isFinite(Number(price)))return;
   const point={time:Number(param.time),value:Number(price)};
   if(!st.firstPoint){st.firstPoint=point;setStatus(scope,"Trendline: click second point")}
   else{st.drawings.trends.push({points:[st.firstPoint,point]});st.firstPoint=null;st.drawMode=null;setStatus(scope,"Trendline added");st.callbacks?.redraw?.()}
  });
 }
 function zoom(scope,factor){const c=state(scope).ctx;if(!c)return;const r=c.chart.timeScale().getVisibleLogicalRange();if(!r)return;const mid=(r.from+r.to)/2,w=Math.max(5,(r.to-r.from)*factor);c.chart.timeScale().setVisibleLogicalRange({from:mid-w/2,to:mid+w/2})}
 function setStatus(scope,msg){const el=document.querySelector('[data-gf-chart-status="'+scope+'"]');if(el)el.textContent=msg||""}
 function render(scope,el,opts={}){
  const s=state(scope);s.callbacks=opts;const tfs=opts.timeframes||["M1","M5","M15","M30","H1","H4","D1"],ranges=["D1","D5","M1","M3","M6","YTD","Y1","Y5","ALL"];
  const tfLabel=x=>x==="MN1"?"MN":x;
  el.innerHTML='<div class="gfChartToolbar">'+
   '<div class="gfChartTF">'+tfs.map(tf=>'<button type="button" data-gf-tf="'+tf+'" class="'+(tf===opts.currentTF?"on":"")+'">'+tfLabel(tf)+'</button>').join("")+'</div>'+
   '<div class="gfChartActions"><select data-gf-style aria-label="Chart style"><option value="candles">Candles</option><option value="line">Line</option></select>'+
   '<details class="gfIndicatorMenu"><summary>Indicators</summary><div>'+
   ["EMA20","EMA50","EMA200","SMA20","SMA50","SMA200","BB20"].map(k=>'<label><input type="checkbox" data-gf-ind="'+k+'"> '+k.replace("BB20","Bollinger 20,2")+'</label>').join("")+
   '</div></details>'+
   '<button type="button" data-gf-cross>Crosshair</button><button type="button" data-gf-grid>Grid</button>'+
   '<select data-gf-shift aria-label="Chart shift"><option value="0">Shift OFF</option><option value="8">Shift 8</option><option value="16">Shift 16</option><option value="24">Shift 24</option><option value="32">Shift 32</option></select>'+
   '<button type="button" data-gf-hline>H-Line</button><button type="button" data-gf-trend>Trendline</button>'+
   '<button type="button" data-gf-zoom="in">＋</button><button type="button" data-gf-zoom="out">−</button>'+
   '<button type="button" data-gf-fit>Fit</button><button type="button" data-gf-clear>Clear</button></div></div>'+
   '<div class="gfChartRange">'+ranges.map(r=>'<button type="button" data-gf-range="'+r+'" class="'+(r===s.prefs.range?"on":"")+'">'+(r==="D1"?"1D":r==="D5"?"5D":r==="M1"?"1M":r==="M3"?"3M":r==="M6"?"6M":r==="Y1"?"1Y":r==="Y5"?"5Y":r)+'</button>').join("")+
   '<span data-gf-chart-status="'+scope+'">Broker chart tools</span></div>';
  const style=el.querySelector("[data-gf-style]");style.value=s.prefs.style;style.onchange=()=>{s.prefs.style=style.value;save(scope);opts.redraw?.()};
  el.querySelectorAll("[data-gf-ind]").forEach(x=>{x.checked=!!s.prefs.indicators[x.dataset.gfInd];x.onchange=()=>{s.prefs.indicators[x.dataset.gfInd]=x.checked;save(scope);opts.redraw?.()}});
  el.querySelectorAll("[data-gf-tf]").forEach(x=>x.onclick=()=>opts.onTF?.(x.dataset.gfTf));
  el.querySelectorAll("[data-gf-range]").forEach(x=>x.onclick=()=>{s.prefs.range=x.dataset.gfRange;save(scope);render(scope,el,{...opts,currentTF:opts.currentTF});applyView(scope)});
  el.querySelector("[data-gf-cross]").onclick=()=>{s.prefs.crosshair=!s.prefs.crosshair;save(scope);opts.redraw?.()};
  el.querySelector("[data-gf-grid]").onclick=()=>{s.prefs.grid=!s.prefs.grid;save(scope);opts.redraw?.()};
  const shift=el.querySelector("[data-gf-shift]");shift.value=String(safeShiftBars(s.prefs));shift.onchange=()=>{s.prefs.shiftBars=safeShiftBars({shiftBars:shift.value});save(scope);applyView(scope);setStatus(scope,s.prefs.shiftBars?"Chart Shift "+s.prefs.shiftBars+" bars":"Chart Shift OFF")};
  el.querySelector("[data-gf-hline]").onclick=()=>{const raw=prompt("Horizontal line price");if(raw===null)return;const price=Number(raw);if(!Number.isFinite(price))return setStatus(scope,"Invalid price");s.drawings.hlines.push({price});setStatus(scope,"Horizontal line added");opts.redraw?.()};
  el.querySelector("[data-gf-trend]").onclick=()=>{s.drawMode="trend";s.firstPoint=null;setStatus(scope,"Trendline: click first point on chart")};
  el.querySelector('[data-gf-zoom="in"]').onclick=()=>zoom(scope,.72);el.querySelector('[data-gf-zoom="out"]').onclick=()=>zoom(scope,1.38);
  el.querySelector("[data-gf-fit]").onclick=()=>{s.prefs.range="ALL";save(scope);render(scope,el,{...opts,currentTF:opts.currentTF});applyView(scope)};
  el.querySelector("[data-gf-clear]").onclick=()=>{s.drawings={hlines:[],trends:[]};s.drawMode=null;s.firstPoint=null;setStatus(scope,"Drawings cleared");opts.redraw?.()};
 }
 root.GFChartTools={render,register,createMainSeries,prefs:scope=>state(scope).prefs};
})(typeof window!=="undefined"?window:globalThis);
