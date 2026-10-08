// GF-AI PROFESSIONAL TRADER PLAYBOOK v1.40
// Converts all-TF evidence into ONE market thesis / Trade Idea ID.
// Purpose: emulate disciplined top-down analysis, not generate one "signal" per timeframe.
// H4/D1/H1 = context, M30/M15 = setup formation, M5/M1 = execution timing.
// The selected TF can own the entry, but lower/higher TFs must not create duplicate trades
// for the same market thesis.
import {TF_SECONDS,rnd,clamp} from "./_researchInputs.js";

const CONTEXT_TFS=["D1","H4","H1"];
const SETUP_TFS=["H1","M30","M15"];
const TRIGGER_TFS=["M15","M5","M1"];
const FIXED_ANCHOR_ORDER=["H4","H1","M30","M15","D1","M5","M1"];
const side=d=>d===1?"BUY":d===-1?"SELL":"NO_TRADE";
const finite=x=>Number.isFinite(Number(x));

function hash32(s){
 let h=2166136261;
 for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}
 return (h>>>0).toString(36).toUpperCase();
}
function brain(rows,tf){return rows?.[tf]?.brain||null}
function supportState(b,d){
 if(!b?.ok)return 0;
 let v=0;
 if(Number(b.structure?.bias)===d)v+=2; else if(Number(b.structure?.bias)===-d)v-=2;
 if(Number(b.breakEvent?.direction)===d)v+=2; else if(Number(b.breakEvent?.direction)===-d)v-=2;
 if(Number(b.liquidity?.sweep?.direction)===d)v+=1; else if(Number(b.liquidity?.sweep?.direction)===-d)v-=1;
 if(Number(b.chartPattern?.direction)===d&&b.chartPattern?.state==="CONFIRMED")v+=1;
 if(Number(b.chartPattern?.direction)===-d&&b.chartPattern?.state==="CONFIRMED")v-=1;
 return v>0?1:v<0?-1:0;
}
function describeFrame(rows,tf,d){
 const b=brain(rows,tf),r=rows?.[tf];
 if(!b?.ok)return {tf,role:"UNAVAILABLE",state:"N/A",support:0};
 const s=supportState(b,d),parts=[];
 if(b.structure?.highClass||b.structure?.lowClass)parts.push((b.structure?.highClass||"N/A")+"/"+(b.structure?.lowClass||"N/A"));
 if(b.breakEvent)parts.push((b.breakEvent.direction===d?"+":"-")+b.breakEvent.type+" @ "+b.breakEvent.level);
 if(b.liquidity?.sweep)parts.push((b.liquidity.sweep.direction===d?"+":"-")+b.liquidity.sweep.type);
 if(b.chartPattern)parts.push((b.chartPattern.direction===d?"+":"-")+b.chartPattern.type+" "+b.chartPattern.state);
 return {tf,role:r?.role||null,state:s===1?"SUPPORT":s===-1?"OPPOSE":"NEUTRAL",support:s,
  structureBias:Number(b.structure?.bias)||0,trend:Number(r?.trend)||0,regime:b.regime?.type||"UNKNOWN",evidence:parts.slice(0,5)};
}
function latestAnchor(rows,d){
 for(const tf of FIXED_ANCHOR_ORDER){
  const b=brain(rows,tf);if(!b?.ok)continue;
  if(b.breakEvent?.direction===d)return {tf,type:b.breakEvent.type,time:b.breakEvent.time||0,level:b.breakEvent.level||0};
  if(b.liquidity?.sweep?.direction===d)return {tf,type:b.liquidity.sweep.type,time:b.liquidity.sweep.time||0,level:b.liquidity.sweep.level||0};
 }
 for(const tf of ["H4","H1","M30","M15","D1"]){
  const b=brain(rows,tf);if(!b?.ok)continue;
  const p=d===1?b.structure?.lastLow:b.structure?.lastHigh;
  if(p)return {tf,type:"STRUCTURE_ANCHOR",time:p.time||0,level:p.price||0};
 }
 return {tf:"NA",type:"NO_STRUCTURAL_ANCHOR",time:0,level:0};
}
function ideaId(symbol,d,rows,nowSec){
 const a=latestAnchor(rows,d),day=Math.floor(Number(nowSec||0)/86400);
 const key=[String(symbol||"SYMBOL").toUpperCase(),side(d),a.tf,a.type,Math.round(Number(a.time)||0),rnd(Number(a.level)||0,1),day].join("|");
 return {id:"GF-"+hash32(key),key,anchor:a};
}
function groupSummary(rows,d,tfs){
 const frames=tfs.map(tf=>describeFrame(rows,tf,d)).filter(x=>x.state!=="N/A");
 const support=frames.filter(x=>x.support===1).length,oppose=frames.filter(x=>x.support===-1).length,neutral=frames.length-support-oppose;
 return {frames,support,oppose,neutral,available:frames.length,
  bias:support>oppose?"SUPPORT":oppose>support?"OPPOSE":"MIXED"};
}
function selectedTrigger(selected,d){
 const out=[];
 if(selected?.breakEvent?.direction===d)out.push(selected.breakEvent.type);
 if(selected?.liquidity?.sweep?.direction===d)out.push(selected.liquidity.sweep.type);
 if(selected?.chartPattern?.direction===d&&selected.chartPattern.state==="CONFIRMED")out.push(selected.chartPattern.type);
 if(selected?.candlePattern?.direction===d)out.push(selected.candlePattern.type);
 return out;
}
function rr(plan){
 if(!plan||!finite(plan.entryLow)||!finite(plan.entryHigh)||!finite(plan.invalidation)||!finite(plan.tp1))return null;
 const mid=(Number(plan.entryLow)+Number(plan.entryHigh))/2,risk=Math.abs(mid-Number(plan.invalidation)),reward=Math.abs(Number(plan.tp1)-mid);
 return risk>0?rnd(reward/risk,2):null;
}
function tfRole(selectedTf){
 if(["M1","M5"].includes(selectedTf))return "EXECUTION";
 if(["M15","M30"].includes(selectedTf))return "SETUP_AND_ENTRY";
 if(["H1","H4","D1"].includes(selectedTf))return "SWING_CONTEXT_AND_ENTRY";
 return "ENTRY";
}
function quality({context,setup,trigger,plan,inside,score,rr1,macroHeadwind,noTradeScore,counterTrend}){
 let q=0,reasons=[],risks=[];
 q+=Math.min(24,context.support*9);q-=context.oppose*8;
 q+=Math.min(24,setup.support*8);q-=setup.oppose*6;
 if(trigger.length){q+=18;reasons.push("Selected-TF trigger confirmed: "+trigger.join(", "))}
 else risks.push("No fresh selected-TF structural/liquidity/pattern trigger");
 if(plan){q+=12;reasons.push("Defensible market-driven entry/SL/TP geometry exists")}
 else risks.push("No defensible market-driven entry geometry");
 if(inside){q+=8;reasons.push("Price is inside candidate entry zone")}
 if(finite(rr1)&&rr1>=1){q+=5;reasons.push("TP1 structural R:R >= 1.0")}
 else if(finite(rr1)){q-=4;risks.push("TP1 structural R:R below 1.0")}
 if(Number(score)>=70)q+=7; else if(Number(score)<50)q-=6;
 if(macroHeadwind){q-=4;risks.push("Verified macro is a headwind")}
 if(counterTrend){q-=10;risks.push("Higher-timeframe context opposes")}
 if(Number(noTradeScore)>=72){q-=8;risks.push("NO-TRADE scenario remains strong")}
 q=clamp(q,0,100);
 let grade=q>=82?"A+":q>=70?"A":q>=58?"B":q>=45?"C":"WATCH";
 return {score:rnd(q,1),grade,reasons,risks};
}
function stage({trigger,plan,inside,canEnter,invalid=false}){
 if(invalid)return "INVALIDATED";
 if(canEnter)return "ENTRY_READY";
 if(trigger.length&&plan&&inside)return "RETEST_ACTIVE";
 if(trigger.length&&plan)return "CONFIRMED_WAIT_RETEST";
 if(trigger.length)return "TRIGGER_CONFIRMED_NO_PLAN";
 if(plan)return "SETUP_WATCH";
 return "CONTEXT_ONLY";
}
export function buildProfessionalTradeIdea({symbol,selectedTf,direction,rows,selected,plan,currentPrice,reasoning,analysis,macroEvidence,nowSec,canEnter=false,status=null}={}){
 const d=[1,-1].includes(Number(direction))?Number(direction):0;
 const context=d?groupSummary(rows,d,CONTEXT_TFS):groupSummary(rows,1,CONTEXT_TFS);
 const setup=d?groupSummary(rows,d,SETUP_TFS):groupSummary(rows,1,SETUP_TFS);
 const execution=d?groupSummary(rows,d,TRIGGER_TFS):groupSummary(rows,1,TRIGGER_TFS);
 const tr=d?selectedTrigger(selected,d):[],r1=rr(plan);
 const inside=!!(plan&&finite(currentPrice)&&Number(currentPrice)>=Number(plan.entryLow)&&Number(currentPrice)<=Number(plan.entryHigh));
 const noTradeScore=Number(reasoning?.scenarios?.NO_TRADE?.score)||0;
 const q=d?quality({context,setup,trigger:tr,plan,inside,score:Number(analysis?.directionScore)||0,rr1:r1,
   macroHeadwind:!!analysis?.macroHeadwind,noTradeScore,counterTrend:!!analysis?.counterTrend}):{score:0,grade:"NO_TRADE",reasons:[],risks:["No directional thesis selected"]};
 const identity=d?ideaId(symbol,d,rows,nowSec):{id:"GF-NO-TRADE",key:"NO_TRADE",anchor:null};
 const invalid=/INVALID|EXPIRED|MISSED|COMPLETED|AMBIGUOUS/.test(String(status||""));
 const ideaStage=stage({trigger:tr,plan,inside,canEnter,invalid});
 const primary=reasoning?.primaryScenario||side(d),alt=reasoning?.alternativeScenario||null;
 return {version:"1.40",tradeIdeaId:identity.id,tradeIdeaKey:identity.key,anchor:identity.anchor,side:side(d),selectedTf,
  selectedTfRole:tfRole(selectedTf),stage:ideaStage,qualityGrade:q.grade,qualityScore:q.score,rrToTp1:r1,
  hierarchy:{context,setup,execution},
  professionalPlaybook:{
   contextRule:"D1/H4/H1 define market regime and directional risk. They do not create duplicate lower-TF trades.",
   setupRule:"H1/M30/M15 locate BOS/CHOCH, liquidity transition, SND/SNR/SBR/RBS, OB/FVG and pattern setup.",
   triggerRule:"M15/M5/M1 refine timing. Selected TF owns the entry; M1/M5 must not override a broken H1/H4 thesis without reversal evidence.",
   oneIdeaRule:"One market thesis = one Trade Idea ID. Other TFs are confirmations/entry refinements, not separate wins.",
   quotaRule:"No forced signal quota per timeframe. Zero trades is valid when structure is poor.",
   chaseRule:"Do not chase after price materially leaves the planned retest zone.",
   invalidationRule:"A thesis is wrong when structural invalidation is breached or opposite structure decisively replaces it."
  },
  entryDiscipline:{planAvailable:!!plan,insideZone:inside,entryModel:plan?.entryMethod||null,
   entryLow:plan?.entryLow??null,entryHigh:plan?.entryHigh??null,invalidation:plan?.invalidation??null,
   tp1:plan?.tp1??null,tp2:plan?.tp2??null,tp3:plan?.tp3??null,oneEntryIdea:true,duplicateTfEntries:false},
  thesisControl:{primaryScenario:primary,alternativeScenario:alt,noTradeScore,
   whatWouldChangeMyMind:reasoning?.decisionSummary?.whatWouldChangeMyMind||[]},
  professionalChecks:{passed:q.reasons,risks:q.risks},
  teachingNote:"This module codifies a top-down professional process: context → setup → trigger → location → invalidation → target. It is auditable logic, not a copied ChatGPT model or guaranteed trade outcome."};
}
