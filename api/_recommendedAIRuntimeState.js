const RAW="https://raw.githubusercontent.com/hazim5011-blip/goldflow-intelligence/main/";
const TTL=5*60*1000;
const cache={profiles:{at:0,value:null,pending:null},research:{at:0,value:null,pending:null}};
const ALLOWED=new Set(["bufferATR","minRiskATR","maxRiskATR","lookback","t1MinR","t1MaxR","t1FallbackR","t2MinR","t2MaxR","t2FallbackR","t3MinR","t3MaxR","t3FallbackR"]);

function canonMode(mode){
  const k=String(mode||"105").toLowerCase();
  if(k==="1.03")return "103";
  if(k==="1.07"||k==="snd")return "snd107";
  if(k==="1.32"||k==="pattern")return "pattern132";
  if(k==="owl"||k==="1.01")return "owl101";
  if(k==="fundstructure"||k==="1.04")return "fund104";
  if(k==="pvt-chart-101")return "pvtchart101";
  if(k==="pvt")return "pvt102";
  return k;
}
const canonSymbol=s=>String(s||"*").trim().toUpperCase()||"*";
function safeParams(x){
  const out={};
  for(const [k,v] of Object.entries(x||{})){
    if(ALLOWED.has(k)&&Number.isFinite(Number(v)))out[k]=Number(v);
  }
  return out;
}
async function fetchJson(path,slot){
  const c=cache[slot],now=Date.now();
  if(c.value&&now-c.at<TTL)return c.value;
  if(c.pending)return c.pending;
  c.pending=(async()=>{
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),5000);
    try{
      const r=await fetch(RAW+path+"?ts="+now,{headers:{"user-agent":"GoldFlow-Recommended-AI-Runtime/1.0"},signal:ctl.signal,cache:"no-store"});
      if(!r.ok)throw Error("HTTP_"+r.status);
      const j=await r.json();c.value=j;c.at=Date.now();return j;
    }finally{clearTimeout(timer)}
  })();
  try{return await c.pending}catch{return c.value||null}finally{c.pending=null}
}
export async function runtimeAIProfileRecord(mode,symbol){
  const state=await fetchJson("recommended-ai/profile-state.json","profiles");
  const profiles=state?.profiles||{},m=canonMode(mode),s=canonSymbol(symbol);
  const row=profiles[m+"|"+s]||profiles[m+"|*"]||null;
  if(!row||!row.params)return null;
  const params=safeParams(row.params);
  if(!Object.keys(params).length)return null;
  return {...row,params,source:"GITHUB_RUNTIME_PROFILE_STATE"};
}
export async function runtimeManagementOverride(mode,symbol){
  const row=await runtimeAIProfileRecord(mode,symbol);
  return row?{__replace:true,params:row.params,runtimeRecord:row}:null;
}
export async function runtimeResearchHypotheses(mode,symbol){
  const archive=await fetchJson("recommended-ai/research/latest.json","research");
  const list=archive?.research?.reasoning?.hypotheses||archive?.research?.hypotheses||[];
  const m=canonMode(mode),s=canonSymbol(symbol),out=[];
  for(const h of Array.isArray(list)?list:[]){
    const hi=canonMode(h?.indicator||"*"),hs=canonSymbol(h?.symbol||"*");
    if(!(hi===m||hi==="*"||hi==="all"))continue;
    if(!(hs==="*"||hs===s))continue;
    const params=safeParams(h?.patch);
    out.push({...h,indicator:hi,symbol:hs,patch:params,status:Object.keys(params).length&&Array.isArray(h?.sources)&&h.sources.length?"TESTABLE":"EVIDENCE_ONLY"});
  }
  return out.slice(0,8);
}
export const RECOMMENDED_AI_RUNTIME_TTL_MS=TTL;
