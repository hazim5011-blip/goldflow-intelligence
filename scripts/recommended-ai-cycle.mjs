import {readFile,writeFile,mkdir} from "node:fs/promises";
import path from "node:path";

const base=String(process.env.GOLDFLOW_BASE_URL||"https://goldflow-intelligence.vercel.app").replace(/\/$/,"");
const symbol=String(process.env.GOLDFLOW_AI_SYMBOL||"XAUUSD247");
const tf=String(process.env.GOLDFLOW_AI_TF||"M15").toUpperCase();
const groups=[
  ["105","103","pvt102"],
  ["pvtchart101","pattern132","snd107"],
  ["owl101","fund104","gf-ai"],
  ["gf-study","gf-news"]
];
const now=new Date();
const batchIndex=now.getUTCHours()%groups.length;
const batch=groups[batchIndex];
const root=process.cwd();
const archiveDir=path.join(root,"recommended-ai");
const latestPath=path.join(archiveDir,"latest.json");
const statePath=path.join(archiveDir,"profile-state.json");
const profileModulePath=path.join(root,"api","_recommendedAIProfiles.js");

const readJson=async(file,fallback)=>{
  try{return JSON.parse(await readFile(file,"utf8"))}
  catch{return structuredClone(fallback)}
};

const latest=await readJson(latestPath,{version:"RECOMMENDED_AI_ARCHIVE_V1",recommendations:{}});
const state=await readJson(statePath,{version:1,updatedAtUTC:null,policy:"AUTO_PROMOTION_ONLY_AFTER_OOS_GATE",profiles:{}});
latest.recommendations=latest.recommendations||{};
state.profiles=state.profiles||{};

const results=[];
for(const indicator of batch){
  const url=new URL(base+"/api/recommended-ai");
  url.searchParams.set("symbol",symbol);
  url.searchParams.set("tf",tf);
  url.searchParams.set("indicator",indicator);
  url.searchParams.set("shadow","1");
  let payload;
  try{
    const ctl=new AbortController();
    const timer=setTimeout(()=>ctl.abort(),150000);
    const res=await fetch(url,{headers:{"user-agent":"GoldFlow-Recommended-AI/1.0"},signal:ctl.signal});
    clearTimeout(timer);
    payload=await res.json();
  }catch(e){
    payload={ok:false,error:String(e?.message||e),indicator,symbol,tf,generatedAtUTC:new Date().toISOString()};
  }

  const profileKey=String(payload.profileKey||indicator+"|"+symbol).toUpperCase();
  const storageKey=profileKey+"|"+tf;
  latest.recommendations[storageKey]=payload;
  results.push(payload);

  if(payload?.ok&&payload?.decision?.autoPromotionApproved&&payload?.decision?.patch&&payload?.profileKey){
    const k=payload.profileKey;
    const current=state.profiles[k]||null;
    state.profiles[k]={
      params:payload.decision.patch,
      previousParams:current?.params||{},
      promotedAtUTC:payload.generatedAtUTC||new Date().toISOString(),
      recommendationId:payload.recommendationId,
      candidateId:payload.decision.candidateId,
      validation:payload.decision.validation||null,
      baseline:payload.baseline?.validation||null,
      policy:"AUTO_PROMOTED_AFTER_OOS_GATE"
    };
  }else if(payload?.ok&&payload?.decision?.action==="ROLLBACK_READY"&&payload?.rollback?.eligible&&payload?.rollback?.previousParams&&payload?.profileKey){
    const k=payload.profileKey;
    const current=state.profiles[k]||null;
    state.profiles[k]={
      params:payload.rollback.previousParams,
      previousParams:current?.params||{},
      promotedAtUTC:payload.generatedAtUTC||new Date().toISOString(),
      recommendationId:payload.recommendationId,
      candidateId:"AUTO_ROLLBACK",
      validation:payload.rollback.postPromotion||null,
      baseline:null,
      rolledBackFrom:current?.recommendationId||null,
      policy:"AUTO_ROLLBACK_AFTER_FORWARD_DEGRADATION"
    };
  }
  await new Promise(resolve=>setTimeout(resolve,1500));
}

