const UA="GoldFlow-Internet-Research-Scout/1.0 (+evidence-first; no trading execution)";
const FETCH_TIMEOUT_MS=8000;
const MAX_ITEMS_PER_FEED=10;

const FEEDS=[
  {id:"FED_ALL",kind:"official",category:"FED",url:"https://www.federalreserve.gov/feeds/press_all.xml"},
  {id:"BLS_LATEST",kind:"official",category:"US_MACRO",url:"https://www.bls.gov/feed/bls_latest.rss"},
  {id:"CFTC_GENERAL",kind:"official",category:"POSITIONING_REGULATION",url:"https://www.cftc.gov/RSS.xml"},
  {id:"NEWS_GOLD_MACRO",kind:"discovery",category:"GOLD_MACRO",url:"https://news.google.com/rss/search?q=gold+XAUUSD+Federal+Reserve+Treasury+yields+inflation&hl=en-US&gl=US&ceid=US:en"},
  {id:"NEWS_USD_YIELDS",kind:"discovery",category:"USD_YIELDS",url:"https://news.google.com/rss/search?q=US+dollar+DXY+Treasury+yields+Fed&hl=en-US&gl=US&ceid=US:en"},
  {id:"NEWS_MARKET_STRUCTURE",kind:"discovery",category:"TRADING_RESEARCH",url:"https://news.google.com/rss/search?q=market+structure+liquidity+volatility+trading+research&hl=en-US&gl=US&ceid=US:en"}
];

const FRED=[
  {id:"DGS2",label:"US 2Y Treasury",url:"https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS2"},
  {id:"DGS10",label:"US 10Y Treasury",url:"https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10"},
  {id:"DFII10",label:"US 10Y Real Yield",url:"https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10"},
  {id:"VIXCLS",label:"VIX",url:"https://fred.stlouisfed.org/graph/fredgraph.csv?id=VIXCLS"}
];

const decode=s=>String(s||"")
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
  .replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const strip=s=>decode(s).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,900);
