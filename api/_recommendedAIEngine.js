import {fetchV8Context,rebuildV8ContextWithProfile,aggregate} from "./_v8Data.js";
import {getEffectiveDynamicProfile,DEFAULT_DYNAMIC_PROFILES} from "./_dynamicTradeManagement.js";
import {activeAIProfileRecord,aiProfileKey} from "./_recommendedAIProfiles.js";
import {TF_SECONDS} from "./_v8Core.js";

const POS=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE","TIME_WIN"]);
const NEG=new Set(["SL","TIME_LOSS","GAP_LOSS"]);
const MODES=new Set(["105","103","pvt","pvt102","pvtchart101","pattern132","snd107","owl101","fund104","gf-ai","gf-news","gf-study"]);
const N=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const snap=(v,d=3)=>N(v)==null?null:Number(Number(v).toFixed(d));
const pct=(a,b)=>b>0?100*a/b:null;
const dt=x=>{const t=Date.parse(String(x||""));return Number.isFinite(t)?t:null};

function canonMode(x){
  const k=String(x||"105").toLowerCase();
  if(k==="pvt")return "pvt102";
  if(k==="1.03")return "103";
  if(k==="1.07"||k==="snd")return "snd107";
  if(k==="1.32"||k==="pattern")return "pattern132";
  if(k==="owl"||k==="1.01")return "owl101";
  if(k==="fundstructure"||k==="1.04")return "fund104";
  if(k==="pvt-chart-101")return "pvtchart101";
  return MODES.has(k)?k:"105";
}
function indicatorName(k){
  return ({
    "105":"MTF Research v1.05","103":"MTF Research v1.03","pvt102":"PVT v1.02",
    pvtchart101:"PVT Chart Confluence v1.01",pattern132:"Pattern Zone Tutor v1.32",
    snd107:"SND / SNR / SBR / RBS v1.07",owl101:"OWL Style Research v1.01",
    fund104:"Fund Structure A v1.04", "gf-ai":"GF-AI Live Analyst v1.60",
    "gf-news":"GF-News Impact Pro","gf-study":"GF-Market Study Pro"
  })[k]||k;
}
function pipRow(summary,symbol){
  return summary?.pipsBySymbol?.[symbol]||null;
}
function compactMetric(rows,symbol){
  const s=aggregate(rows),p=pipRow(s,symbol)||{};
  return {
    totalSignals:s.totalSignals,completed:s.completed,strictDenominator:s.strictDenominator,
    strictWR:snap(s.strictWinRate,2),signalWR:snap(s.signalWinRate,2),
    winPip:snap(p.winTotal,2),lossPip:snap(p.lossTotal,2),netPip:snap(p.total,2),
    totalR:snap(s.totalR,3),positive:s.positive,negative:s.negative,beZero:s.beZero,
    ambiguous:s.ambiguous,pending:s.pending,strictBasis:s.strictBasis
  };
}
function sortedRows(rows=[]){
  return rows.slice().sort((a,b)=>(dt(a.signalCandleCloseUTC)||0)-(dt(b.signalCandleCloseUTC)||0));
}
function splitCut(rows=[]){
  const sorted=sortedRows(rows);
  if(!sorted.length)return {cutoff:null,training:[],validation:[]};
  const cut=Math.max(1,Math.min(sorted.length-1,Math.floor(sorted.length*.70)));
  const cutoff=dt(sorted[cut]?.signalCandleCloseUTC);
  if(cutoff==null)return {cutoff:null,training:sorted.slice(0,cut),validation:sorted.slice(cut)};
  return {cutoff,training:sorted.filter(x=>(dt(x.signalCandleCloseUTC)||0)<cutoff),validation:sorted.filter(x=>(dt(x.signalCandleCloseUTC)||0)>=cutoff)};
}
function afterCut(rows=[],cutoff=null){
  if(cutoff==null)return rows;
  return rows.filter(x=>(dt(x.signalCandleCloseUTC)||0)>=cutoff);
}
function avg(xs){const a=xs.filter(x=>N(x)!=null).map(Number);return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function diagnostics(rows=[],tf="M15"){
  const losses=rows.filter(x=>NEG.has(x.outcome)),wins=rows.filter(x=>POS.has(x.outcome)),
    completed=rows.filter(x=>POS.has(x.outcome)||NEG.has(x.outcome)||x.outcome==="BE_ZERO"),
    sec=TF_SECONDS[tf]||900;
  const quick=losses.filter(x=>{
    const a=dt(x.signalCandleCloseUTC),b=dt(x.exitTimeUTC);
    return a!=null&&b!=null&&b-a<=sec*2000;
  });
  const fallback=completed.filter(x=>Array.isArray(x.managedPlan?.targetSources)&&x.managedPlan.targetSources.includes("DYNAMIC_R_FALLBACK"));
  const wide=completed.filter(x=>x.managedPlan?.wideRisk===true);
  const lossRisk=losses.map(x=>N(x.managedPlan?.riskATR)),winRisk=wins.map(x=>N(x.managedPlan?.riskATR));
  return {
    lossCount:losses.length,winCount:wins.length,quickStopRate:snap(pct(quick.length,losses.length),1),
    targetFallbackRate:snap(pct(fallback.length,completed.length),1),wideRiskRate:snap(pct(wide.length,completed.length),1),
    avgLossRiskATR:snap(avg(lossRisk),3),avgWinRiskATR:snap(avg(winRisk),3),
    avgLossScore:snap(avg(losses.map(x=>N(x.score))),1),avgWinScore:snap(avg(wins.map(x=>N(x.score))),1)
  };
}
function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function uniqueCandidates(list){
  const seen=new Set(),out=[];
  for(const x of list){
    const key=JSON.stringify(x.patch);
    if(seen.has(key))continue;seen.add(key);out.push(x);
  }
  return out.slice(0,3);
}
function candidatesFor(profile,diag,baseline){
  const p=profile||{},list=[];
  if((diag.quickStopRate||0)>=45){
    list.push({id:"STRUCTURE_BUFFER_PLUS",why:"SL losses frequently occur within two bars; test slightly more structural breathing room.",
      patch:{bufferATR:snap(clamp(Number(p.bufferATR||.1)+.02,.02,.50),3),minRiskATR:snap(clamp(Number(p.minRiskATR||.5)+.08,.15,2.5),3)}});
  }else{
    list.push({id:"RISK_COMPRESSION",why:"Test smaller structural risk without altering the signal engine.",
      patch:{bufferATR:snap(clamp(Number(p.bufferATR||.1)-.015,.02,.50),3),minRiskATR:snap(clamp(Number(p.minRiskATR||.5)-.06,.15,2.5),3)}});
  }
  if((diag.targetFallbackRate||0)>=45){
    list.push({id:"DEEPER_STRUCTURE_SEARCH",why:"Many targets use R fallback; test a deeper pre-signal structure search.",
      patch:{lookback:Math.round(clamp(Number(p.lookback||40)+12,20,120))}});
  }else{
    list.push({id:"STRUCTURE_FOCUS",why:"Test a modestly wider confirmed-structure window.",
      patch:{lookback:Math.round(clamp(Number(p.lookback||40)+8,20,120))}});
  }
  if(N(baseline?.signalWR)!=null&&N(baseline?.strictWR)!=null&&baseline.signalWR>=55&&baseline.strictWR<50){
    list.push({id:"BANK_EARLIER",why:"Signal count wins exceed P/L quality; test banking profits earlier to reduce winner/loss-size imbalance.",
      patch:{
        t1FallbackR:snap(clamp(Number(p.t1FallbackR||1)-.10,.70,1.5),2),
        t2FallbackR:snap(clamp(Number(p.t2FallbackR||1.8)-.15,1.2,2.8),2),
        t3FallbackR:snap(clamp(Number(p.t3FallbackR||3)-.25,2,5),2),
        t1MaxR:snap(clamp(Number(p.t1MaxR||1.6)-.10,.90,2.5),2)
      }});
  }else{
    list.push({id:"TARGET_BALANCE",why:"Test slightly nearer fallback targets while preserving structure-first logic.",
      patch:{t2FallbackR:snap(clamp(Number(p.t2FallbackR||1.8)-.10,1.2,2.8),2),t3FallbackR:snap(clamp(Number(p.t3FallbackR||3)-.15,2,5),2)}});
  }
  return uniqueCandidates(list);
}
function qualityDelta(base,cand){
  const sw=(N(cand.strictWR)||0)-(N(base.strictWR)||0),net=(N(cand.netPip)||0)-(N(base.netPip)||0);
  return {strictWRDelta:snap(sw,2),netPipDelta:snap(net,2)};
}
function candidatePass(baseVal,candVal,baseAll,candAll){
  if((baseVal.strictDenominator||0)<10||(candVal.strictDenominator||0)<10)return {pass:false,reasons:["VALIDATION_SAMPLE_LT_10"]};
  if(N(baseVal.strictWR)==null||N(candVal.strictWR)==null||N(baseVal.netPip)==null||N(candVal.netPip)==null)return {pass:false,reasons:["VALIDATION_PNL_INCOMPLETE"]};
  const strictGain=candVal.strictWR-baseVal.strictWR,netGain=candVal.netPip-baseVal.netPip,
    minNetGain=Math.max(10,Math.abs(baseVal.netPip)*.10);
  const lossOk=N(baseVal.lossPip)==null||N(candVal.lossPip)==null||Math.abs(candVal.lossPip)<=Math.abs(baseVal.lossPip)*1.05+1e-9;
  const allOk=N(candAll.netPip)!=null&&N(baseAll.netPip)!=null&&candAll.netPip>=baseAll.netPip;
  const pass=candVal.strictWR>=52&&strictGain>=4&&netGain>=minNetGain&&lossOk&&allOk;
  const reasons=[];
  if(candVal.strictWR<52)reasons.push("VALIDATION_STRICT_WR_LT_52");
  if(strictGain<4)reasons.push("STRICT_WR_GAIN_LT_4PP");
  if(netGain<minNetGain)reasons.push("NET_PIP_GAIN_TOO_SMALL");
  if(!lossOk)reasons.push("LOSS_MAGNITUDE_WORSE_GT_5PCT");
  if(!allOk)reasons.push("FULL_WINDOW_NET_NOT_BETTER");
  return {pass,reasons,strictGain:snap(strictGain,2),netGain:snap(netGain,2),minNetGain:snap(minNetGain,2)};
}
function narrative(base,diag,active){
  const out=[];
  if((base.strictDenominator||0)<10)out.push("Sample masih kecil; AI kumpul data dan tidak mengubah profile.");
  if(N(base.strictWR)!=null&&base.strictWR<50)out.push("P/L-weighted Strict WR di bawah breakeven 50%; fokus pada magnitude loss/target efficiency.");
  if(N(base.netPip)!=null&&base.netPip<0)out.push("NET PIP negatif dalam broker window; improvement mesti menaikkan net pip, bukan sekadar count win.");
  if((diag.quickStopRate||0)>=45)out.push("Banyak SL berlaku cepat selepas signal; AI menguji buffer/invalidasi structure.");
  if((diag.targetFallbackRate||0)>=45)out.push("Banyak TP masih menggunakan dynamic-R fallback; AI menguji pencarian structure/liquidity lebih dalam.");
  if(active)out.push("Active Recommended-AI profile sedang digunakan; rollback guard akan dinilai selepas cukup sampel pasca-promosi.");
  if(!out.length)out.push("Profile semasa stabil dalam window tersedia; AI terus mengumpul bukti sebelum perubahan.");
  return out;
}
function recId(mode,symbol,tf,now){return [mode,symbol,tf,String(now).replace(/[-:.TZ]/g,"").slice(0,12)].join("-")}

export async function runRecommendedAI({symbol="XAUUSD247",tf="M15",indicator="105",shadow=true}={}){
  const mode=canonMode(indicator),now=new Date().toISOString();
  const baselineCtx=await fetchV8Context({symbol,tf,indicator:mode});
  const resolved=baselineCtx.symbolResolved||symbol,key=aiProfileKey(mode,resolved),
    active=activeAIProfileRecord(mode,resolved),effective=getEffectiveDynamicProfile(mode,resolved);
  const rows=baselineCtx.rows||[],split=splitCut(rows),baseAll=compactMetric(rows,resolved),
    baseTrain=compactMetric(split.training,resolved),baseVal=compactMetric(split.validation,resolved),
    diag=diagnostics(rows,tf),trainDiag=diagnostics(split.training,tf),
    sampleReady=(baseAll.strictDenominator||0)>=40&&(baseVal.strictDenominator||0)>=10,
    candidateDefs=mode==="gf-news"?[]:candidatesFor(effective,trainDiag,baseTrain),candidateResults=[];

  if(shadow&&candidateDefs.length&&rows.length){
    for(const def of candidateDefs){
      try{
        const profileParams=getEffectiveDynamicProfile(mode,resolved,{params:def.patch});
        const ctx=rebuildV8ContextWithProfile(baselineCtx,{params:def.patch});
        const candRows=ctx.rows||[],candAll=compactMetric(candRows,ctx.symbolResolved),
          candVal=compactMetric(afterCut(candRows,split.cutoff),ctx.symbolResolved),
          gate=candidatePass(baseVal,candVal,baseAll,candAll);
        candidateResults.push({...def,effectiveProfile:profileParams,all:candAll,validation:candVal,delta:qualityDelta(baseVal,candVal),gate});
      }catch(e){
        candidateResults.push({...def,error:String(e?.message||e),gate:{pass:false,reasons:["SHADOW_REPLAY_ERROR"]}});
      }
    }
  }
  const passing=candidateResults.filter(x=>x.gate?.pass).sort((a,b)=>
    (Number(b.delta?.strictWRDelta||0)*10+Number(b.delta?.netPipDelta||0))-
    (Number(a.delta?.strictWRDelta||0)*10+Number(a.delta?.netPipDelta||0)));
  const cooldown=active?.promotedAtUTC&&Date.now()-Date.parse(active.promotedAtUTC)<72*3600*1000;
  const best=passing[0]||null;
  let action="KEEP_CURRENT",autoPromotionApproved=false,reason="NO_CANDIDATE_PASSED_OOS_GATE";
  if(mode==="gf-news"){action="COLLECT_FORWARD_DATA";reason="NEWS_MACRO_HISTORY_IS_FORWARD_ONLY";}
  else if((baseAll.strictDenominator||0)<40){action="COLLECT_DATA";reason="MIN_40_COMPLETED_SIGNALS_REQUIRED";}
  else if((baseVal.strictDenominator||0)<10){action="COLLECT_DATA";reason="MIN_10_VALIDATION_SIGNALS_REQUIRED";}
  else if(best&&cooldown){action="RECOMMEND";reason="CANDIDATE_PASSED_BUT_72H_PROMOTION_COOLDOWN";}
  else if(best){action="AUTO_PROMOTE_READY";autoPromotionApproved=true;reason="CANDIDATE_PASSED_SAMPLE_OOS_NET_AND_LOSS_GATES";}

  let rollback=null;
  if(active?.promotedAtUTC){
    const promotedAt=Date.parse(active.promotedAtUTC);
    const post=rows.filter(x=>(dt(x.signalCandleCloseUTC)||0)>=promotedAt),postMetric=compactMetric(post,baselineCtx.symbolResolved);
    rollback={eligible:false,postPromotion:postMetric,previousParams:active.previousParams||null,reason:"MIN_12_POST_PROMOTION_SIGNALS_REQUIRED"};
    if((postMetric.strictDenominator||0)>=12&&N(postMetric.strictWR)!=null&&N(postMetric.netPip)!=null&&postMetric.strictWR<42&&postMetric.netPip<0&&active.previousParams){
      try{
        const previousCtx=rebuildV8ContextWithProfile(baselineCtx,{__replace:true,params:active.previousParams});
        const previousPost=previousCtx.rows.filter(x=>(dt(x.signalCandleCloseUTC)||0)>=promotedAt);
        const previousMetric=compactMetric(previousPost,previousCtx.symbolResolved);
        const better=N(previousMetric.strictWR)!=null&&N(previousMetric.netPip)!=null&&
          previousMetric.strictWR>=postMetric.strictWR+4&&previousMetric.netPip>postMetric.netPip;
        rollback={eligible:better,postPromotion:postMetric,previousProfileShadow:previousMetric,previousParams:active.previousParams,
          reason:better?"POST_PROMOTION_DEGRADATION_AND_PREVIOUS_PROFILE_SHADOW_BETTER":"CURRENT_DEGRADED_BUT_PREVIOUS_PROFILE_NOT_PROVEN_BETTER"};
        if(better){action="ROLLBACK_READY";autoPromotionApproved=false;reason=rollback.reason}
      }catch(e){
        rollback={eligible:false,postPromotion:postMetric,previousParams:active.previousParams,reason:"ROLLBACK_SHADOW_REPLAY_ERROR",error:String(e?.message||e)};
      }
    }
  }

  return {
    ok:true,version:"RECOMMENDED_AI_V1",recommendationId:recId(mode,baselineCtx.symbolResolved,tf,now),
    generatedAtUTC:now,symbol:baselineCtx.symbolResolved,tf,indicator:mode,indicatorName:indicatorName(mode),profileKey:key,
    historyMode:baselineCtx.historyMode||"HISTORICAL_SIM",dataWindow:baselineCtx.dataWindow,
    state:action,activeProfile:active||null,effectiveProfile:effective,
    baseline:{all:baseAll,training:baseTrain,validation:baseVal},diagnostics:diag,
    recommendation:{summary:narrative(baseAll,diag,active),candidateCount:candidateResults.length,
      note:"Recommended AI may auto-promote only Dynamic ATR + Structure profile parameters. Protected/native signal engines are never auto-edited."},
    candidates:candidateResults,
    decision:{action,reason,sampleReady,autoPromotionApproved,patch:autoPromotionApproved?best.effectiveProfile:null,
      candidatePatch:autoPromotionApproved?best.patch:null,candidateId:autoPromotionApproved?best.id:null,validation:autoPromotionApproved?best.validation:null,
      guardrails:{minCompleted:40,minValidation:10,minStrictWR:52,minStrictWRGainPP:4,minNetPipGain:"max(10 pip, 10%)",maxLossMagnitudeWorseningPct:5,promotionCooldownHours:72}},
    rollback
  };
}

export const RECOMMENDED_AI_INDICATORS=[
  "105","103","pvt102","pvtchart101","pattern132","snd107","owl101","fund104","gf-ai","gf-news","gf-study"
];