latest.updatedAtUTC=new Date().toISOString();
latest.heartbeat="OK";
latest.primarySymbol=symbol;
latest.primaryTF=tf;
latest.lastBatch={batchIndex,indicators:batch,completed:results.filter(x=>x.ok).length,failed:results.filter(x=>!x.ok).length};
latest.schedule={cadence:"hourly",strategy:"rotating indicator batches; every indicator revisited within about 4 hours"};
state.updatedAtUTC=latest.updatedAtUTC;

await mkdir(archiveDir,{recursive:true});
await writeFile(latestPath,JSON.stringify(latest,null,2)+"\n");
await writeFile(statePath,JSON.stringify(state,null,2)+"\n");

const day=latest.updatedAtUTC.slice(0,10);
const historyDir=path.join(archiveDir,"history");
const dayPath=path.join(historyDir,day+".json");
await mkdir(historyDir,{recursive:true});
const daily=await readJson(dayPath,{date:day,cycles:[]});
daily.cycles=Array.isArray(daily.cycles)?daily.cycles:[];
daily.cycles.push({
  atUTC:latest.updatedAtUTC,
  batchIndex,
  indicators:batch,
  results:results.map(x=>({
    ok:x.ok,
    indicator:x.indicator,
    indicatorName:x.indicatorName,
    symbol:x.symbol,
    tf:x.tf,
    state:x.state,
    recommendationId:x.recommendationId,
    baseline:x.baseline?.all||null,
    diagnostics:x.diagnostics||null,
    decision:x.decision||null,
    rollback:x.rollback||null
  }))
});
if(daily.cycles.length>30)daily.cycles=daily.cycles.slice(-30);
await writeFile(dayPath,JSON.stringify(daily,null,2)+"\n");

const profileModule=[
  'const canonMode=mode=>{',
  '  const k=String(mode||"105").toLowerCase();',
  '  if(k==="1.03")return "103";',
  '  if(k==="1.07"||k==="snd")return "snd107";',
  '  if(k==="1.32"||k==="pattern")return "pattern132";',
  '  if(k==="owl"||k==="1.01")return "owl101";',
  '  if(k==="fundstructure"||k==="1.04")return "fund104";',
  '  if(k==="pvt-chart-101")return "pvtchart101";',
  '  if(k==="pvt")return "pvt102";',
  '  return k;',
  '};',
  'const canonSymbol=s=>String(s||"*").trim().toUpperCase()||"*";',
  '',
  'export const RECOMMENDED_AI_PROFILE_STATE=Object.freeze('+JSON.stringify(state,null,2)+');',
  '',
  'export function aiProfileKey(mode,symbol){',
  '  return canonMode(mode)+"|"+canonSymbol(symbol);',
  '}',
  'export function activeAIProfileRecord(mode,symbol){',
  '  const exact=RECOMMENDED_AI_PROFILE_STATE.profiles[aiProfileKey(mode,symbol)];',
  '  const generic=RECOMMENDED_AI_PROFILE_STATE.profiles[canonMode(mode)+"|*"];',
  '  return exact||generic||null;',
  '}',
  'export function activeAIProfile(mode,symbol){',
  '  const row=activeAIProfileRecord(mode,symbol);',
  '  return row&&row.params&&typeof row.params==="object"?row.params:null;',
  '}',
  ''
].join("\n");
await writeFile(profileModulePath,profileModule);

const promoted=results.filter(x=>x?.decision?.autoPromotionApproved).map(x=>x.indicator);
const rolledBack=results.filter(x=>x?.decision?.action==="ROLLBACK_READY"&&x?.rollback?.eligible).map(x=>x.indicator);
process.stdout.write(JSON.stringify({ok:true,atUTC:latest.updatedAtUTC,batch,successful:results.filter(x=>x.ok).length,promoted,rolledBack})+"\n");