const tag=(xml,name)=>{
  const m=String(xml||"").match(new RegExp("<"+name+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+name+">","i"));
  return m?strip(m[1]):"";
};
function atomLink(block){
  const m=String(block||"").match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return m?decode(m[1]):"";
}
function rssLink(block){
  const v=tag(block,"link");
  if(/^https?:\/\//i.test(v))return v;
  return atomLink(block);
}
function parseFeed(xml,feed){
  const blocks=[...(String(xml||"").matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi))].map(x=>x[1]);
  if(!blocks.length)blocks.push(...[...(String(xml||"").matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi))].map(x=>x[1]));
  return blocks.slice(0,MAX_ITEMS_PER_FEED).map(b=>({
    sourceId:feed.id,sourceKind:feed.kind,category:feed.category,title:tag(b,"title"),
    url:rssLink(b),published:tag(b,"pubDate")||tag(b,"published")||tag(b,"updated"),
    summary:tag(b,"description")||tag(b,"summary")||tag(b,"content")
  })).filter(x=>x.title&&x.url);
}
async function fetchText(url,timeout=FETCH_TIMEOUT_MS){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),timeout);
  try{
    const r=await fetch(url,{headers:{"user-agent":UA,"accept":"application/rss+xml, application/xml, text/xml, text/csv, text/plain;q=0.8, */*;q=0.5"},signal:ctl.signal,redirect:"follow"});
    if(!r.ok)throw Error("HTTP_"+r.status);
    const text=await r.text();
    return text.slice(0,2_000_000);
  }finally{clearTimeout(timer)}
}
const kw=[
  ["fed",5],["fomc",5],["inflation",4],["cpi",4],["pce",4],["employment",3],["payroll",4],["nfp",4],
  ["treasury",4],["yield",4],["real yield",5],["dollar",3],["dxy",4],["gold",5],["xau",5],
  ["liquidity",3],["volatility",3],["atr",3],["market structure",4],["cftc",3],["positioning",3],["oil",2]
];
function relevance(x){
  const s=(x.title+" "+x.summary).toLowerCase();let score=x.sourceKind==="official"?6:0;
  for(const [k,w] of kw)if(s.includes(k))score+=w;
  return score;
}
function dedupe(items){
  const seen=new Set(),out=[];
  for(const x of items.sort((a,b)=>relevance(b)-relevance(a))){
    const k=(x.url||x.title).replace(/[?#].*$/,"").toLowerCase();
    if(seen.has(k))continue;seen.add(k);out.push({...x,relevance:relevance(x)});
  }
  return out;
}
async function fredOne(s){
  try{
    const csv=await fetchText(s.url,12000),lines=csv.trim().split(/\r?\n/).slice(1).filter(Boolean);
    for(let i=lines.length-1;i>=0;i--){
      const parts=lines[i].split(","),value=Number(parts[1]);
      if(parts[0]&&Number.isFinite(value))return {id:s.id,label:s.label,date:parts[0],value,source:"FRED",url:s.url};
    }
    return {id:s.id,label:s.label,error:"NO_NUMERIC_VALUE",source:"FRED",url:s.url};
  }catch(e){return {id:s.id,label:s.label,error:String(e?.message||e),source:"FRED",url:s.url}}
}
export async function collectInternetEvidence(){
  const settled=await Promise.all(FEEDS.map(async feed=>{
    try{
      const xml=await fetchText(feed.url);
      return {feed,ok:true,items:parseFeed(xml,feed)};
    }catch(e){return {feed,ok:false,error:String(e?.message||e),items:[]}}
  }));
  const items=dedupe(settled.flatMap(x=>x.items)).slice(0,40);
  const macro=await Promise.all(FRED.map(fredOne));
  return {
    collectedAtUTC:new Date().toISOString(),
    feedStatus:settled.map(x=>({id:x.feed.id,kind:x.feed.kind,category:x.feed.category,ok:x.ok,count:x.items.length,error:x.error||null,url:x.feed.url})),
    items,macro,
    evidencePolicy:"INTERNET_EVIDENCE_IS_HYPOTHESIS_INPUT_ONLY; VANTAGE_REPLAY_REMAINS_PROMOTION_GATE"
  };
}

function outputText(resp){
  if(typeof resp?.output_text==="string")return resp.output_text;
  for(const o of resp?.output||[])for(const c of o?.content||[])if(c?.type==="output_text"&&typeof c.text==="string")return c.text;
  return "";
}
function jsonFromText(s){
  const t=String(s||"").trim().replace(/^\`\`\`json\s*/i,"").replace(/\s*\`\`\`$/,"");
  try{return JSON.parse(t)}catch{}
  const a=t.indexOf("{"),b=t.lastIndexOf("}");
  if(a>=0&&b>a)try{return JSON.parse(t.slice(a,b+1))}catch{}
  return null;
}
const ALLOWED_PATCH=new Set(["bufferATR","minRiskATR","maxRiskATR","lookback","t1MinR","t1MaxR","t1FallbackR","t2MinR","t2MaxR","t2FallbackR","t3MinR","t3MaxR","t3FallbackR"]);
export function sanitizeInternetHypothesis(h){
  const patch={};
  for(const [k,v] of Object.entries(h?.patch||{}))if(ALLOWED_PATCH.has(k)&&Number.isFinite(Number(v)))patch[k]=Number(v);
  const sources=(Array.isArray(h?.sources)?h.sources:[]).filter(x=>/^https?:\/\//i.test(String(x))).slice(0,6).map(String);
  return {
    indicator:String(h?.indicator||"*").toLowerCase(),symbol:String(h?.symbol||"*").toUpperCase(),
    title:String(h?.title||"Internet research hypothesis").slice(0,160),
    hypothesis:String(h?.hypothesis||"").slice(0,700),rationale:String(h?.rationale||"").slice(0,900),
    confidence:Math.max(0,Math.min(1,Number(h?.confidence)||0)),patch,sources,status:Object.keys(patch).length&&sources.length?"TESTABLE":"EVIDENCE_ONLY"
  };
}
export function openAIRequestConfig(model,prompt){
  const effort=String(process.env.RECOMMENDED_AI_REASONING_EFFORT||"medium").toLowerCase();
  const allowedEffort=new Set(["low","medium","high"]);
  const maxOutput=Math.max(900,Math.min(2600,Number(process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS)||1800));
  const maxToolCalls=Math.max(1,Math.min(3,Number(process.env.RECOMMENDED_AI_MAX_TOOL_CALLS)||2));
  return {
    model,
    input:prompt,
    tools:[{type:"web_search"}],
    tool_choice:"auto",
    max_tool_calls:maxToolCalls,
    max_output_tokens:maxOutput,
    reasoning:{effort:allowedEffort.has(effort)?effort:"medium"},
    store:false
  };
}
async function callOpenAIReasoning({key,model,prompt}){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),55000);
  try{
    const res=await fetch("https://api.openai.com/v1/responses",{
      method:"POST",headers:{"authorization":"Bearer "+key,"content-type":"application/json"},
      body:JSON.stringify(openAIRequestConfig(model,prompt)),signal:ctl.signal
    });
    const body=await res.json();
    if(!res.ok){
      const err=Error("OPENAI_"+res.status+"_"+String(body?.error?.message||"API_ERROR").slice(0,180));
      err.status=res.status;throw err;
    }
    return body;
  }finally{clearTimeout(timer)}
}
export async function reasonWithInternet({evidence,recommendedArchive}={}){
  const key=process.env.OPENAI_API_KEY;
  if(!key)return {enabled:false,status:"OFFLINE_NO_OPENAI_API_KEY",model:null,hypotheses:[],
    note:"Free internet evidence collection is active. Model reasoning + web search activates only after OPENAI_API_KEY is configured."};
  const primaryModel=process.env.RECOMMENDED_AI_MODEL||"gpt-6.1-sol";
  const fallbackModel=process.env.RECOMMENDED_AI_FALLBACK_MODEL||"gpt-6-luna";
  const compact=(Object.values(recommendedArchive?.recommendations||{})).map(x=>({
    indicator:x?.indicator,symbol:x?.symbol,tf:x?.tf,state:x?.state,baseline:x?.baseline?.all,diagnostics:x?.diagnostics
  })).slice(0,20);
  const prompt=[
    "You are GoldFlow Recommended AI Internet Research Brain.",
    "Goal: turn current external market/trading research into TESTABLE hypotheses for GoldFlow Dynamic ATR + Structure management.",
    "Never claim a hypothesis is proven. Never recommend changing protected/native signal logic. Never output trading orders.",
    "Only propose numeric patches using these keys: "+[...ALLOWED_PATCH].join(", ")+".",
    "Each patch must be small/conservative and tied to at least one source URL. Use web search only when it materially improves verification; prefer primary/official sources.",
    "Consider current per-indicator outcomes. A high count win rate with negative P/L is not success.",
    "Reject weak correlations, unverifiable claims, and changes that merely fit the recent sample.",
    "Return JSON only: {summary:string,hypotheses:[{indicator:string,symbol:string,title:string,hypothesis:string,rationale:string,confidence:number,patch:object,sources:string[]}]}",
    "Current Recommended AI diagnostics: "+JSON.stringify(compact),
    "Fresh free evidence: "+JSON.stringify({items:(evidence?.items||[]).slice(0,18),macro:evidence?.macro||[]})
  ].join("\n");
  let model=primaryModel,fallbackUsed=false;
  try{
    let body;
    try{
      body=await callOpenAIReasoning({key,model:primaryModel,prompt});
    }catch(e){
      const accessOrModelError=[400,403,404].includes(Number(e?.status));
      if(!accessOrModelError||!fallbackModel||fallbackModel===primaryModel)throw e;
      model=fallbackModel;fallbackUsed=true;
      body=await callOpenAIReasoning({key,model:fallbackModel,prompt});
    }
    const parsed=jsonFromText(outputText(body));
    if(!parsed)throw Error("OPENAI_NON_JSON_REASONING_OUTPUT");
    const hypotheses=(Array.isArray(parsed?.hypotheses)?parsed.hypotheses:[]).map(sanitizeInternetHypothesis).filter(x=>x.hypothesis).slice(0,8);
    return {
      enabled:true,status:"ONLINE_OPENAI_WEB_REASONING",model,primaryModel,fallbackModel,
      fallbackUsed,reasoningEffort:String(process.env.RECOMMENDED_AI_REASONING_EFFORT||"medium").toLowerCase(),
      maxToolCalls:Math.max(1,Math.min(3,Number(process.env.RECOMMENDED_AI_MAX_TOOL_CALLS)||2)),
      maxOutputTokens:Math.max(900,Math.min(2600,Number(process.env.RECOMMENDED_AI_MAX_OUTPUT_TOKENS)||1800)),
      summary:String(parsed?.summary||"").slice(0,1200),hypotheses,responseId:body?.id||null,usage:body?.usage||null
    };
  }catch(e){
    return {enabled:true,status:"OPENAI_REASONING_ERROR",model,primaryModel,fallbackModel,fallbackUsed,hypotheses:[],error:String(e?.message||e).slice(0,240)};
  }
}

async function loadRecommendedArchive(){
  const base=String(process.env.GOLDFLOW_PUBLIC_BASE_URL||"https://goldflow-intelligence-cf-test.pages.dev").replace(/\/$/,"");
  try{
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),7000);
    const r=await fetch(base+"/recommended-ai/latest.json?ts="+Date.now(),{headers:{"user-agent":UA},signal:ctl.signal,cache:"no-store"});
    clearTimeout(timer);
    if(!r.ok)throw Error("HTTP_"+r.status);
    return await r.json();
  }catch(e){return {version:"UNAVAILABLE",recommendations:{},error:String(e?.message||e)}}
}
export async function runInternetResearch({useReasoning=true}={}){
  const evidence=await collectInternetEvidence();
  const recommendedArchive=await loadRecommendedArchive();
  const reasoning=useReasoning?await reasonWithInternet({evidence,recommendedArchive}):{enabled:false,status:"REASONING_SKIPPED",model:null,hypotheses:[]};
  return {
    ok:true,version:"RECOMMENDED_AI_INTERNET_RESEARCH_V1",generatedAtUTC:new Date().toISOString(),
    mode:reasoning.status==="ONLINE_OPENAI_WEB_REASONING"?"INTERNET_SCOUT_PLUS_REASONING":"FREE_INTERNET_EVIDENCE_SCOUT",
    evidence,reasoning,
    safety:{internetCanDirectlyEditProtectedEngine:false,internetCanDirectlyPromoteProfile:false,
      rule:"Internet hypotheses must be converted to bounded profile candidates and pass Vantage shadow/OOS validation before any promotion."}
  };
}


function dailyReviewPatch(v){
  const out={};
  for(const [k,n] of Object.entries(v||{}))if(ALLOWED_PATCH.has(k)&&Number.isFinite(Number(n)))out[k]=Number(n);
  return out;
}
function dailyReviewSources(v){
  return (Array.isArray(v)?v:[]).filter(x=>/^https?:\/\//i.test(String(x))).slice(0,6).map(String);
}
export async function reasonDailyUnderperformance({items=[],reviewDateMYT=null,context=null}={}){
  const rows=(Array.isArray(items)?items:[]).slice(0,16).map(x=>({
    indicator:String(x.indicator||"").toLowerCase(),indicatorName:String(x.indicatorName||x.indicator||""),
    symbol:String(x.symbol||"").toUpperCase(),tf:String(x.tf||"").toUpperCase(),metrics:x.metrics||{},triggerReasons:Array.isArray(x.triggerReasons)?x.triggerReasons:[]
  })).filter(x=>x.indicator&&x.symbol&&x.tf);
  if(!rows.length)return {enabled:true,status:"NO_UNDERPERFORMERS",model:null,summary:"No indicator met the daily P/L underperformance trigger.",reviews:[]};
  const key=process.env.OPENAI_API_KEY;
  if(!key)return {enabled:false,status:"OFFLINE_NO_OPENAI_API_KEY",model:null,summary:"Daily underperformance metrics were collected, but OpenAI reasoning is unavailable.",reviews:[]};

  const primaryModel=process.env.RECOMMENDED_AI_MODEL||"gpt-6.1-sol";
  const fallbackModel=process.env.RECOMMENDED_AI_FALLBACK_MODEL||"gpt-6-luna";
  const prompt=[
    "You are GoldFlow Daily Indicator Underperformance Reviewer.",
    "Review ONLY the supplied indicators. They were selected because today's P/L-weighted Winrate is below 50% OR today's NET PIP is negative.",
    "The supplied performance numbers are authoritative. Never invent, alter, or replace them.",
    "Diagnose why loss magnitude may be overwhelming wins: entry quality, structure location, stop geometry, ATR buffer, target efficiency, over-chasing, confirmation timing, volatility/regime mismatch, or insufficient sample.",
    "Use web search only if current macro/news/regime context materially helps explain what should be CHECKED NEXT. Do not claim current news caused a historical loss unless contemporaneous evidence exists.",
    "Never recommend editing protected/native signal-engine logic automatically. Any numeric change must be a small bounded Dynamic ATR + Structure management hypothesis only.",
    "Allowed numeric management patch keys: "+[...ALLOWED_PATCH].join(", ")+".",
    "Do not output broker orders, martingale, full-margin, or recovery risk increases.",
    "Return JSON only: {summary:string,reviews:[{indicator:string,severity:'HIGH'|'MEDIUM'|'LOW',diagnosis:string,whyLossDominated:string,suggestions:string[],managementPatch:object,nextChecks:string[],confidence:number,sources:string[]}]}",
    "Review date Asia/Kuala_Lumpur: "+String(reviewDateMYT||"unknown"),
    "Authoritative daily metrics: "+JSON.stringify(rows),
    "Current GoldFlow macro/news context (CHECK-NEXT context only; not proof of past causation): "+JSON.stringify(context||{})
  ].join("\n");

  let model=primaryModel,fallbackUsed=false;
  try{
    let body;
    try{body=await callOpenAIReasoning({key,model:primaryModel,prompt})}
    catch(e){
      if(![400,403,404].includes(Number(e?.status))||!fallbackModel||fallbackModel===primaryModel)throw e;
      model=fallbackModel;fallbackUsed=true;body=await callOpenAIReasoning({key,model:fallbackModel,prompt});
    }
    const parsed=jsonFromText(outputText(body));
    if(!parsed)throw Error("OPENAI_NON_JSON_DAILY_REVIEW_OUTPUT");
    const byId=new Map(rows.map(x=>[x.indicator,x])),seen=new Set(),reviews=[];
    for(const raw of Array.isArray(parsed?.reviews)?parsed.reviews:[]){
      const id=String(raw?.indicator||"").toLowerCase(),src=byId.get(id);
      if(!src||seen.has(id))continue;seen.add(id);
      const severity=["HIGH","MEDIUM","LOW"].includes(String(raw?.severity||"").toUpperCase())?String(raw.severity).toUpperCase():"MEDIUM";
      reviews.push({indicator:id,indicatorName:src.indicatorName,symbol:src.symbol,tf:src.tf,metrics:src.metrics,triggerReasons:src.triggerReasons,
        severity,diagnosis:String(raw?.diagnosis||"").slice(0,1200),whyLossDominated:String(raw?.whyLossDominated||"").slice(0,1200),
        suggestions:(Array.isArray(raw?.suggestions)?raw.suggestions:[]).slice(0,6).map(x=>String(x).slice(0,500)),
        managementPatch:dailyReviewPatch(raw?.managementPatch),
        nextChecks:(Array.isArray(raw?.nextChecks)?raw.nextChecks:[]).slice(0,6).map(x=>String(x).slice(0,500)),
        confidence:Math.max(0,Math.min(1,Number(raw?.confidence)||0)),sources:dailyReviewSources(raw?.sources)});
    }
    return {enabled:true,status:"ONLINE_OPENAI_DAILY_REVIEW",model,primaryModel,fallbackModel,fallbackUsed,
      summary:String(parsed?.summary||"").slice(0,1600),reviews,responseId:body?.id||null,usage:body?.usage||null};
  }catch(e){
    return {enabled:true,status:"OPENAI_DAILY_REVIEW_ERROR",model,primaryModel,fallbackModel,fallbackUsed,
      summary:"Daily metrics were collected but OpenAI review failed safely.",reviews:[],error:String(e?.message||e).slice(0,300)};
  }
}
