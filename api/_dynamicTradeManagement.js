import {activeAIProfile,activeAIProfileRecord,aiProfileKey} from "./_recommendedAIProfiles.js";
const N=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const snap=(v,d=10)=>N(v)==null?null:Number(Number(v).toFixed(d));
const DIR=x=>N(x?.direction)>0?1:N(x?.direction)<0?-1:0;

export const UNIVERSAL_MANAGEMENT=Object.freeze({
  beTriggerR:.50,
  beLockR:.05,
  trailTriggerR:.75,
  trailDistanceR:.35,
  policy:"GOLDFLOW_DYNAMIC_ATR_STRUCTURE_CLOSED_OHLC_CONSERVATIVE"
});

const TARGET_DEFAULTS=Object.freeze({t1MinR:.90,t1MaxR:1.60,t1FallbackR:1.00,t2MinR:1.40,t2MaxR:2.60,t2FallbackR:1.80,t3MinR:2.20,t3MaxR:6.00,t3FallbackR:3.00});
export const DEFAULT_DYNAMIC_PROFILES=Object.freeze({
  "105":{...TARGET_DEFAULTS,name:"MTF_RESEARCH",bufferATR:.08,minRiskATR:.25,maxRiskATR:3.0,lookback:40,preferNativeStop:true,preferNativeTargets:false},
  "103":{...TARGET_DEFAULTS,name:"MTF_RESEARCH_103",bufferATR:.08,minRiskATR:.25,maxRiskATR:3.0,lookback:40,preferNativeStop:true,preferNativeTargets:false},
  "owl101":{...TARGET_DEFAULTS,name:"OWL_RESEARCH",bufferATR:.08,minRiskATR:.25,maxRiskATR:3.0,lookback:40,preferNativeStop:true,preferNativeTargets:false},
  "pvt":{...TARGET_DEFAULTS,name:"PVT_102",bufferATR:.12,minRiskATR:.75,maxRiskATR:3.0,lookback:34,preferNativeStop:false,preferNativeTargets:false},
  "pvt102":{...TARGET_DEFAULTS,name:"PVT_102",bufferATR:.12,minRiskATR:.75,maxRiskATR:3.0,lookback:34,preferNativeStop:false,preferNativeTargets:false},
  "pvtchart101":{...TARGET_DEFAULTS,name:"PVT_CHART_101",bufferATR:.10,minRiskATR:1.35,maxRiskATR:3.5,lookback:36,preferNativeStop:true,preferNativeTargets:false},
  "pattern132":{...TARGET_DEFAULTS,name:"PATTERN_132",bufferATR:.08,minRiskATR:.50,maxRiskATR:3.0,lookback:48,preferNativeStop:true,preferNativeTargets:false},
  "snd107":{...TARGET_DEFAULTS,name:"SND_107",bufferATR:.10,minRiskATR:.40,maxRiskATR:3.0,lookback:40,preferNativeStop:true,preferNativeTargets:false},
  "fund104":{...TARGET_DEFAULTS,name:"FUND_104",bufferATR:.18,minRiskATR:.50,maxRiskATR:3.0,lookback:40,preferNativeStop:true,preferNativeTargets:false},
  "gf-ai":{...TARGET_DEFAULTS,name:"GF_AI",bufferATR:.10,minRiskATR:.24,maxRiskATR:2.35,lookback:56,preferNativeStop:true,preferNativeTargets:true},
  "gf-news":{...TARGET_DEFAULTS,name:"GF_NEWS",bufferATR:.10,minRiskATR:.24,maxRiskATR:2.35,lookback:56,preferNativeStop:true,preferNativeTargets:true},
  "gf-study":{...TARGET_DEFAULTS,name:"GF_STUDY",bufferATR:.10,minRiskATR:.24,maxRiskATR:2.35,lookback:56,preferNativeStop:true,preferNativeTargets:true}
});

