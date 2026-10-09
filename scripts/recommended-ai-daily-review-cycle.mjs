import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";

const base=String(process.env.GOLDFLOW_BASE_URL||"https://goldflow-intelligence-cf-test.pages.dev").replace(/\/$/,"");
const symbol=String(process.env.GOLDFLOW_AI_SYMBOL||"XAUUSD247");
const tf=String(process.env.GOLDFLOW_AI_TF||"M15").toUpperCase();
const indicators=[
  ["105","MTF Research v1.05"],["103","MTF Research v1.03"],["pvt","PVT v1.02"],
  ["pvtchart101","PVT Chart Confluence XAU v1.01"],["pattern132","Pattern Zone Tutor v1.32"],
  ["snd107","SND / SNR / SBR / RBS v1.07"],["owl101","OWL Style Research v1.01"],
  ["fund104","Fund Structure A v1.04"],["gf-ai","GF-AI Live Analyst v1.60"],
  ["gf-news","GF-News Impact Pro"],["gf-study","GF-Market Study Pro"]
];

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function fetchJson(url,opts={}){
  let last=null;
  for(let i=0;i<2;i++){
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),60000);
    try{
      const r=await fetch(url,{...opts,headers:{"accept":"application/json","content-type":"application/json","user-agent":"GoldFlow-Daily-AI-Review/1.0",...(opts.headers||{})},signal:ctl.signal,cache:"no-store"});
      const txt=await r.text();let j=null;try{j=txt?JSON.parse(txt):null}catch{}
      if([502,503,504].includes(r.status)&&i===0){clearTimeout(timer);await sleep(900);continue}
      if(!r.ok||!j)throw Error((j?.error||"HTTP_"+r.status));
      clearTimeout(timer);return j;
    }catch(e){clearTimeout(timer);last=e;if(i===0){await sleep(900);continue}throw e}
  }
  throw last||Error("REQUEST_FAILED");
}
function mytDay(d=new Date()){
  const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d).map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day;
}
function metricRow(group,resolved){
  const all=group?.pipsBySymbol||{},keys=Object.keys(all),row=all[resolved]||all[symbol]||(keys.length===1?all[keys[0]]:null);
  const n=v=>v===null||v===undefined||v===""||!Number.isFinite(Number(v))?null:Number(v);
  return {strictWinRate:n(group?.strictWinRate),strictBasis:group?.strictBasis||null,netPip:n(row?.total),winPip:n(row?.winTotal),lossPip:n(row?.lossTotal),
    signalWinRate:n(group?.signalWinRate),completed:n(group?.completed),positive:n(group?.positive),negative:n(group?.negative),beZero:n(group?.beZero),ambiguous:n(group?.ambiguous),
    totalR:n(group?.totalR),grossPLUSD:n(group?.grossPLUSD)};
}
async function mapLimit(items,limit,worker){
  const out=new Array(items.length);let next=0;
  async function run(){while(true){const i=next++;if(i>=items.length)return;try{out[i]=await worker(items[i],i)}catch(e){out[i]={error:String(e?.message||e),indicator:items[i][0],indicatorName:items[i][1]}}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return out;
}

const reviewDateMYT=mytDay();
const scanned=await mapLimit(indicators,2,async([indicator,indicatorName])=>{
  const u=new URL(base+"/api/performance");
  Object.entries({symbol,tf,indicator,period:"day",direction:"ALL",t:Date.now()}).forEach(([k,v])=>u.searchParams.set(k,String(v)));
  const data=await fetchJson(u);
  if(data.ok===false)throw Error(data.error||"PERFORMANCE_NOT_READY");
  const group=(data.groups||[]).find(x=>x.period===reviewDateMYT)||null;
  if(!group)return {indicator,indicatorName,symbol:data.symbol||symbol,tf,date:reviewDateMYT,metrics:null,trigger:false,triggerReasons:["NO_COMPLETED_DAILY_GROUP"]};
  const metrics=metricRow(group,data.symbol||symbol),reasons=[];
  if(metrics.strictWinRate!==null&&metrics.strictWinRate<50)reasons.push("P/L_WINRATE_LT_50");
  if(metrics.netPip!==null&&metrics.netPip<0)reasons.push("NET_PIP_NEGATIVE");
  return {indicator,indicatorName,symbol:data.symbol||symbol,tf,date:reviewDateMYT,metrics,trigger:reasons.length>0,triggerReasons:reasons};
});
const flagged=scanned.filter(x=>x&&x.trigger&&x.metrics);
let reasoning={enabled:true,status:"NO_UNDERPERFORMERS",model:null,summary:"No indicator met today's P/L underperformance trigger.",reviews:[]};
let endpointError=null;
if(flagged.length){
  try{
    const resp=await fetchJson(base+"/api/recommended-ai-daily-review",{method:"POST",body:JSON.stringify({reviewDateMYT,items:flagged})});
    reasoning=resp.reasoning||reasoning;
  }catch(e){endpointError=String(e?.message||e);reasoning={enabled:true,status:"DAILY_REVIEW_ENDPOINT_ERROR",model:null,summary:"Daily metrics were collected but the OpenAI review endpoint failed safely.",reviews:[],error:endpointError}}
}
const archive={version:"RECOMMENDED_AI_DAILY_ARCHIVE_V1",updatedAtUTC:new Date().toISOString(),reviewDateMYT,symbol,tf,scannedCount:scanned.length,
  flagged,scanned,reasoning,note:"Daily trigger = P/L Winrate < 50% OR NET PIP < 0. Performance numbers come from GoldFlow /api/performance and are not model-generated.",
  safety:{protectedEngineAutoEdit:false,managementChangesRequireShadowOOS:true,modelCannotRewritePerformanceMetrics:true}};

const root=process.cwd(),dir=path.join(root,"recommended-ai","daily");
await mkdir(dir,{recursive:true});
await writeFile(path.join(dir,"latest.json"),JSON.stringify(archive,null,2)+"\n");
await writeFile(path.join(dir,reviewDateMYT+".json"),JSON.stringify(archive,null,2)+"\n");
console.log(JSON.stringify({reviewDateMYT,scanned:scanned.length,flagged:flagged.map(x=>x.indicator),reasoningStatus:reasoning.status,model:reasoning.model||null,endpointError},null,2));
