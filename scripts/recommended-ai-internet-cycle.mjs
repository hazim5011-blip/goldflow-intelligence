import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";

const base=String(process.env.GOLDFLOW_BASE_URL||"https://goldflow-intelligence.vercel.app").replace(/\/$/,"");
const root=process.cwd();
const researchDir=path.join(root,"recommended-ai","research");
const latestPath=path.join(researchDir,"latest.json");
const memoryPath=path.join(root,"api","_recommendedAIResearchMemory.js");

async function readJson(file,fallback){try{return JSON.parse(await readFile(file,"utf8"))}catch{return structuredClone(fallback)}}
async function fetchResearch(){
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),170000);
  try{
    const r=await fetch(base+"/api/recommended-ai-research?reasoning=1&ts="+Date.now(),{
      headers:{"user-agent":"GoldFlow-Internet-Research-Cycle/1.0"},signal:ctl.signal
    });
    const text=await r.text();
    let j;try{j=JSON.parse(text)}catch{throw Error("NON_JSON_RESPONSE_"+text.slice(0,120))}
    if(!r.ok||!j?.ok)throw Error(j?.error||"RESEARCH_ENDPOINT_NOT_READY");
    return j;
  }finally{clearTimeout(timer)}
}

const payload=await fetchResearch();
const now=payload.generatedAtUTC||new Date().toISOString();
const archive={
  version:"RECOMMENDED_AI_INTERNET_ARCHIVE_V1",
  updatedAtUTC:now,
  heartbeat:"OK",
  mode:payload.mode,
  research:payload
};
await mkdir(researchDir,{recursive:true});
await writeFile(latestPath,JSON.stringify(archive,null,2)+"\n");

const day=now.slice(0,10),historyPath=path.join(researchDir,day+".json");
const daily=await readJson(historyPath,{date:day,cycles:[]});
daily.cycles=Array.isArray(daily.cycles)?daily.cycles:[];
daily.cycles.push({
  atUTC:now,mode:payload.mode,
  feedStatus:payload.evidence?.feedStatus||[],
  macro:payload.evidence?.macro||[],
  sources:(payload.evidence?.items||[]).slice(0,20),
  reasoning:payload.reasoning||null
});
if(daily.cycles.length>12)daily.cycles=daily.cycles.slice(-12);
await writeFile(historyPath,JSON.stringify(daily,null,2)+"\n");

const safeHypotheses=(payload.reasoning?.hypotheses||[]).map(h=>({
  indicator:String(h?.indicator||"*").toLowerCase(),
  symbol:String(h?.symbol||"*").toUpperCase(),
  title:String(h?.title||"").slice(0,160),
  hypothesis:String(h?.hypothesis||"").slice(0,700),
  rationale:String(h?.rationale||"").slice(0,900),
  confidence:Math.max(0,Math.min(1,Number(h?.confidence)||0)),
  patch:h?.patch&&typeof h.patch==="object"?h.patch:{},
  sources:Array.isArray(h?.sources)?h.sources.filter(x=>/^https?:\/\//i.test(String(x))).slice(0,6):[],
  status:h?.status==="TESTABLE"?"TESTABLE":"EVIDENCE_ONLY"
})).slice(0,8);

const memoryState={
  version:1,updatedAtUTC:now,mode:payload.mode,
  reasoning:{enabled:payload.reasoning?.enabled===true,status:payload.reasoning?.status||"UNKNOWN",model:payload.reasoning?.model||null},
  sources:(payload.evidence?.items||[]).slice(0,24),
  macro:payload.evidence?.macro||[],
  hypotheses:safeHypotheses
};

const memory=[
  'const clean=x=>String(x||"").toLowerCase();',
  '',
  'export const RECOMMENDED_AI_RESEARCH_STATE=Object.freeze('+JSON.stringify(memoryState,null,2)+');',
  '',
  'export function researchHypothesesFor(indicator,symbol){',
  '  const i=clean(indicator),s=String(symbol||"").toUpperCase();',
  '  return (RECOMMENDED_AI_RESEARCH_STATE.hypotheses||[]).filter(h=>{',
  '    const hi=clean(h?.indicator),hs=String(h?.symbol||"*").toUpperCase();',
  '    return (hi===i||hi==="*"||hi==="all")&&(hs==="*"||hs===s);',
  '  });',
  '}',
  ''
].join("\n");
await writeFile(memoryPath,memory);

process.stdout.write(JSON.stringify({
  ok:true,atUTC:now,mode:payload.mode,
  feeds:(payload.evidence?.feedStatus||[]).filter(x=>x.ok).length,
  evidenceItems:(payload.evidence?.items||[]).length,
  reasoningStatus:payload.reasoning?.status||"UNKNOWN",
  hypotheses:safeHypotheses.length
})+"\n");