function canonicalMode(mode){
  const k=String(mode||"105").toLowerCase();
  if(k==="1.03")return "103";
  if(k==="1.07"||k==="snd")return "snd107";
  if(k==="1.32"||k==="pattern")return "pattern132";
  if(k==="owl"||k==="1.01")return "owl101";
  if(k==="fundstructure"||k==="1.04")return "fund104";
  if(k==="pvt-chart-101")return "pvtchart101";
  if(k==="pvt")return "pvt102";
  return DEFAULT_DYNAMIC_PROFILES[k]?k:"105";
}
function numClamp(v,min,max,fallback){
  const n=N(v);return n==null?fallback:Math.max(min,Math.min(max,n));
}
function safePatch(x={}){
  if(!x||typeof x!=="object")return {};
  const out={};
  if("bufferATR" in x)out.bufferATR=numClamp(x.bufferATR,.02,.50,.10);
  if("minRiskATR" in x)out.minRiskATR=numClamp(x.minRiskATR,.15,2.50,.50);
  if("maxRiskATR" in x)out.maxRiskATR=numClamp(x.maxRiskATR,.50,6.00,3.00);
  if("lookback" in x)out.lookback=Math.round(numClamp(x.lookback,20,120,40));
  if("t1MinR" in x)out.t1MinR=numClamp(x.t1MinR,.60,1.50,.90);
  if("t1MaxR" in x)out.t1MaxR=numClamp(x.t1MaxR,.90,2.50,1.60);
  if("t1FallbackR" in x)out.t1FallbackR=numClamp(x.t1FallbackR,.70,1.50,1.00);
  if("t2MinR" in x)out.t2MinR=numClamp(x.t2MinR,1.00,2.50,1.40);
  if("t2MaxR" in x)out.t2MaxR=numClamp(x.t2MaxR,1.50,4.00,2.60);
  if("t2FallbackR" in x)out.t2FallbackR=numClamp(x.t2FallbackR,1.20,2.80,1.80);
  if("t3MinR" in x)out.t3MinR=numClamp(x.t3MinR,1.60,4.00,2.20);
  if("t3MaxR" in x)out.t3MaxR=numClamp(x.t3MaxR,2.50,8.00,6.00);
  if("t3FallbackR" in x)out.t3FallbackR=numClamp(x.t3FallbackR,2.00,5.00,3.00);
  return out;
}
export function getEffectiveDynamicProfile(mode="105",symbol="*",profileOverride=null){
  const k=canonicalMode(mode),base=DEFAULT_DYNAMIC_PROFILES[k]||DEFAULT_DYNAMIC_PROFILES["105"];
  const active=activeAIProfile(k,symbol)||{};
  const replace=profileOverride&&profileOverride.__replace===true;
  const patch=safePatch(profileOverride?.params||profileOverride||{});
  const activeSafe=safePatch(active);
  const p={...base,...(replace?{}:activeSafe),...patch};
  if(p.maxRiskATR<p.minRiskATR+.25)p.maxRiskATR=p.minRiskATR+.25;
  if(p.t1MaxR<p.t1MinR+.15)p.t1MaxR=p.t1MinR+.15;
  if(p.t2MaxR<p.t2MinR+.20)p.t2MaxR=p.t2MinR+.20;
  if(p.t3MaxR<p.t3MinR+.30)p.t3MaxR=p.t3MinR+.30;
  return {...p,mode:k,profileKey:aiProfileKey(k,symbol),profileSource:replace?"CANDIDATE_REPLACE":Object.keys(activeSafe).length?"RECOMMENDED_AI_ACTIVE":"DEFAULT_DYNAMIC_PROFILE"};
}

