// GF-AI PROFESSIONAL TRADER PLAYBOOK v1.40
// Converts all-TF evidence into one coherent Trade Idea instead of one "signal" per timeframe.
// Deterministic research logic only. No copied ChatGPT model, no trained ML, no broker execution.
import {TF_SECONDS,rnd,clamp} from "./_researchInputs.js";

const ROLE={
 D1:{role:"REGIME",purpose:"Major regime / macro structure",entryOwner:false,qualityFloor:78,cadence:"0–2 A-grade ideas/week"},
 H4:{role:"SWING_CONTEXT",purpose:"Major swing structure / directional context",entryOwner:true,qualityFloor:76,cadence:"0–2 A-grade ideas/week"},
 H1:{role:"THESIS",purpose:"Primary operating thesis / swing-intraday structure",entryOwner:true,qualityFloor:72,cadence:"0–2 A-grade ideas/day"},
 M30:{role:"SETUP_STRUCTURE",purpose:"Intraday setup structure / transition",entryOwner:true,qualityFloor:70,cadence:"1–3 A-grade ideas/day"},
 M15:{role:"SETUP_CONFIRMATION",purpose:"Setup formation / confirmation",entryOwner:true,qualityFloor:68,cadence:"1–4 A-grade ideas/day"},
 M5:{role:"EXECUTION",purpose:"Primary intraday execution / retest",entryOwner:true,qualityFloor:66,cadence:"2–5 A-grade opportunities/day"},
 M1:{role:"PRECISION_TRIGGER",purpose:"Micro trigger only; never defines major trend alone",entryOwner:true,qualityFloor:70,cadence:"Many raw triggers; only 5–10 quality entries over active 2–3 day windows"}
};
const TF_ORDER=["D1","H4","H1","M30","M15","M5","M1"];
const side=d=>d===1?"BUY":d===-1?"SELL":"NO_TRADE";

