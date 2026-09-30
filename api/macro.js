const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const finite=v=>Number.isFinite(Number(v));
const num=v=>{if(v==null||String(v).trim()==="")return null;const n=Number(String(v).replace(/,/g,"").replace(/\s/g,""));return Number.isFinite(n)?n:null};
const fmt=(v,d=2)=>finite(v)?Number(v).toFixed(d):null;
const pct=(a,b)=>finite(a)&&finite(b)&&Number(b)!==0?100*(Number(a)-Number(b))/Number(b):null;
const score=(v,lo,hi)=>finite(v)?clamp(100*(Number(v)-lo)/(hi-lo)):50;
const rx=(s,f="i")=>new RegExp(s,f);
function clean(s){return String(s||"").replace(rx("<[^>]+>","g")," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim()}
async function fetchText(url,ms=6500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,cache:"no-store",headers:{"User-Agent":"GoldFlow-Intelligence/7.5"}});if(!r.ok)throw new Error("HTTP "+r.status);return await r.text()}finally{clearTimeout(t)}}
async function fetchJson(url,ms=6500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,cache:"no-store",headers:{"User-Agent":"GoldFlow-Intelligence/7.5"}});if(!r.ok)throw new Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}}
function last(a,n=0){return a&&a.length>n?a[a.length-1-n]:null}
function delta(a,n=1){const x=last(a),y=last(a,n);return x&&y?x.value-y.value:null}
function yoy(a){const x=last(a),y=last(a,12);return x&&y?pct(x.value,y.value):null}
function monthDate(y,p){const m=Number(String(p).replace("M",""));return y&&m>=1&&m<=12?String(y)+"-"+String(m).padStart(2,"0")+"-01":null}
async function bls(id){
  const j=await fetchJson("https://api.bls.gov/publicAPI/v2/timeseries/data/"+encodeURIComponent(id));
  const s=j&&j.Results&&j.Results.series&&j.Results.series[0];if(!s)throw new Error("BLS "+id+" no data");
  return (s.data||[]).filter(x=>/^M\d{2}$/.test(x.period)).map(x=>({date:monthDate(x.year,x.period),value:num(x.value)})).filter(x=>x.date&&finite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));
}
async function beaGDP(){
  const t=clean(await fetchText("https://www.bea.gov/data/gdp/gross-domestic-product"));
  let ms=[...t.matchAll(rx("Q([1-4])\\s+(20\\d{2})\\s*\\([^)]{1,20}\\)\\s*[|:]?\\s*([+-]?\\d+(?:\\.\\d+)?)%","ig"))];
  if(!ms.length)ms=[...t.matchAll(rx("Q([1-4])\\s+(20\\d{2})[^%]{0,50}([+-]?\\d+(?:\\.\\d+)?)%","ig"))];
  if(!ms.length)throw new Error("BEA GDP parse");
  const m=ms[0],q=Number(m[1]),v=Number(m[3]);
  return {value:v,date:m[2]+"-"+String(q*3).padStart(2,"0")+"-30",change:ms[1]?v-Number(ms[1][3]):null,url:"https://www.bea.gov/data/gdp/gross-domestic-product"};
}
async function beaPCE(){
  const t=clean(await fetchText("https://www.bea.gov/data/personal-consumption-expenditures-price-index-excluding-food-and-energy"));
  const names="January|February|March|April|May|June|July|August|September|October|November|December";
  const ms=[...t.matchAll(rx("("+names+")\\s+(20\\d{2})\\s+([+-]?\\d+(?:\\.\\d+)?)%","ig"))];
  if(!ms.length)throw new Error("BEA PCE parse");
  const map={January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",July:"07",August:"08",September:"09",October:"10",November:"11",December:"12"};
  const m=ms[0],v=Number(m[3]);return {value:v,date:m[2]+"-"+map[m[1]]+"-01",change:ms[1]?v-Number(ms[1][3]):null,url:"https://www.bea.gov/data/personal-consumption-expenditures-price-index-excluding-food-and-energy"}
}
async function fedIP(){
  const t=clean(await fetchText("https://www.federalreserve.gov/releases/g17/current/default.htm"));
  const m=t.match(rx("([0-9]+(?:\\.[0-9]+)?)\\s+percent\\s+(above|below)\\s+its\\s+year-earlier\\s+level","i"));
  if(!m)throw new Error("Fed G17 parse");
  const d=t.match(rx("Release Date:\\s*([A-Za-z]+\\s+[0-9]{1,2},\\s*20[0-9]{2})","i"));
  let v=Number(m[1]);if(String(m[2]).toLowerCase()==="below")v=-v;
  return {value:v,date:d?new Date(d[1]).toISOString().slice(0,10):null,url:"https://www.federalreserve.gov/releases/g17/current/default.htm"};
}
function xmlVal(e,k){const m=e.match(rx("<d:"+k+"[^>]*>([^<]+)</d:"+k+">","i"));return m?m[1]:null}
function parseTreasury(x,key){return [...String(x).matchAll(rx("<entry>([\\s\\S]*?)</entry>","ig"))].map(m=>m[1]).map(e=>({date:(xmlVal(e,"NEW_DATE")||"").slice(0,10),value:num(xmlVal(e,key))})).filter(x=>x.date&&finite(x.value)).sort((a,b)=>a.date.localeCompare(b.date))}
async function treasury(data,key){
  const d=new Date(),out=[];
  for(let b=0;b<2;b++){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-b,1)),mo=String(x.getUTCFullYear())+String(x.getUTCMonth()+1).padStart(2,"0");try{out.push(...parseTreasury(await fetchText("https://home.treasury.gov/resource-center/data-chart-center/interest-rates/pages/xml?data="+data+"&field_tdr_date_value_month="+mo),key))}catch{}}
  out.sort((a,b)=>a.date.localeCompare(b.date));if(!out.length)throw new Error("Treasury "+key+" no data");return out
}
async function h41(){
  const t=clean(await fetchText("https://www.federalreserve.gov/releases/h41/Current/"));
  const am=[...t.matchAll(rx("Total\\s+assets[\\s\\S]{0,120}?([0-9][0-9,]{5,})","ig"))];
  const gm=[...t.matchAll(rx("U\\.S\\.\\s+Treasury,\\s+General\\s+Account[\\s\\S]{0,120}?([0-9][0-9,]{3,})","ig"))];
  const d=t.match(rx("Release Date:\\s*([A-Za-z]+\\s+[0-9]{1,2},\\s*20[0-9]{2})","i"));
  if(!am.length||!gm.length)throw new Error("Fed H41 parse");
  return {assets:num(am[0][1]),assetsCh:null,tga:num(gm[0][1]),tgaCh:null,date:d?new Date(d[1]).toISOString().slice(0,10):null,url:"https://www.federalreserve.gov/releases/h41/Current/"};
}
async function nyfed(){
  const [dataText,policyText]=await Promise.all([
    fetchText("https://www.newyorkfed.org/markets/data-hub"),
    fetchText("https://www.federalreserve.gov/monetarypolicy/openmarket.htm")
  ]);
  const t=clean(dataText), p=clean(policyText);
  const yr=String(new Date().getUTCFullYear());
  const seg=(p.split(yr)[1]||p).slice(0,2600);

  // Current-year Fed table row is like: September 17 25 0 3.75-4.00
  let trg=seg.match(rx("([A-Za-z]+)\\s+([0-9]{1,2})\\s+[0-9]+\\s+[0-9]+\\s+([0-9]+\\.[0-9]+)\\s*-\\s*([0-9]+\\.[0-9]+)","i"));
  let low=null,high=null,targetDate=null;
  if(trg){
    low=num(trg[3]); high=num(trg[4]);
    const months={January:0,February:1,March:2,April:3,May:4,June:5,July:6,August:7,September:8,October:9,November:10,December:11};
    const mk=Object.keys(months).find(k=>k.toLowerCase()===String(trg[1]).toLowerCase());
    if(mk)targetDate=new Date(Date.UTC(Number(yr),months[mk],Number(trg[2]))).toISOString().slice(0,10);
  } else {
    trg=seg.match(rx("([0-9]+\\.[0-9]+)\\s*-\\s*([0-9]+\\.[0-9]+)","i"));
    if(trg){low=num(trg[1]);high=num(trg[2]);}
  }

  const rr=t.match(rx("Reverse\\s+Repo\\s+Operations[\\s\\S]{0,900}?Treasury\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)","i"));
  const sf=t.match(rx("Secured\\s+Overnight\\s+Financing\\s+Rate[\\s\\S]{0,700}?([0-9]+(?:\\.[0-9]+)?)\\s+[0-9,]+","i"));
  return {
    low,high,targetDate,
    rrp:rr?num(rr[2]):null,
    sofr:sf?num(sf[1]):null,
    targetUrl:"https://www.federalreserve.gov/monetarypolicy/openmarket.htm",
    url:"https://www.newyorkfed.org/markets/data-hub"
  };
}
async function h10(){
  const t=clean(await fetchText("https://www.federalreserve.gov/releases/h10/current/"));
  const m=t.match(rx("1\\)\\s+BROAD\\s+JAN06=100\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)","i"));
  const d=t.match(rx("Release Date:\\s*([A-Za-z]+\\s+[0-9]{1,2},\\s*20[0-9]{2})","i"));
  if(!m)throw new Error("Fed H10 parse");
  return {value:num(m[5]),change:num(m[5])-num(m[1]),date:d?new Date(d[1]).toISOString().slice(0,10):null,url:"https://www.federalreserve.gov/releases/h10/current/"};
}
function mk(id,name,value,display,date,source,url,change,label,impact,detail,official=true){return{id,name,value,display,date,source,seriesUrl:url,change,changeLabel:label,goldImpact:impact,detail,frequency:"Official release",stale:!date,status:official?"OFFICIAL":"DERIVED",transport:"Direct source"}}
function imp(v,pos=true,th=0){if(!finite(v))return"MIXED";return Number(v)>th?(pos?"SUPPORTIVE":"PRESSURE"):Number(v)<-th?(pos?"PRESSURE":"SUPPORTIVE"):"MIXED"}
function regime(g,i){return g>=50?(i>=50?"REFLATION":"GOLDILOCKS"):(i>=50?"STAGFLATION":"SLOWDOWN")}
function lab(s){return s>=60?"SUPPORTIVE":s<=40?"PRESSURE":"MIXED"}

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=1800");
  const jobs=await Promise.allSettled([beaGDP(),beaPCE(),fedIP(),bls("CES0000000001"),bls("LNS14000000"),bls("CUSR0000SA0"),treasury("daily_treasury_yield_curve","BC_2YEAR"),treasury("daily_treasury_yield_curve","BC_10YEAR"),treasury("daily_treasury_real_yield_curve","TC_10YEAR"),h41(),nyfed(),h10()]);
  const v=i=>jobs[i].status==="fulfilled"?jobs[i].value:null,errors=jobs.map((x,i)=>x.status==="rejected"?"source"+i+": "+String(x.reason?.message||x.reason):null).filter(Boolean);
  const gdp=v(0),pce=v(1),ip=v(2),pay=v(3)||[],ur=v(4)||[],cp=v(5)||[],u2=v(6)||[],u10=v(7)||[],r10=v(8)||[],fed=v(9),ny=v(10)||{},usd=v(11);
  const payroll=delta(pay),payPrev=last(pay,1)&&last(pay,2)?last(pay,1).value-last(pay,2).value:null,unrate=last(ur)?.value,un3=delta(ur,3),cpi=yoy(cp),cpi3=last(cp,3)&&last(cp,15)?pct(last(cp,3).value,last(cp,15).value):null;
  const y2=last(u2),y10=last(u10),real=last(r10),breakeven=finite(y10?.value)&&finite(real?.value)?y10.value-real.value:null;
  const net=finite(fed?.assets)&&finite(fed?.tga)&&finite(ny.rrp)?fed.assets-fed.tga-ny.rrp*1000:null,netCh=finite(fed?.assetsCh)&&finite(fed?.tgaCh)?fed.assetsCh-fed.tgaCh:null;
  const cards=[
    mk("GDP","Real GDP",gdp?.value,finite(gdp?.value)?fmt(gdp.value,1)+"% SAAR":null,gdp?.date,"BEA",gdp?.url,gdp?.change,"vs prior quarter",imp(gdp?.change,false,.1),"Quarterly real GDP growth."),
    mk("IP","Industrial Production",ip?.value,finite(ip?.value)?fmt(ip.value,2)+"% YoY":null,ip?.date,"Federal Reserve G.17",ip?.url,null,"year-over-year",imp(ip?.value,false,.2),"Official industrial production."),
    mk("PAYEMS","Nonfarm Payroll Change",payroll,finite(payroll)?(payroll>=0?"+":"")+fmt(payroll,0)+"K":null,last(pay)?.date,"BLS","https://www.bls.gov/ces/",finite(payroll)&&finite(payPrev)?payroll-payPrev:null,"vs prior monthly change",finite(payroll)?(payroll<100?"SUPPORTIVE":payroll>200?"PRESSURE":"MIXED"):"MIXED","Total nonfarm payroll monthly change."),
    mk("UNRATE","Unemployment",unrate,finite(unrate)?fmt(unrate,1)+"%":null,last(ur)?.date,"BLS","https://www.bls.gov/cps/",un3,"3-month change",imp(un3,true,.05),"Official unemployment rate."),
    mk("CPI","CPI Inflation",cpi,finite(cpi)?fmt(cpi,2)+"% YoY":null,last(cp)?.date,"BLS","https://www.bls.gov/cpi/",finite(cpi)&&finite(cpi3)?cpi-cpi3:null,"3-month YoY trend","MIXED","Headline CPI year-over-year."),
    mk("COREPCE","Core PCE",pce?.value,finite(pce?.value)?fmt(pce.value,2)+"% YoY":null,pce?.date,"BEA",pce?.url,pce?.change,"vs prior month YoY","MIXED","Core PCE year-over-year."),
    mk("BREAKEVEN10","10Y Breakeven",breakeven,finite(breakeven)?fmt(breakeven,2)+"%":null,y10?.date,"U.S. Treasury derived","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",null,"nominal 10Y - real 10Y",finite(breakeven)?(breakeven>2.4?"SUPPORTIVE":breakeven<1.8?"PRESSURE":"MIXED"):"MIXED","Derived from official Treasury yields.",false),
    mk("FEDUPPER","Fed Target Upper",ny.high,finite(ny.high)?fmt(ny.high,2)+"%":null,ny.targetDate||null,"Federal Reserve Board",ny.targetUrl||ny.url,null,"current target range",finite(ny.high)?(ny.high>=4?"PRESSURE":ny.high<=3?"SUPPORTIVE":"MIXED"):"MIXED","Federal funds target upper bound."),
    mk("WALCL","Fed Balance Sheet",fed?.assets,finite(fed?.assets)?"$"+fmt(fed.assets/1e6,2)+"T":null,fed?.date,"Federal Reserve H.4.1",fed?.url,fed?.assetsCh,"weekly change, USD mn",imp(fed?.assetsCh,true,0),"Federal Reserve total assets."),
    mk("NETLIQ","Net Liquidity Proxy",net,finite(net)?"$"+fmt(net/1e6,2)+"T":null,fed?.date,"Derived Fed/NY Fed",fed?.url,netCh,"weekly proxy change, USD mn",imp(netCh,true,0),"Fed assets - TGA - ON RRP.",false),
    mk("US2Y","US 2Y Yield",y2?.value,finite(y2?.value)?fmt(y2.value,2)+"%":null,y2?.date,"U.S. Treasury","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",delta(u2,5),"5-observation change",imp(delta(u2,5),false,.02),"Official 2-year Treasury yield."),
    mk("US10Y","US 10Y Yield",y10?.value,finite(y10?.value)?fmt(y10.value,2)+"%":null,y10?.date,"U.S. Treasury","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",delta(u10,5),"5-observation change",imp(delta(u10,5),false,.02),"Official 10-year Treasury yield."),
    mk("REAL10Y","US 10Y Real Yield",real?.value,finite(real?.value)?fmt(real.value,2)+"%":null,real?.date,"U.S. Treasury","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",delta(r10,5),"5-observation change",imp(delta(r10,5),false,.02),"Official 10-year real yield."),
    mk("USDBROAD","Broad USD Index",usd?.value,finite(usd?.value)?fmt(usd.value,2):null,usd?.date,"Federal Reserve H.10",usd?.url,usd?.change,"5-day change",imp(usd?.change,false,.05),"Official broad U.S. dollar index.")
  ];
  const growth=clamp((score(gdp?.value,-1,5)+score(ip?.value,-3,4)+score(payroll,-100,300)+(finite(unrate)?100-score(unrate,3,6):50))/4);
  const inflation=clamp((score(cpi,1.5,4.5)+score(pce?.value,1.5,4)+score(breakeven,1.5,3))/3);
  const realPressure=score(real?.value,0,3),policy=clamp(.55*score(ny.high,2,6)+.45*realPressure),liquidity=finite(netCh)?score(netCh,-100000,100000):50,dollar=finite(usd?.change)?score(usd.change,-1.5,1.5):50;
  const reg=regime(growth,inflation),goldScore=clamp(.22*inflation+.28*(100-realPressure)+.18*liquidity+.12*(100-growth)+.20*(100-dollar)),goldBias=lab(goldScore);
  const timeline=[];for(let i=11;i>=0;i--){const a=last(cp,i),b=last(cp,i+12),p0=last(pay,i),p1=last(pay,i+1),u=last(ur,i);if(!a||!b||!p0||!p1||!u)continue;const inf=pct(a.value,b.value),pm=p0.value-p1.value,g=clamp((score(pm,-100,300)+(100-score(u.value,3,6)))/2),ii=score(inf,1.5,4.5);timeline.push({date:a.date,month:a.date.slice(0,7),regime:regime(g,ii),growth:Math.round(g),inflation:Math.round(ii),liquidity:50})}
  const quality={available:cards.filter(x=>finite(x.value)).length,total:cards.length,errors};
  return res.status(200).json({ok:true,official:true,modelDerived:true,fetchedAt:new Date().toISOString(),provider:"Direct official sources: BLS, BEA, Federal Reserve, U.S. Treasury, New York Fed",cards,scores:{growth:Math.round(growth),inflation:Math.round(inflation),policy:Math.round(policy),liquidity:Math.round(liquidity),realYield:Math.round(realPressure),dollar:Math.round(dollar)},regime:{name:reg,note:({REFLATION:"Growth and inflation are both firm.",GOLDILOCKS:"Growth is firm while inflation pressure is softer.",STAGFLATION:"Growth is weak while inflation remains firm.",SLOWDOWN:"Growth and inflation are both softer."})[reg],confidence:Math.round(clamp(45+(quality.available/quality.total)*40,35,90))},gold:{score:Math.round(goldScore),bias:goldBias,note:"DERIVED macro context only - not a trade signal or guaranteed direction."},playbook:{gold:{label:goldBias,detail:"Derived from inflation, real yields, liquidity, growth and broad USD."},usd:{label:lab(clamp(.55*dollar+.45*policy)),detail:"Official Fed broad USD momentum plus policy pressure."},treasury:{label:inflation>=60||policy>=60?"PRESSURE":"MIXED",detail:"Inflation and policy context; not a yield forecast."},equities:{label:growth>=55&&policy<60?"SUPPORTIVE":growth<45||policy>70?"PRESSURE":"MIXED",detail:"Growth versus restrictive policy."},oil:{label:reg==="REFLATION"?"SUPPORTIVE":reg==="SLOWDOWN"?"PRESSURE":"MIXED",detail:"Cyclical demand context."}},timeline,quality,methodology:{official:"Primary values are fetched directly from BLS, BEA, Federal Reserve Board, U.S. Treasury and New York Fed.",derived:"Regime, scores, 10Y breakeven and Net Liquidity Proxy are GoldFlow calculations from official inputs.",revisions:"BLS monthly history is used for the 12-month timeline; GDP/PCE may be revised by BEA.",netLiquidity:"Net Liquidity Proxy = Fed total assets - Treasury General Account - overnight reverse repo.",fallback:"FRED is not required for the primary path; it can be used later only as a cross-check."}});
}