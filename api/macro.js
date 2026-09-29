const CATALOG={
  A191RL1Q225SBEA:{name:"Real GDP",source:"BEA via FRED",frequency:"Quarterly",unit:"% SAAR",kind:"gdp",staleDays:130},
  INDPRO:{name:"Industrial Production",source:"Federal Reserve via FRED",frequency:"Monthly",unit:"Index",kind:"ip",staleDays:65},
  PAYEMS:{name:"Nonfarm Payrolls",source:"BLS via FRED",frequency:"Monthly",unit:"Thousands",kind:"payroll",staleDays:65},
  UNRATE:{name:"Unemployment Rate",source:"BLS via FRED",frequency:"Monthly",unit:"%",kind:"unrate",staleDays:65},
  CPIAUCSL:{name:"CPI",source:"BLS via FRED",frequency:"Monthly",unit:"Index",kind:"cpi",staleDays:65},
  PCEPILFE:{name:"Core PCE Price Index",source:"BEA via FRED",frequency:"Monthly",unit:"Index",kind:"pce",staleDays:75},
  T10YIE:{name:"10Y Breakeven Inflation",source:"Federal Reserve via FRED",frequency:"Daily",unit:"%",kind:"breakeven",staleDays:10},
  DFEDTARU:{name:"Fed Target Upper",source:"Federal Reserve via FRED",frequency:"Daily",unit:"%",kind:"fed",staleDays:10},
  WALCL:{name:"Fed Balance Sheet",source:"Federal Reserve via FRED",frequency:"Weekly",unit:"USD millions",kind:"walcl",staleDays:18},
  WTREGEN:{name:"Treasury General Account",source:"U.S. Treasury via FRED",frequency:"Weekly",unit:"USD millions",kind:"tga",staleDays:18},
  RRPONTSYD:{name:"Overnight Reverse Repo",source:"New York Fed via FRED",frequency:"Daily",unit:"USD billions",kind:"rrp",staleDays:10},
  DFII10:{name:"10Y Real Yield",source:"Federal Reserve via FRED",frequency:"Daily",unit:"%",kind:"realYield",staleDays:10},
  DTWEXBGS:{name:"Broad U.S. Dollar Index",source:"Federal Reserve via FRED",frequency:"Daily",unit:"Index",kind:"usd",staleDays:10}
};
const IDS=Object.keys(CATALOG);
const clamp=(v,a=0,b=100)=>Math.max(a,Math.min(b,v));
const lerpScore=(v,lo,hi)=>clamp(100*(v-lo)/(hi-lo));
const finite=v=>Number.isFinite(Number(v));
const pct=(a,b)=>finite(a)&&finite(b)&&Number(b)!==0?100*(Number(a)-Number(b))/Number(b):null;
const isoDate=d=>new Date(d+"T00:00:00Z");
const daysOld=d=>d?Math.max(0,(Date.now()-isoDate(d).getTime())/86400000):99999;
function csvParse(txt,id){
  const lines=String(txt||"").trim().split(/\r?\n/); const out=[];
  for(let i=1;i<lines.length;i++){
    const p=lines[i].split(","); if(p.length<2) continue;
    const date=p[0].trim(); const raw=p[p.length-1].trim();
    const v=Number(raw); if(date&&Number.isFinite(v)) out.push({date,value:v});
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date));
}
async function fredCsv(id){
  const start=new Date(Date.now()-1000*86400000).toISOString().slice(0,10);
  const url="https://fred.stlouisfed.org/graph/fredgraph.csv?id="+encodeURIComponent(id)+"&cosd="+start;
  const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{"Accept":"text/csv","User-Agent":"GoldFlow-Intelligence/7.5"},cache:"no-store"});
    if(!r.ok) throw new Error("FRED CSV "+id+" HTTP "+r.status);
    return csvParse(await r.text(),id);
  }finally{clearTimeout(t)}
}
async function fredApi(id,key){
  const start=new Date(Date.now()-1000*86400000).toISOString().slice(0,10);
  const url="https://api.stlouisfed.org/fred/series/observations?series_id="+encodeURIComponent(id)+"&api_key="+encodeURIComponent(key)+"&file_type=json&observation_start="+start+"&sort_order=asc";
  const c=new AbortController(),t=setTimeout(()=>c.abort(),10000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{"Accept":"application/json"},cache:"no-store"});
    if(!r.ok) throw new Error("FRED API "+id+" HTTP "+r.status);
    const j=await r.json();
    return (j.observations||[]).map(x=>({date:x.date,value:Number(x.value)})).filter(x=>Number.isFinite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));
  }finally{clearTimeout(t)}
}
async function loadSeries(id){
  const key=String(process.env.FRED_API_KEY||"").trim();
  if(key){
    try{return {rows:await fredApi(id,key),transport:"FRED API"}}
    catch(e){}
  }
  return {rows:await fredCsv(id),transport:"FRED CSV"};
}
function last(rows,n=0){return rows&&rows.length>n?rows[rows.length-1-n]:null}
function valueAt(rows,date){
  if(!rows||!rows.length)return null;
  let lo=0,hi=rows.length-1,ans=-1;
  while(lo<=hi){const m=(lo+hi)>>1;if(rows[m].date<=date){ans=m;lo=m+1}else hi=m-1}
  return ans>=0?rows[ans]:null;
}
function delta(rows,n=1){const a=last(rows),b=last(rows,n);return a&&b?a.value-b.value:null}
function yoy(rows){const a=last(rows),b=last(rows,12);return a&&b?pct(a.value,b.value):null}
function yoyAt(rows,date){
  const a=valueAt(rows,date); if(!a)return null;
  const d=new Date(date+"T00:00:00Z");d.setUTCFullYear(d.getUTCFullYear()-1);
  const b=valueAt(rows,d.toISOString().slice(0,10));
  return b?pct(a.value,b.value):null;
}
function momDeltaAt(rows,date){
  const a=valueAt(rows,date);if(!a)return null;
  const i=rows.findIndex(x=>x.date===a.date);if(i<=0)return null;
  return a.value-rows[i-1].value;
}
function nBackAt(rows,date,n){
  const a=valueAt(rows,date); if(!a)return null;
  const i=rows.findIndex(x=>x.date===a.date); return i>=n?rows[i-n]:null;
}
function makeCard(id,value,display,change,changeLabel,goldImpact,detail,extra={}){
  const rows=extra.rows||[],obs=last(rows),meta=CATALOG[id]||{};
  const staleLimit=extra.staleDays||meta.staleDays||30;\n  const stale=obs?daysOld(obs.date)>staleLimit:true;
  return {
    id,name:extra.name||meta.name||id,value,display,change,changeLabel,goldImpact,detail,
    date:extra.date||obs?.date||null,source:extra.source||meta.source||"FRED",frequency:extra.frequency||meta.frequency||"",
    seriesUrl:extra.seriesUrl||("https://fred.stlouisfed.org/series/"+id),stale,
    status:stale?"EXPECTED LAG / STALE":"OFFICIAL",transport:extra.transport||null
  };
}
function componentScores(S,date=null){
  const at=(id)=>date?valueAt(S[id],date):last(S[id]);
  const gdp=at("A191RL1Q225SBEA")?.value;
  const ip=date?yoyAt(S.INDPRO,date):yoy(S.INDPRO);
  const pay=date?momDeltaAt(S.PAYEMS,date):delta(S.PAYEMS,1);
  const ur=at("UNRATE")?.value;
  let ur3=null;
  if(date){const a=valueAt(S.UNRATE,date),b=nBackAt(S.UNRATE,date,3);ur3=a&&b?a.value-b.value:null}
  else ur3=delta(S.UNRATE,3);
  const cpi=date?yoyAt(S.CPIAUCSL,date):yoy(S.CPIAUCSL);
  const pce=date?yoyAt(S.PCEPILFE,date):yoy(S.PCEPILFE);
  const be=at("T10YIE")?.value;
  const fed=at("DFEDTARU")?.value;
  const ry=at("DFII10")?.value;
  const usd=at("DTWEXBGS")?.value;
  let usd3=null;
  if(date){const a=valueAt(S.DTWEXBGS,date),b=nBackAt(S.DTWEXBGS,date,60);usd3=a&&b?pct(a.value,b.value):null}
  else {const a=last(S.DTWEXBGS),b=last(S.DTWEXBGS,60);usd3=a&&b?pct(a.value,b.value):null}

  const growthParts=[
    finite(gdp)?lerpScore(gdp,-2,5):50,
    finite(ip)?lerpScore(ip,-5,5):50,
    finite(pay)?lerpScore(pay,-100,300):50,
    finite(ur)?clamp(100-lerpScore(ur,3,6)+(finite(ur3)?-ur3*12:0)):50
  ];
  const growth=growthParts.reduce((a,b)=>a+b,0)/growthParts.length;
  const inflationParts=[
    finite(cpi)?lerpScore(cpi,1.5,4.5):50,
    finite(pce)?lerpScore(pce,1.5,4.0):50,
    finite(be)?lerpScore(be,1.5,3.0):50
  ];
  const inflation=inflationParts.reduce((a,b)=>a+b,0)/inflationParts.length;
  const realYieldScore=finite(ry)?lerpScore(ry,0,2.5):50;
  const policy=clamp(.45*(finite(fed)?lerpScore(fed,2,6):50)+.55*realYieldScore);
  const dollar=finite(usd3)?lerpScore(usd3,-5,5):50;
  return {growth,inflation,policy,realYieldScore,dollar,gdp,ip,pay,ur,cpi,pce,be,fed,ry,usd,usd3};
}
function netLiquidityAt(S,date=null){
  const wal=(date?valueAt(S.WALCL,date):last(S.WALCL))?.value;
  const tga=(date?valueAt(S.WTREGEN,date):last(S.WTREGEN))?.value;
  const rrp=(date?valueAt(S.RRPONTSYD,date):last(S.RRPONTSYD))?.value;
  if(!finite(wal)||!finite(tga)||!finite(rrp))return null;
  return wal-tga-rrp*1000;
}
function liquidityScore(S,date=null){
  const now=netLiquidityAt(S,date); if(!finite(now))return 50;
  let priorDate;
  if(date){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()-35);priorDate=d.toISOString().slice(0,10)}
  else {const d=new Date();d.setUTCDate(d.getUTCDate()-35);priorDate=d.toISOString().slice(0,10)}
  const prev=netLiquidityAt(S,priorDate);const ch=pct(now,prev);
  return finite(ch)?lerpScore(ch,-3,3):50;
}
function regimeOf(growth,inflation){
  if(growth>=50&&inflation>=50)return "REFLATION";
  if(growth>=50&&inflation<50)return "GOLDILOCKS";
  if(growth<50&&inflation>=50)return "STAGFLATION";
  return "SLOWDOWN";
}
function regimeNote(r){
  return ({
    REFLATION:"Growth and inflation are both firm.",
    GOLDILOCKS:"Growth is firm while inflation pressure is softer.",
    STAGFLATION:"Growth is weak while inflation pressure remains high.",
    SLOWDOWN:"Growth and inflation are both softening."
  })[r]||"Derived macro context.";
}
function monthEnds(n=12){
  const out=[],d=new Date();d.setUTCDate(1);
  for(let i=n-1;i>=0;i--){const x=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-i+1,0));out.push(x.toISOString().slice(0,10))}
  return out;
}
function impactLabel(score){return score>=60?"SUPPORTIVE":score<=40?"PRESSURE":"MIXED"}
function fmtNum(v,d=2){return finite(v)?Number(v).toFixed(d):null}

