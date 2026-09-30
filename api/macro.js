const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const finite=v=>v!==null&&v!==undefined&&String(v).trim()!==""&&Number.isFinite(Number(v));
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
function yoyAt(a,date){if(!date)return null;const yr=Number(date.slice(0,4));const x=(a||[]).find(r=>r.date===date),y=(a||[]).find(r=>r.date===(yr-1)+date.slice(4));return x&&y?pct(x.value,y.value):null}
function yoy(a){return yoyAt(a,last(a)?.date)}
function monthDate(y,p){const m=Number(String(p).replace("M",""));return y&&m>=1&&m<=12?String(y)+"-"+String(m).padStart(2,"0")+"-01":null}
async function bls(id){
  const j=await fetchJson("https://api.bls.gov/publicAPI/v2/timeseries/data/"+encodeURIComponent(id));
  const s=j&&j.Results&&j.Results.series&&j.Results.series[0];if(!s)throw new Error("BLS "+id+" no data");
  return (s.data||[]).filter(x=>/^M\d{2}$/.test(x.period)).map(x=>({date:monthDate(x.year,x.period),value:num(x.value)})).filter(x=>x.date&&finite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));
}
async function officialCpiHeadline(){
  const pages=[
    {url:"https://www.bls.gov/news.release/cpi.nr0.htm",kind:"release"},
    {url:"https://www.bls.gov/cpi/news.htm",kind:"overview"}
  ];
  const months={JANUARY:"01",FEBRUARY:"02",MARCH:"03",APRIL:"04",MAY:"05",JUNE:"06",JULY:"07",AUGUST:"08",SEPTEMBER:"09",OCTOBER:"10",NOVEMBER:"11",DECEMBER:"12"};
  const results=await Promise.allSettled(pages.map(async page=>{
    const t=clean(await fetchText(page.url,6500));
    let val=null,mon=null,year=null;
    if(page.kind==="release"){
      const h=t.match(rx("CONSUMER\\s+PRICE\\s+INDEX\\s*-\\s*(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\\s+(20\\d{2})","i"));
      const m=t.match(rx("Over\\s+the\\s+last\\s+12\\s+months[^.]{0,170}?items\\s+index\\s+increased\\s+([0-9]+(?:\\.[0-9]+)?)\\s+percent\\s+before\\s+seasonal\\s+adjustment","i"));
      if(h&&m){mon=h[1].toUpperCase();year=h[2];val=num(m[1]);}
    }else{
      const h=t.match(rx("\\bIn\\s+(January|February|March|April|May|June|July|August|September|October|November|December),\\s+the\\s+Consumer\\s+Price\\s+Index[^.]{0,300}?\\b(?:and\\s+)?rose\\s+([0-9]+(?:\\.[0-9]+)?)\\s+percent\\s+over\\s+the\\s+last\\s+12\\s+months","i"));
      const dt=t.match(rx("(\\d{1,2})/(\\d{1,2})/(20\\d{2})","i"));
      if(h&&dt){mon=h[1].toUpperCase();year=dt[3];val=num(h[2]);}
    }
    if(!mon||!year||!finite(val)||val<0||val>30)throw Error("BLS CPI release date or headline invalid");
    return {value:val,date:year+"-"+months[mon]+"-01",url:page.url};
  }));
  const valid=results.filter(r=>r.status==="fulfilled").map(r=>r.value).sort((a,b)=>b.date.localeCompare(a.date));
  if(!valid.length)throw Error("BLS CPI published headline unavailable");
  if(valid.length>1&&valid[0].date===valid[1].date&&Math.abs(valid[0].value-valid[1].value)>0.11)
    throw Error("BLS CPI official release conflict for "+valid[0].date);
  return valid[0];
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
  const am=[...t.matchAll(rx("Total\\s+assets[\\s\\S]{0,120}?([0-9][0-9,]{5,})(?:\\s+([+-]\\s*[0-9,]+))?","ig"))];
  const gm=[...t.matchAll(rx("U\\.S\\.\\s+Treasury,\\s+General\\s+Account[\\s\\S]{0,120}?([0-9][0-9,]{3,})(?:\\s+([+-]\\s*[0-9,]+))?","ig"))];
  const d=t.match(rx("Release Date:\\s*([A-Za-z]+\\s+[0-9]{1,2},\\s*20[0-9]{2})","i"));
  if(!am.length||!gm.length)throw Error("Fed H41 parse");
  // First TGA entry is the WEEKLY AVERAGE in table 1, second is WEDNESDAY LEVEL in table 5.
  const g=gm.length>=2?gm[1]:gm[0],assets=num(am[0][1]),tga=num(g[1]);
  if(!finite(assets)||!finite(tga)||assets<4e6||assets>15e6||tga<100000||tga>2e6)throw Error("Fed H41 balance-sheet validation failed");
  return {assets,assetsCh:num(am[0][2]),tga,tgaCh:num(g[2]),
    date:d?new Date(d[1]).toISOString().slice(0,10):null,
    sourcePeriod:"Wednesday snapshot",url:"https://www.federalreserve.gov/releases/h41/Current/"};
}
async function nyfed(){
  const observations=await Promise.allSettled([
    fetchText("https://www.newyorkfed.org/markets/reference-rates/effr"),
    fetchText("https://www.federalreserve.gov/monetarypolicy/openmarket.htm")
  ]);
  const e=clean(observations[0].status==="fulfilled"?observations[0].value:"");
  const p=clean(observations[1].status==="fulfilled"?observations[1].value:"");
  if(!e&&!p)throw Error("No official policy sources available");
  let low=null,high=null,targetDate=null,targetUrl=null;
  const year=new Date().getUTCFullYear();
  const months={January:"01",February:"02",March:"03",April:"04",May:"05",June:"06",July:"07",August:"08",September:"09",October:"10",November:"11",December:"12"};
  const yrSection=p.match(rx("(?:"+year+")\\s+Date\\s+Increase\\s+Decrease\\s+Level\\s*\\(%\\)\\s+([\\s\\S]{0,450})","i"));
  if(yrSection){
    const m=yrSection[1].match(rx("(January|February|March|April|May|June|July|August|September|October|November|December)\\s+(\\d{1,2})\\s+\\d+\\s+\\d+\\s+(\\d+(?:\\.\\d+)?)\\s*-\\s*(\\d+(?:\\.\\d+)?)","i"));
    if(m){low=num(m[3]);high=num(m[4]);targetDate=year+"-"+months[m[1]]+"-"+m[2].padStart(2,"0");targetUrl="https://www.federalreserve.gov/monetarypolicy/openmarket.htm";}
  }
  if(!finite(high)){
    const ranges=[...p.matchAll(rx("([0-9]+\\.[0-9]+)\\s*-\\s*([0-9]+\\.[0-9]+)","g"))].map(m=>({low:num(m[1]),high:num(m[2])}))
      .filter(x=>finite(x.low)&&finite(x.high)&&x.high>=x.low&&x.high<=10&&x.high-x.low<=1);
    if(ranges.length){low=ranges[0].low;high=ranges[0].high;targetUrl="https://www.federalreserve.gov/monetarypolicy/openmarket.htm";}
  }
  if(!finite(high)){
    const rows=[...e.matchAll(rx("([0-9]{1,2})/([0-9]{1,2})\\s+([0-9]+\\.[0-9]+)\\s+([0-9]+\\.[0-9]+)\\s+([0-9]+\\.[0-9]+)\\s+([0-9]+\\.[0-9]+)\\s+([0-9]+\\.[0-9]+)\\s+([0-9,]+)\\s+([0-9]+\\.[0-9]+)\\s*-\\s*([0-9]+\\.[0-9]+)","ig"))];
    const now=new Date();let best=null,small=Infinity;
    for(const r of rows){for(const y of [now.getUTCFullYear(),now.getUTCFullYear()-1]){
      const dt=new Date(Date.UTC(y,Number(r[1])-1,Number(r[2]))),age=now-dt;
      if(age>=-86400000&&age<small){small=age;best={r,dt};}
    }}
    if(best){low=num(best.r[9]);high=num(best.r[10]);targetDate=best.dt.toISOString().slice(0,10);targetUrl="https://www.newyorkfed.org/markets/reference-rates/effr";}
  }
  if(!finite(high)||high<low||high>10)throw Error("Fed target range could not be validated");
  return {low,high,targetDate,targetUrl,url:targetUrl};
}
async function onRrp(){
  const start=new Date(Date.now()-75*86400000).toISOString().slice(0,10);
  const results=await Promise.allSettled([
    fetchJson("https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json",6500),
    fetchText("https://fred.stlouisfed.org/graph/fredgraph.csv?id=RRPONTSYD&cosd="+start,6500)
  ]);
  let primary=null,secondary=null,history=[];
  if(results[0].status==="fulfilled"){
    const ops=results[0].value?.repo?.operations||[];
    const eligible=ops.filter(o=>/reverse\s*repo/i.test(String(o.operationType||""))&&
      /overnight/i.test(String(o.term||""))&&
      /^\d{4}-\d{2}-\d{2}$/.test(String(o.operationDate||"")));
    if(eligible.length){
      const dt=eligible.map(o=>o.operationDate).sort().at(-1);
      const matched=eligible.filter(o=>o.operationDate===dt);
      let acceptedUsd=0,valid=0;
      for(const op of matched){
        const treasury=(op.details||[]).find(d=>/treasury/i.test(String(d.securityType||"")));
        const x=num(treasury?.amtAccepted??op.totalAmtAccepted);
        if(finite(x)&&x>=0){acceptedUsd+=x;valid++;}
      }
      if(valid===matched.length&&valid>0)primary={value:acceptedUsd/1e9,date:dt,source:"New York Fed Markets API",unit:"USD billions",url:"https://www.newyorkfed.org/markets/desk-operations/reverse-repo"};
    }
  }
  if(results[1].status==="fulfilled"){
    const rows=results[1].value.trim().split(/\r?\n/).slice(1).map(line=>{
      const [date,v]=line.split(",");
      return {date,value:num(v)};
    }).filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(String(x.date))&&finite(x.value));
    if(rows.length){history=rows;secondary={...rows.at(-1),source:"NY Fed via FRED RRPONTSYD",unit:"USD billions",url:"https://fred.stlouisfed.org/series/RRPONTSYD"};}
  }
  if(primary&&secondary&&primary.date===secondary.date&&Math.abs(primary.value-secondary.value)>0.05){
    // Conflicting observations must not silently feed the liquidity model.
    throw Error("ON RRP cross-source mismatch at "+primary.date);
  }
  const chosen=primary||secondary;
  if(!chosen)throw Error("ON RRP unavailable from NY Fed operations and FRED");
  if((Date.now()-Date.parse(chosen.date+"T00:00:00Z"))>10*86400000)throw Error("ON RRP observation stale "+chosen.date);
  const prevD=new Date(Date.parse(chosen.date+"T00:00:00Z")-7*86400000).toISOString().slice(0,10);
  const prior=history.filter(x=>x.date<=prevD).at(-1);
  return {...chosen,weekChangeMn:prior?1000*(chosen.value-prior.value):null};
}
async function h10(){
  const t=clean(await fetchText("https://www.federalreserve.gov/releases/h10/current/"));
  const m=t.match(rx("1\\)\\s+BROAD\\s+JAN06=100\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)","i"));
  const d=t.match(rx("Release Date:\\s*([A-Za-z]+\\s+[0-9]{1,2},\\s*20[0-9]{2})","i"));
  if(!m)throw new Error("Fed H10 parse");
  return {value:num(m[5]),change:num(m[5])-num(m[1]),date:d?new Date(d[1]).toISOString().slice(0,10):null,url:"https://www.federalreserve.gov/releases/h10/current/"};
}
function mk(id,name,value,display,date,source,url,change,label,impact,detail,official=true){
 const maxAge={GDP:140,IP:75,PAYEMS:80,UNRATE:80,CPI:80,COREPCE:110,FEDUPPER:365,WALCL:20,NETLIQ:20,TGA:20,ONRRP:10,US2Y:12,US10Y:12,REAL10Y:12,USDBROAD:12,BREAKEVEN10:12};
 const available=finite(value)&&display!==null;
 const age=date?(Date.now()-Date.parse(date+"T00:00:00Z"))/86400000:null;
 const stale=available && (date==null||(finite(age)&&age>(maxAge[id]||90)));
 return {id,name,value:available?value:null,display:available?display:null,date,source,seriesUrl:url,change,changeLabel:label,goldImpact:available?impact:"MIXED",detail,
 frequency:({GDP:"Quarterly",IP:"Monthly",PAYEMS:"Monthly",UNRATE:"Monthly",CPI:"Monthly",COREPCE:"Monthly",FEDUPPER:"Policy decision",WALCL:"Weekly",NETLIQ:"Mixed weekly/daily",TGA:"Weekly",ONRRP:"Daily",US2Y:"Daily",US10Y:"Daily",REAL10Y:"Daily",USDBROAD:"Daily",BREAKEVEN10:"Daily"})[id]||"Derived",
 stale, status:!available?"UNAVAILABLE":!official?"DERIVED":stale?"STALE":"OFFICIAL",transport:"Direct source"};
}
function imp(v,pos=true,th=0){if(!finite(v))return"MIXED";return Number(v)>th?(pos?"SUPPORTIVE":"PRESSURE"):Number(v)<-th?(pos?"PRESSURE":"SUPPORTIVE"):"MIXED"}
function regime(g,i){return g>=50?(i>=50?"REFLATION":"GOLDILOCKS"):(i>=50?"STAGFLATION":"SLOWDOWN")}
function lab(s){return s>=60?"SUPPORTIVE":s<=40?"PRESSURE":"MIXED"}

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=1800");
  const jobs=await Promise.allSettled([beaGDP(),beaPCE(),fedIP(),bls("CES0000000001"),bls("LNS14000000"),bls("CUUR0000SA0"),treasury("daily_treasury_yield_curve","BC_2YEAR"),treasury("daily_treasury_yield_curve","BC_10YEAR"),treasury("daily_treasury_real_yield_curve","TC_10YEAR"),h41(),nyfed(),h10(),onRrp(),officialCpiHeadline()]);
  const v=i=>jobs[i].status==="fulfilled"?jobs[i].value:null,errors=jobs.map((x,i)=>x.status==="rejected"?"source"+i+": "+String(x.reason?.message||x.reason):null).filter(Boolean);
  const gdp=v(0),pce=v(1),ip=v(2),pay=v(3)||[],ur=v(4)||[],cp=v(5)||[],u2=v(6)||[],u10=v(7)||[],r10=v(8)||[],fed=v(9),ny=v(10)||{},usd=v(11),onrrp=v(12),cpiRelease=v(13);
  const payroll=delta(pay),payPrev=last(pay,1)&&last(pay,2)?last(pay,1).value-last(pay,2).value:null,unrate=last(ur)?.value,un3=delta(ur,3),cpi=finite(cpiRelease?.value)&&cpiRelease.date===last(cp)?.date?cpiRelease.value:yoy(cp),cpi3=last(cp,3)?yoyAt(cp,last(cp,3).date):null;
  const y2=last(u2),y10=last(u10),real=last(r10),breakeven=finite(y10?.value)&&finite(real?.value)?y10.value-real.value:null;
  const net=finite(fed?.assets)&&finite(fed?.tga)&&finite(onrrp?.value)?fed.assets-fed.tga-onrrp.value*1000:null,netCh=finite(fed?.assetsCh)&&finite(fed?.tgaCh)?fed.assetsCh-fed.tgaCh-(finite(onrrp?.weekChangeMn)?onrrp.weekChangeMn:0):null;
  const cards=[
    mk("GDP","Real GDP",gdp?.value,finite(gdp?.value)?fmt(gdp.value,1)+"% SAAR":null,gdp?.date,"BEA",gdp?.url,gdp?.change,"vs prior quarter",imp(gdp?.change,false,.1),"Quarterly real GDP growth."),
    mk("IP","Industrial Production",ip?.value,finite(ip?.value)?fmt(ip.value,2)+"% YoY":null,ip?.date,"Federal Reserve G.17",ip?.url,null,"year-over-year",imp(ip?.value,false,.2),"Official industrial production."),
    mk("PAYEMS","Nonfarm Payroll Change",payroll,finite(payroll)?(payroll>=0?"+":"")+fmt(payroll,0)+"K":null,last(pay)?.date,"BLS","https://www.bls.gov/ces/",finite(payroll)&&finite(payPrev)?payroll-payPrev:null,"vs prior monthly change",finite(payroll)?(payroll<100?"SUPPORTIVE":payroll>200?"PRESSURE":"MIXED"):"MIXED","Total nonfarm payroll monthly change."),
    mk("UNRATE","Unemployment",unrate,finite(unrate)?fmt(unrate,1)+"%":null,last(ur)?.date,"BLS","https://www.bls.gov/cps/",un3,"3-month change",imp(un3,true,.05),"Official unemployment rate."),
    mk("CPI","CPI Inflation",cpi,finite(cpi)?fmt(cpi,1)+"% YoY":null,(cpiRelease?.date===last(cp)?.date?cpiRelease.date:last(cp)?.date),"BLS",(cpiRelease?.date===last(cp)?.date?cpiRelease.url:"https://www.bls.gov/cpi/"),finite(cpi)&&finite(cpi3)?cpi-cpi3:null,"3-month YoY trend","MIXED","Official headline CPI-U unadjusted 12-month change; BLS release cross-checked against CUUR0000SA0."),
    mk("COREPCE","Core PCE",pce?.value,finite(pce?.value)?fmt(pce.value,2)+"% YoY":null,pce?.date,"BEA",pce?.url,pce?.change,"vs prior month YoY","MIXED","Core PCE year-over-year."),
    mk("BREAKEVEN10","10Y Breakeven",breakeven,finite(breakeven)?fmt(breakeven,2)+"%":null,y10?.date,"U.S. Treasury derived","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",null,"nominal 10Y - real 10Y",finite(breakeven)?(breakeven>2.4?"SUPPORTIVE":breakeven<1.8?"PRESSURE":"MIXED"):"MIXED","Derived from official Treasury yields.",false),
    mk("FEDUPPER","Fed Target Upper",ny.high,finite(ny.high)?fmt(ny.high,2)+"%":null,ny.targetDate||null,"New York Fed",ny.targetUrl||ny.url,null,"current target range",finite(ny.high)?(ny.high>=4?"PRESSURE":ny.high<=3?"SUPPORTIVE":"MIXED"):"MIXED","Federal funds target upper bound."),
    mk("WALCL","Fed Balance Sheet",fed?.assets,finite(fed?.assets)?"$"+fmt(fed.assets/1e6,2)+"T":null,fed?.date,"Federal Reserve H.4.1",fed?.url,fed?.assetsCh,"weekly change, USD mn",imp(fed?.assetsCh,true,0),"Federal Reserve total assets."),
    mk("NETLIQ","Net Liquidity Proxy",net,finite(net)?"$"+fmt(net/1e6,2)+"T":null,fed?.date,"Derived Fed/NY Fed",onrrp?.url||fed?.url,netCh,"weekly proxy change, USD mn",imp(netCh,true,0),"Fed assets - TGA - ON RRP; mixed weekly/daily observation frequencies.",false),
    mk("TGA","Treasury General Account",fed?.tga,finite(fed?.tga)?"$"+fmt(fed.tga/1e3,1)+"B":null,fed?.date,"Federal Reserve H.4.1",fed?.url,fed?.tgaCh,"weekly change, USD mn",imp(fed?.tgaCh,false,0),"U.S. Treasury General Account, Fed H.4.1."),
    mk("ONRRP","ON Reverse Repo",onrrp?.value,finite(onrrp?.value)?"$"+fmt(onrrp.value,3)+"B":null,onrrp?.date,onrrp?.source||"New York Fed",onrrp?.url||"https://fred.stlouisfed.org/series/RRPONTSYD",null,"latest accepted amount", "MIXED","Overnight Treasury reverse repo operations, USD billions."),
    mk("US2Y","US 2Y Yield",y2?.value,finite(y2?.value)?fmt(y2.value,2)+"%":null,y2?.date,"U.S. Treasury","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",delta(u2,5),"5-observation change",imp(delta(u2,5),false,.02),"Official 2-year Treasury yield."),
    mk("US10Y","US 10Y Yield",y10?.value,finite(y10?.value)?fmt(y10.value,2)+"%":null,y10?.date,"U.S. Treasury","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",delta(u10,5),"5-observation change",imp(delta(u10,5),false,.02),"Official 10-year Treasury yield."),
    mk("REAL10Y","US 10Y Real Yield",real?.value,finite(real?.value)?fmt(real.value,2)+"%":null,real?.date,"U.S. Treasury","https://home.treasury.gov/resource-center/data-chart-center/interest-rates",delta(r10,5),"5-observation change",imp(delta(r10,5),false,.02),"Official 10-year real yield."),
    mk("USDBROAD","Broad USD Index",usd?.value,finite(usd?.value)?fmt(usd.value,2):null,usd?.date,"Federal Reserve H.10",usd?.url,usd?.change,"5-day change",imp(usd?.change,false,.05),"Official broad U.S. dollar index.")
  ];
  const growth=clamp((score(gdp?.value,-1,5)+score(ip?.value,-3,4)+score(payroll,-100,300)+(finite(unrate)?100-score(unrate,3,6):50))/4);
  const inflation=clamp((score(cpi,1.5,4.5)+score(pce?.value,1.5,4)+score(breakeven,1.5,3))/3);
  const realPressure=score(real?.value,0,3),policy=clamp(.55*score(ny.high,2,6)+.45*realPressure),liquidity=finite(netCh)?score(netCh,-100000,100000):null,dollar=finite(usd?.change)?score(usd.change,-1.5,1.5):50;
  const reg=regime(growth,inflation);
  const drivers=[[inflation,.22],[100-realPressure,.28],[liquidity,.18],[100-growth,.12],[100-dollar,.20]].filter(x=>finite(x[0]));
  const goldScore=clamp(drivers.reduce((s,x)=>s+x[0]*x[1],0)/drivers.reduce((s,x)=>s+x[1],0));
  const goldBias=lab(goldScore);
  const timeline=[];for(let i=11;i>=0;i--){const a=last(cp,i),b=a?cp.find(r=>r.date===(Number(a.date.slice(0,4))-1)+a.date.slice(4)):null,p0=last(pay,i),p1=last(pay,i+1),u=last(ur,i);if(!a||!b||!p0||!p1||!u)continue;const inf=pct(a.value,b.value),pm=p0.value-p1.value,g=clamp((score(pm,-100,300)+(100-score(u.value,3,6)))/2),ii=score(inf,1.5,4.5);timeline.push({date:a.date,month:a.date.slice(0,7),regime:regime(g,ii),growth:Math.round(g),inflation:Math.round(ii),liquidity:50})}
  const quality={available:cards.filter(x=>finite(x.value)).length,fresh:cards.filter(x=>finite(x.value)&&!x.stale).length,total:cards.length,
    official:cards.filter(x=>finite(x.value)&&x.status==="OFFICIAL").length,
    derived:cards.filter(x=>finite(x.value)&&x.status==="DERIVED").length,
    unavailable:cards.filter(x=>x.status==="UNAVAILABLE").map(x=>x.id),
    stale:cards.filter(x=>x.stale).map(x=>x.id),errors,
    notes:(finite(cpiRelease?.value)&&cpiRelease.date===last(cp)?.date&&finite(yoy(cp))&&Math.abs(cpiRelease.value-yoy(cp))>.2)?["CPI published headline differs from computed index YoY for the same period; display uses the official BLS release."]:cpiRelease&&cpiRelease.date!==last(cp)?.date?["Official CPI release and BLS series have different reporting months; CPI uses series result pending matching release."]:[]};
  return res.status(200).json({ok:true,official:true,modelDerived:true,fetchedAt:new Date().toISOString(),provider:"Direct official sources: BLS, BEA, Federal Reserve, U.S. Treasury, New York Fed",cards,scores:{growth:Math.round(growth),inflation:Math.round(inflation),policy:Math.round(policy),liquidity:finite(liquidity)?Math.round(liquidity):null,realYield:Math.round(realPressure),dollar:Math.round(dollar)},regime:{name:reg,note:({REFLATION:"Growth and inflation are both firm.",GOLDILOCKS:"Growth is firm while inflation pressure is softer.",STAGFLATION:"Growth is weak while inflation remains firm.",SLOWDOWN:"Growth and inflation are both softer."})[reg],confidence:Math.round(100*(quality.fresh/quality.total))},gold:{score:Math.round(goldScore),bias:goldBias,note:"DERIVED macro context from "+drivers.length+"/5 available components; not a trade signal, calibrated probability, or guaranteed direction."},playbook:{gold:{label:goldBias,detail:"Derived from inflation, real yields, liquidity, growth and broad USD."},usd:{label:lab(clamp(.55*dollar+.45*policy)),detail:"Official Fed broad USD momentum plus policy pressure."},treasury:{label:inflation>=60||policy>=60?"PRESSURE":"MIXED",detail:"Inflation and policy context; not a yield forecast."},equities:{label:growth>=55&&policy<60?"SUPPORTIVE":growth<45||policy>70?"PRESSURE":"MIXED",detail:"Growth versus restrictive policy."},oil:{label:reg==="REFLATION"?"SUPPORTIVE":reg==="SLOWDOWN"?"PRESSURE":"MIXED",detail:"Cyclical demand context."}},timeline,quality,methodology:{official:"Primary values are fetched directly from BLS, BEA, Federal Reserve Board, U.S. Treasury and New York Fed.",derived:"Regime, scores, 10Y breakeven and Net Liquidity Proxy are GoldFlow calculations from official inputs.",revisions:"BLS monthly history is used for the 12-month timeline; GDP/PCE may be revised by BEA.",netLiquidity:"Net Liquidity Proxy = H.4.1 Wednesday total assets - H.4.1 Wednesday TGA - latest daily NY Fed overnight Treasury RRP, after conversion to USD millions. It mixes observation dates; interpret as an approximation.",fallback:"FRED is not required for the primary path; it can be used later only as a cross-check."}});
}