function normBars(xs=[]){
  return (Array.isArray(xs)?xs:[]).map(x=>({
    t:N(x?.t??x?.time),o:N(x?.o??x?.open),h:N(x?.h??x?.high),l:N(x?.l??x?.low),c:N(x?.c??x?.close)
  })).filter(x=>x.t!=null&&x.o!=null&&x.h!=null&&x.l!=null&&x.c!=null&&x.h>=x.l).sort((a,b)=>a.t-b.t);
}
function tr(a,i){
  if(i<0||i>=a.length)return 0;
  const b=a[i],pc=i>0?a[i-1].c:b.c;
  return Math.max(b.h-b.l,Math.abs(b.h-pc),Math.abs(b.l-pc));
}
function atrAt(a,i,p=14){
  if(i<0)return 0;let s=0,n=0;
  for(let j=Math.max(0,i-p+1);j<=i;j++){s+=tr(a,j);n++}
  return n?s/n:0;
}
function pivotLow(a,i,w=2){
  if(i-w<0||i+w>=a.length)return false;
  for(let k=1;k<=w;k++)if(a[i].l>=a[i-k].l||a[i].l>a[i+k].l)return false;
  return true;
}
function pivotHigh(a,i,w=2){
  if(i-w<0||i+w>=a.length)return false;
  for(let k=1;k<=w;k++)if(a[i].h<=a[i-k].h||a[i].h<a[i+k].h)return false;
  return true;
}
function signalIndex(a,signal){
  const t=N(signal?.time??signal?.signalTime??signal?.signalCandleTime);
  if(t==null)return a.length-2;
  let idx=-1;
  for(let i=0;i<a.length;i++){if(a[i].t<=t)idx=i;else break}
  return idx;
}
function lastConfirmedSwing(a,i,d,lookback){
  const start=Math.max(2,i-Math.max(8,lookback||40));
  for(let j=i-2;j>=start;j--){
    if(d>0&&pivotLow(a,j,2))return {price:a[j].l,time:a[j].t,kind:"PIVOT_LOW"};
    if(d<0&&pivotHigh(a,j,2))return {price:a[j].h,time:a[j].t,kind:"PIVOT_HIGH"};
  }
  return null;
}
function validZone(signal,d,entry){
  const z=signal?.zone;
  const low=N(z?.low),high=N(z?.high);
  if(low==null||high==null||high<low)return null;
  const anchor=d>0?low:high;
  if(d*(entry-anchor)<=0)return null;
  return {price:anchor,kind:"SIGNAL_ZONE_EDGE",low,high,source:z?.source||z?.tf||null};
}
function nativeStop(signal,d,entry){
  const sl=N(signal?.invalidation??signal?.originalSL??signal?.sl);
  if(sl==null||d*(entry-sl)<=0)return null;
  return {price:sl,kind:"ENGINE_DYNAMIC_STRUCTURE_SL"};
}
function candleExtreme(a,i,d,entry){
  const b=a[i];if(!b)return null;
  const px=d>0?b.l:b.h;
  return d*(entry-px)>0?{price:px,kind:"SIGNAL_CANDLE_EXTREME"}:null;
}
function stopPlan({signal,a,i,d,entry,atr,p}){
  const ns=nativeStop(signal,d,entry);
  let stop=null,source=null;
  if(p.preferNativeStop&&ns){stop=ns.price;source=ns.kind}
  if(stop==null){
    const z=validZone(signal,d,entry),sw=lastConfirmedSwing(a,i,d,p.lookback),cx=candleExtreme(a,i,d,entry);
    const anchor=z||sw||cx;
    if(!anchor)return null;
    stop=anchor.price-d*p.bufferATR*atr;
    source=anchor.kind+"_ATR_"+p.bufferATR;
  }
  let risk=d*(entry-stop);
  const minRisk=Math.max(atr*p.minRiskATR,1e-12);
  if(risk<minRisk){stop=entry-d*minRisk;risk=minRisk;source+="_MIN_"+p.minRiskATR+"ATR"}
  return {stop:snap(stop),risk:snap(risk),source,riskATR:atr>0?snap(risk/atr,3):null,wide:atr>0&&risk>p.maxRiskATR*atr};
}
function collectTargets(a,i,d,entry,risk,p,signal){
  const out=[],seen=new Set(),start=Math.max(2,i-Math.max(20,p.lookback*2));
  const add=(price,source)=>{
    const x=N(price);if(x==null||d*(x-entry)<=0)return;
    const r=d*(x-entry)/risk;
    if(r<.75)return;
    const key=x.toFixed(10);if(seen.has(key))return;seen.add(key);out.push({price:x,r,source});
  };
  for(let j=start;j<=i-2;j++){
    if(d>0&&pivotHigh(a,j,2))add(a[j].h,"CONFIRMED_PIVOT_HIGH");
    if(d<0&&pivotLow(a,j,2))add(a[j].l,"CONFIRMED_PIVOT_LOW");
  }
  if(p.preferNativeTargets){
    add(signal?.tp1,"ENGINE_STRUCTURE_TARGET_1");
    add(signal?.tp2,"ENGINE_STRUCTURE_TARGET_2");
    add(signal?.tp3,"ENGINE_STRUCTURE_TARGET_3");
  }
  out.sort((x,y)=>x.r-y.r);
  return out;
}
function chooseTargets(candidates,d,entry,risk,p){
  const chosen=[];
  const pick=(minR,maxR,fallbackR,code)=>{
    let c=candidates.find(x=>x.r>=minR&&x.r<=maxR&&!chosen.some(y=>Math.abs(y.price-x.price)<risk*.20));
    if(!c){
      let r=Math.max(fallbackR,chosen.length?chosen.at(-1).r+.35:fallbackR);
      c={price:entry+d*risk*r,r,source:"DYNAMIC_R_FALLBACK"};
    }
    const row={code,price:snap(c.price),r:snap(c.r,3),source:c.source};chosen.push(row);return row;
  };
  const t1=pick(p.t1MinR,p.t1MaxR,p.t1FallbackR,"TP1");
  const t2=pick(Math.max(p.t2MinR,t1.r+.30),p.t2MaxR,p.t2FallbackR,"TP2");
  const t3=pick(Math.max(p.t3MinR,t2.r+.30),p.t3MaxR,p.t3FallbackR,"TP3");
  return [t1,t2,t3];
}
function directLockedPlan(signal,d){
  const entry=N(signal?.entry),sl=N(signal?.invalidation??signal?.originalSL??signal?.sl),
    tp1=N(signal?.tp1),tp2=N(signal?.tp2),tp3=N(signal?.tp3);
  if(!d||entry==null||sl==null||tp1==null||tp2==null||tp3==null)return null;
  const risk=d*(entry-sl);
  if(!(risk>0)||d*(tp1-entry)<=0||d*(tp2-tp1)<=0||d*(tp3-tp2)<=0)return null;
  return {valid:true,direction:d,entry,sl,risk:snap(risk),riskATR:null,tp1,tp2,tp3,
    targetSources:["LOCKED_PUBLISHED_PLAN","LOCKED_PUBLISHED_PLAN","LOCKED_PUBLISHED_PLAN"],
    stopSource:"LOCKED_PUBLISHED_PLAN",origin:"LOCKED_ALREADY_DYNAMIC_PLAN",
    management:{...UNIVERSAL_MANAGEMENT}};
}