export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  res.setHeader("Cache-Control","s-maxage=900, stale-while-revalidate=86400");
  const settled=await Promise.allSettled(IDS.map(async id=>[id,await loadSeries(id)]));
  const S={},transport={},errors=[];
  for(const x of settled){
    if(x.status==="fulfilled"){const [id,r]=x.value;S[id]=r.rows;transport[id]=r.transport}
    else errors.push(String(x.reason?.message||x.reason));
  }
  for(const id of IDS)if(!S[id])S[id]=[];

  const gdp=last(S.A191RL1Q225SBEA),gdpPrev=last(S.A191RL1Q225SBEA,1);
  const ipYoy=yoy(S.INDPRO),ip3=yoyAt(S.INDPRO,last(S.INDPRO,3)?.date||"");
  const pay=delta(S.PAYEMS,1),payPrev=last(S.PAYEMS,1)&&last(S.PAYEMS,2)?last(S.PAYEMS,1).value-last(S.PAYEMS,2).value:null;
  const ur=last(S.UNRATE),ur3=delta(S.UNRATE,3);
  const cpi=yoy(S.CPIAUCSL),cpi3=yoyAt(S.CPIAUCSL,last(S.CPIAUCSL,3)?.date||"");
  const pce=yoy(S.PCEPILFE),pce3=yoyAt(S.PCEPILFE,last(S.PCEPILFE,3)?.date||"");
  const be=last(S.T10YIE),be20=delta(S.T10YIE,20);
  const fed=last(S.DFEDTARU),fed120=delta(S.DFEDTARU,120);
  const wal=last(S.WALCL),wal4=last(S.WALCL,4),walCh=wal&&wal4?pct(wal.value,wal4.value):null;
  const ry=last(S.DFII10),ry20=delta(S.DFII10,20);
  const usd=last(S.DTWEXBGS),usd60=last(S.DTWEXBGS,60),usdCh=usd&&usd60?pct(usd.value,usd60.value):null;
  const net=netLiquidityAt(S),d35=new Date();d35.setUTCDate(d35.getUTCDate()-35),netPrev=netLiquidityAt(S,d35.toISOString().slice(0,10)),netCh=pct(net,netPrev);

  const cards=[
    makeCard("A191RL1Q225SBEA",gdp?.value,finite(gdp?.value)?fmtNum(gdp.value,1)+"%":null,gdp&&gdpPrev?gdp.value-gdpPrev.value:null,"vs prior quarter",gdp&&gdpPrev?(gdp.value<gdpPrev.value?"SUPPORTIVE":"PRESSURE"):"MIXED","Quarterly real GDP annualized growth.",{rows:S.A191RL1Q225SBEA,transport:transport.A191RL1Q225SBEA}),
    makeCard("INDPRO",ipYoy,finite(ipYoy)?fmtNum(ipYoy,2)+"% YoY":null,finite(ip3)?ipYoy-ip3:null,"3-month trend",finite(ipYoy)&&finite(ip3)?(ipYoy<ip3?"SUPPORTIVE":"PRESSURE"):"MIXED","Industrial production year-over-year.",{rows:S.INDPRO,transport:transport.INDPRO}),
    makeCard("PAYEMS",pay,finite(pay)?(pay>=0?"+":"")+fmtNum(pay,0)+"K":null,finite(pay)&&finite(payPrev)?pay-payPrev:null,"vs prior monthly change",finite(pay)?(pay<100?"SUPPORTIVE":pay>200?"PRESSURE":"MIXED"):"MIXED","Official nonfarm payroll monthly change derived from PAYEMS.",{rows:S.PAYEMS,transport:transport.PAYEMS}),
    makeCard("UNRATE",ur?.value,finite(ur?.value)?fmtNum(ur.value,1)+"%":null,ur3,"3-month change",finite(ur3)?(ur3>0?"SUPPORTIVE":ur3<0?"PRESSURE":"MIXED"):"MIXED","U.S. unemployment rate.",{rows:S.UNRATE,transport:transport.UNRATE}),
    makeCard("CPIAUCSL",cpi,finite(cpi)?fmtNum(cpi,2)+"% YoY":null,finite(cpi)&&finite(cpi3)?cpi-cpi3:null,"3-month trend","MIXED","Headline CPI year-over-year. Inflation can support gold, but yields and policy can offset it.",{rows:S.CPIAUCSL,transport:transport.CPIAUCSL}),
    makeCard("PCEPILFE",pce,finite(pce)?fmtNum(pce,2)+"% YoY":null,finite(pce)&&finite(pce3)?pce-pce3:null,"3-month trend","MIXED","Core PCE year-over-year; a key Fed inflation gauge.",{rows:S.PCEPILFE,transport:transport.PCEPILFE}),
    makeCard("T10YIE",be?.value,finite(be?.value)?fmtNum(be.value,2)+"%":null,be20,"20-observation change",finite(be20)?(be20>0?"SUPPORTIVE":be20<0?"PRESSURE":"MIXED"):"MIXED","Market-implied 10-year inflation compensation.",{rows:S.T10YIE,transport:transport.T10YIE}),
    makeCard("DFEDTARU",fed?.value,finite(fed?.value)?fmtNum(fed.value,2)+"%":null,fed120,"~6-month change",finite(fed120)?(fed120>0?"PRESSURE":fed120<0?"SUPPORTIVE":"MIXED"):"MIXED","Upper bound of the Federal Funds target range.",{rows:S.DFEDTARU,transport:transport.DFEDTARU}),
    makeCard("WALCL",wal?.value,finite(wal?.value)?"$"+fmtNum(wal.value/1e6,2)+"T":null,walCh,"4-week % change",finite(walCh)?(walCh>0?"SUPPORTIVE":walCh<0?"PRESSURE":"MIXED"):"MIXED","Federal Reserve total assets; not the same as net liquidity.",{rows:S.WALCL,transport:transport.WALCL}),
    makeCard("NETLIQ",net,finite(net)?"$"+fmtNum(net/1e6,2)+"T":null,netCh,"~5-week % change",finite(netCh)?(netCh>0?"SUPPORTIVE":netCh<0?"PRESSURE":"MIXED"):"MIXED","Derived net-liquidity proxy = WALCL − TGA − ON RRP.",{rows:S.WALCL,name:"Net Liquidity Proxy",date:wal?.date,source:"Derived from Fed/Treasury official series",frequency:"Mixed",seriesUrl:"https://fred.stlouisfed.org/series/WALCL",transport:"Derived"}),
    makeCard("DFII10",ry?.value,finite(ry?.value)?fmtNum(ry.value,2)+"%":null,ry20,"20-observation change",finite(ry20)?(ry20>0?"PRESSURE":ry20<0?"SUPPORTIVE":"MIXED"):"MIXED","10-year inflation-indexed Treasury real yield; typically an important gold driver.",{rows:S.DFII10,transport:transport.DFII10}),
    makeCard("DTWEXBGS",usd?.value,finite(usd?.value)?fmtNum(usd.value,2):null,usdCh,"~3-month % change",finite(usdCh)?(usdCh>0?"PRESSURE":usdCh<0?"SUPPORTIVE":"MIXED"):"MIXED","Federal Reserve broad U.S. dollar index.",{rows:S.DTWEXBGS,transport:transport.DTWEXBGS})
  ];

  const scores=componentScores(S),liq=liquidityScore(S);
  const regime=regimeOf(scores.growth,scores.inflation);
  const goldSupport=clamp(.25*scores.inflation+.25*(100-scores.realYieldScore)+.20*liq+.15*(100-scores.growth)+.15*(100-scores.dollar));
  const goldBias=impactLabel(goldSupport);
  const confidence=clamp(55+Math.abs(scores.growth-50)*.35+Math.abs(scores.inflation-50)*.35-(errors.length/IDS.length)*50,35,95);

  const timeline=monthEnds(12).map(date=>{
    const s=componentScores(S,date),l=liquidityScore(S,date),r=regimeOf(s.growth,s.inflation);
    return {date,month:date.slice(0,7),regime:r,growth:Math.round(s.growth),inflation:Math.round(s.inflation),liquidity:Math.round(l)};
  });

  const playbook={
    gold:{label:goldBias,detail:goldBias==="SUPPORTIVE"?"Macro mix is relatively supportive for gold; real yields/USD can still dominate intraday.":goldBias==="PRESSURE"?"Macro mix is relatively restrictive for gold; watch for yield/USD reversals.":"Macro drivers are mixed; technical confirmation matters more."},
    usd:{label:scores.dollar>=60||scores.policy>=60?"SUPPORTIVE":scores.dollar<=40&&scores.policy<=45?"PRESSURE":"MIXED",detail:"Derived from broad USD momentum and policy/real-yield pressure."},
    treasury:{label:scores.inflation>=60||scores.policy>=60?"PRESSURE":"MIXED",detail:"Higher inflation/policy pressure can keep Treasury yields elevated; this is a context label, not a yield forecast."},
    equities:{label:scores.growth>=55&&scores.policy<60?"SUPPORTIVE":scores.growth<45||scores.policy>70?"PRESSURE":"MIXED",detail:"Growth helps risk assets while restrictive policy can offset it."},
    oil:{label:regime==="REFLATION"?"SUPPORTIVE":regime==="SLOWDOWN"?"PRESSURE":"MIXED",detail:"Cyclical demand is usually stronger in reflation and weaker in slowdown."}
  };

  return res.status(200).json({
    ok:true,official:true,modelDerived:true,fetchedAt:new Date().toISOString(),
    provider:"FRED / originating official U.S. agencies",
    cards,
    scores:{growth:Math.round(scores.growth),inflation:Math.round(scores.inflation),policy:Math.round(scores.policy),liquidity:Math.round(liq),realYield:Math.round(scores.realYieldScore),dollar:Math.round(scores.dollar)},
    regime:{name:regime,note:regimeNote(regime),confidence:Math.round(confidence)},
    gold:{score:Math.round(goldSupport),bias:goldBias,note:"DERIVED macro context only — not a trade signal or guaranteed direction."},
    timeline,playbook,
    quality:{available:IDS.length-errors.length,total:IDS.length,errors},
    methodology:{
      official:"Values come from FRED series sourced from BEA, BLS, the Federal Reserve, U.S. Treasury and New York Fed.",
      derived:"Regime, pulse scores, playbook labels and Gold Macro Bias are GoldFlow formulas, not official government statistics.",
      revisions:"Historical timeline uses the latest revised official history. It is not an ALFRED point-in-time backtest.",
      netLiquidity:"Net Liquidity Proxy = WALCL − WTREGEN − (RRPONTSYD × 1000), all normalized to USD millions."
    }
  });
}