function djb2(s){
 let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h)^s.charCodeAt(i);
 return (h>>>0).toString(36).toUpperCase();
}
function tfRow(matrix,tf){return (Array.isArray(matrix)?matrix:[]).find(x=>x?.tf===tf&&x.available)||null}
function dirOf(row){
 if(!row)return 0;
 const edge=(Number(row.buyScore)||0)-(Number(row.sellScore)||0);
 if(Number(row.structure)===1&&edge>4)return 1;
 if(Number(row.structure)===-1&&edge<-4)return -1;
 if(edge>9)return 1;if(edge<-9)return -1;
 return 0;
}
function bucket(matrix,tfs){
 const rows=tfs.map(tf=>tfRow(matrix,tf)).filter(Boolean);
 if(!rows.length)return {direction:0,score:0,rows:[]};
 let n=0,w=0;
 for(const r of rows){
  const d=dirOf(r),importance=r.tf==="D1"?1.35:r.tf==="H4"?1.25:r.tf==="H1"?1.15:1;
  n+=d*importance;w+=importance;
 }
 const x=w?n/w:0;
 return {direction:x>.2?1:x<-.2?-1:0,score:rnd(Math.abs(x)*100,0),rows:rows.map(r=>r.tf)};
}
function structureEvent(selected,d){
 const b=selected?.breakEvent,l=selected?.liquidity?.sweep,p=selected?.chartPattern,c=selected?.candlePattern;
 if(Number(b?.direction)===d)return {type:b.type,level:b.level,time:b.time,rank:b.type==="CHOCH"?100:96};
 if(Number(l?.direction)===d)return {type:l.type,level:l.level,time:l.time,rank:92};
 if(Number(p?.direction)===d&&p.state==="CONFIRMED")return {type:p.type,level:p.neckline||null,time:null,rank:88};
 if(Number(c?.direction)===d)return {type:c.type,level:null,time:null,rank:76};
 return null;
}
function riskGeometry(plan,d){
 if(!plan)return {valid:false,rr1:null,rr2:null,rr3:null,reason:"NO_CLEAN_ENTRY_GEOMETRY"};
 const lo=Number(plan.entryLow),hi=Number(plan.entryHigh),sl=Number(plan.invalidation),tp1=Number(plan.tp1),tp2=Number(plan.tp2),tp3=Number(plan.tp3);
 const mid=(lo+hi)/2,risk=d*(mid-sl);
 if(![lo,hi,sl,tp1].every(Number.isFinite)||!(risk>0))return {valid:false,rr1:null,rr2:null,rr3:null,reason:"INVALID_RISK_GEOMETRY"};
 const rr=x=>Number.isFinite(x)?rnd(d*(x-mid)/risk,2):null;
 const r1=rr(tp1),r2=rr(tp2),r3=rr(tp3);
 return {valid:r1!==null&&r1>=.9,rr1:r1,rr2:r2,rr3:r3,reason:r1!==null&&r1>=.9?"ACCEPTABLE":"TP1_RR_TOO_SMALL"};
}
function locationEvidence(selected,d,price){
 const z=selected?.zones||{},hits=[];
 const add=(name,obj)=>{if(!obj)return;const lo=Number(obj.low),hi=Number(obj.high);if(Number.isFinite(lo)&&Number.isFinite(hi)&&price>=Math.min(lo,hi)&&price<=Math.max(lo,hi))hits.push(name)};
 add(d===1?"DEMAND":"SUPPLY",d===1?z.demand:z.supply);
 add(d===1?"RBS":"SBR",z.flip?.direction===d?z.flip:null);
 add("ORDER_BLOCK",z.orderBlock?.direction===d?z.orderBlock:null);
 add("FVG",z.fvg?.direction===d?z.fvg:null);
 return hits;
}
function phase({selectedTf,matrix,primaryDirection,selected,plan,currentPrice}){
 const major=bucket(matrix,["D1","H4"]),operating=bucket(matrix,["H1","M30"]),entry=bucket(matrix,["M15","M5","M1"]);
 const event=structureEvent(selected,primaryDirection),inside=plan&&Number.isFinite(currentPrice)&&currentPrice>=Number(plan.entryLow)&&currentPrice<=Number(plan.entryHigh);
 let state="THESIS";
 if(event)state="SETUP_CONFIRMED";
 if(event&&plan)state="WAIT_RETEST";
 if(event&&plan&&inside)state="ENTRY_WINDOW";
 return {state,major,operating,entry,event,selectedTf};
}
function countertrend({d,matrix,selected,selectedTf}){
 const major=bucket(matrix,["D1","H4"]),operating=bucket(matrix,["H1","M30"]);
 const againstMajor=major.direction&&major.direction===-d,againstOperating=operating.direction&&operating.direction===-d;
 const choch=selected?.breakEvent?.type==="CHOCH"&&Number(selected.breakEvent.direction)===d;
 const sweep=Number(selected?.liquidity?.sweep?.direction)===d;
 const transition=[...["H1","M30","M15"].map(tf=>tfRow(matrix,tf))].some(r=>Number(r?.breakEvent?.direction)===d&&["CHOCH","BOS"].includes(String(r.breakEvent?.type||"")));
 const strong=Boolean((againstMajor||againstOperating)&&choch&&sweep&&transition);
 return {isCounterTrend:Boolean(againstMajor||againstOperating),againstMajor,againstOperating,strongException:strong,
  required:["Selected-TF CHOCH","Liquidity sweep in trade direction","At least one H1/M30/M15 structural turn"],
  passed:{choch,sweep,higherTransition:transition}};
}
function quality({score,selectedTf,phaseInfo,counter,risk,locationHits,macroHeadwind,reasoning}){
 const role=ROLE[selectedTf]||ROLE.M15;let q=Number(score)||0;const reasons=[],blockers=[];
 if(phaseInfo.event){q+=6;reasons.push("Fresh selected-TF structural trigger +6")}else blockers.push("NO_FRESH_SELECTED_TF_TRIGGER");
 if(locationHits.length){q+=Math.min(8,locationHits.length*3);reasons.push("Good market location "+locationHits.join("/")+" +"+Math.min(8,locationHits.length*3))}
 else blockers.push("NO_STRONG_LOCATION_OVERLAP");
 if(risk.valid){q+=5;reasons.push("Defensible TP1 risk/reward +5")}else blockers.push(risk.reason);
 if(counter.isCounterTrend&&!counter.strongException){q-=12;blockers.push("COUNTERTREND_WITHOUT_FULL_REVERSAL_SEQUENCE")}
 if(counter.strongException){q+=5;reasons.push("Countertrend reversal exception fully evidenced +5")}
 if(macroHeadwind){q-=3;reasons.push("Macro headwind -3")}
 if(reasoning?.primaryScenario==="NO_TRADE"){q-=15;blockers.push("REASONING_PRIMARY_NO_TRADE")}
 q=clamp(q,0,100);
 const floor=role.qualityFloor,grade=q>=82?"A+":q>=floor?"A":q>=floor-8?"B":"C";
 return {score:rnd(q,1),grade,floor,eligible:q>=floor&&risk.valid&&(!counter.isCounterTrend||counter.strongException)&&reasoning?.primaryScenario!=="NO_TRADE",reasons,blockers};
}
function anchorTf({d,matrix,selectedTf}){
 for(const tf of ["H4","H1","M30","M15"]){
  const r=tfRow(matrix,tf);if(!r)continue;
  if(dirOf(r)===d||Number(r.breakEvent?.direction)===d)return tf;
 }
 return selectedTf;
}
function ideaId({symbol,d,anchor,event,plan}){
 const key=[String(symbol||"SYMBOL"),side(d),anchor,String(event?.type||"THESIS"),String(event?.time||""),String(event?.level||plan?.entryLow||"")].join("|");
 return "GF-"+djb2(key);
}
export function buildProfessionalPlaybook({symbol,selectedTf,matrix,selected,reasoning,analysis,plan,currentPrice,macroHeadwind=false}={}){
 const d=reasoning?.primaryScenario==="BUY"?1:reasoning?.primaryScenario==="SELL"?-1:Number(analysis?.directionScore)>=0?0:0;
 const role=ROLE[selectedTf]||ROLE.M15;
 if(!d)return {version:"1.40",mode:"PROFESSIONAL_TRADER_PLAYBOOK",selectedTf,selectedTfRole:role,tradeIdea:null,
  status:"NO_TRADE",reason:"Scenario Reasoning has no directional PRIMARY thesis. No Trade Idea is created."};
 const p=phase({selectedTf,matrix,primaryDirection:d,selected,plan,currentPrice}),counter=countertrend({d,matrix,selected,selectedTf}),
  risk=riskGeometry(plan,d),loc=locationEvidence(selected,d,Number(currentPrice)),q=quality({score:analysis?.directionScore,selectedTf,phaseInfo:p,counter,risk,locationHits:loc,macroHeadwind,reasoning}),
  anchor=anchorTf({d,matrix,selectedTf}),event=p.event,anchorRow=tfRow(matrix,anchor),anchorEvent=anchorRow?.breakEvent||event,id=ideaId({symbol,d,anchor,event:anchorEvent,plan});
 const executionHierarchy={
  regime:["D1","H4"],
  thesis:["H1","M30"],
  setup:["M15","M5"],
  precision:["M1"],
  rule:"Lower TF confirms and times the SAME Trade Idea; it does not create a duplicate independent trade unless the parent thesis is structurally invalidated and a new thesis forms."
 };
 const tfChecklist=TF_ORDER.map(tf=>{
  const r=tfRow(matrix,tf),roleDef=ROLE[tf];
  return {tf,role:roleDef.role,purpose:roleDef.purpose,available:!!r,direction:r?side(dirOf(r)):"N/A",
   structure:r?.structureLabel||"N/A",breakEvent:r?.breakEvent?.type||null,rawBuy:r?.buyScore??null,rawSell:r?.sellScore??null};
 });
 const state=!q.eligible?"WATCH":p.state==="ENTRY_WINDOW"?"ENTRY_READY":p.state==="WAIT_RETEST"?"CONFIRMED_WAIT_RETEST":"WATCH";
 return {version:"1.40",mode:"PROFESSIONAL_TRADER_PLAYBOOK",selectedTf,selectedTfRole:role,tradeIdea:{
   id,symbol,direction:side(d),anchorTf:anchor,state,quality:q,phase:p.state,entryModel:plan?.entryMethod||null,
   entryRange:plan?{low:plan.entryLow,high:plan.entryHigh}:null,structuralStop:plan?.invalidation??null,
   targets:plan?[plan.tp1,plan.tp2,plan.tp3].filter(Number.isFinite):[],riskGeometry:risk,locationEvidence:loc,
   counterTrend:counter,macroHeadwind:Boolean(macroHeadwind),
   duplicatePolicy:"ONE_PARENT_IDEA_ACROSS_TFS",entryOwner:role.entryOwner,
   cadenceGuidance:role.cadence,
   professionalRule:state==="ENTRY_READY"?"Entry is permitted by playbook research gates; still not broker execution.":
    "Do not force or chase. Wait until market location, structural trigger and risk geometry are simultaneously acceptable."
  },executionHierarchy,tfChecklist,
  education:{
   coreSequence:["Read D1/H4 regime","Build H1/M30 thesis","Confirm M15/M5 setup","Use M1 only for precision trigger","Check location + invalidation + RR","Compare BUY/SELL/NO_TRADE","Execute only one parent Trade Idea"],
   avoid:["Counting one movement as multiple independent TF signals","M1 deciding the major trend alone","Chasing after price leaves the planned zone","Entering in the middle of a range without location","Treating Fibonacci as the setup","Forcing a daily signal quota"]
  }};
}