export function buildDynamicTradePlan({signal,bars=[],tf="M5",mode="105",symbol="*",point=0,locked=false,profileOverride=null}={}){
  const d=DIR(signal),entry=N(signal?.entry);
  if(locked||signal?.lockedTradePlan===true){
    const q=directLockedPlan(signal,d);if(q)return q;
  }
  if(!d||entry==null)return {valid:false,reason:"MISSING_DIRECTION_OR_ENTRY",direction:d,entry};
  const a=normBars(bars),i=signalIndex(a,signal);
  if(i<15)return {valid:false,reason:"INSUFFICIENT_PRE_SIGNAL_BARS",direction:d,entry};
  const atr=Math.max(atrAt(a,i,14),Math.abs(N(point)||0)*20,1e-12),p=getEffectiveDynamicProfile(mode,symbol,profileOverride);
  const sp=stopPlan({signal,a,i,d,entry,atr,p});
  if(!sp||!(sp.risk>0))return {valid:false,reason:"NO_DYNAMIC_STRUCTURE_STOP",direction:d,entry,atr:snap(atr)};
  const candidates=collectTargets(a,i,d,entry,sp.risk,p,signal),targets=chooseTargets(candidates,d,entry,sp.risk,p);
  return {
    valid:true,direction:d,entry:snap(entry),sl:sp.stop,tp1:targets[0].price,tp2:targets[1].price,tp3:targets[2].price,
    risk:sp.risk,atr:snap(atr),riskATR:sp.riskATR,wideRisk:sp.wide,
    stopSource:sp.source,targetSources:targets.map(x=>x.source),targets,
    origin:"GOLDFLOW_DYNAMIC_ATR_STRUCTURE_"+p.name,
    profileKey:p.profileKey,profileSource:p.profileSource,
    profileParams:safePatch(p),
    nativePlan:{entry:N(signal?.entry),sl:N(signal?.invalidation??signal?.originalSL),tp1:N(signal?.tp1),tp2:N(signal?.tp2),tp3:N(signal?.tp3)},
    management:{...UNIVERSAL_MANAGEMENT}
  };
}

export function applyDynamicPlanToSignal(signal,bars=[],tf="M5",mode="105",point=0,symbol="*",profileOverride=null){
  if(!signal||DIR(signal)===0||signal?.confirmed===false||/^WAIT|^WATCH/.test(String(signal?.status||"").toUpperCase()))
    return {signal,plan:null};
  const plan=buildDynamicTradePlan({signal,bars,tf,mode,point,symbol,profileOverride});
  if(!plan.valid)return {signal:{...signal,managementStatus:"WAIT_DYNAMIC_PLAN_INCOMPLETE"},plan};
  return {
    plan,
    signal:{...signal,entry:plan.entry,invalidation:plan.sl,tp1:plan.tp1,tp2:plan.tp2,tp3:plan.tp3,
      managedPlanOrigin:plan.origin,managementPlan:plan.management,stopSource:plan.stopSource,targetSources:plan.targetSources,
      reasons:[...(Array.isArray(signal.reasons)?signal.reasons:[]),"GOLDFLOW DYNAMIC ATR + STRUCTURE MANAGEMENT"]}
  };
}
