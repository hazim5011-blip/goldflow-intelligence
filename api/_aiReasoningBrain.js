// GF-AI REASONING + SCENARIO BRAIN v1.30
// Produces concise, auditable analyst-style conclusions from already computed evidence.
// It does NOT expose hidden LLM chain-of-thought; every statement maps to measurable market evidence.
import {rnd,clamp} from "./_researchInputs.js";

const side=d=>d===1?"BUY":d===-1?"SELL":"NEUTRAL";
function session(nowSec){
 const h=new Date(Number(nowSec)*1000).getUTCHours();
 if(h>=12&&h<16)return {name:"LONDON_NEW_YORK_OVERLAP",activity:"HIGH"};
 if(h>=7&&h<12)return {name:"LONDON",activity:"MEDIUM_HIGH"};
 if(h>=16&&h<21)return {name:"NEW_YORK",activity:"MEDIUM_HIGH"};
 if(h>=0&&h<7)return {name:"ASIA",activity:"MEDIUM"};
 return {name:"ROLLOVER_OFF_HOURS",activity:"LOWER"};
}
function dirText(v){return Number(v)===1?"BULLISH":Number(v)===-1?"BEARISH":"NEUTRAL"}
function triggerFor(brain,d){
 const out=[];
 if(brain?.breakEvent?.direction===d)out.push(brain.breakEvent.type+" @ "+brain.breakEvent.level);
 if(brain?.liquidity?.sweep?.direction===d)out.push(brain.liquidity.sweep.type+" @ "+brain.liquidity.sweep.level);
 if(brain?.chartPattern?.direction===d)out.push(brain.chartPattern.type+" • "+brain.chartPattern.state);
 if(brain?.candlePattern?.direction===d)out.push(brain.candlePattern.type);
 return out;
}
function evidenceAcross(matrix,d){
 const good=[],bad=[];
 for(const x of Array.isArray(matrix)?matrix:[]){
  if(!x?.available)continue;
  const delta=(Number(x.buyScore)||0)-(Number(x.sellScore)||0),aligned=d===1?delta>5:delta<-5,opposed=d===1?delta<-5:delta>5;
  if(aligned)good.push(x.tf+" evidence favors "+side(d)+" ("+rnd(Math.abs(delta),0)+"-point edge)");
  if(opposed)bad.push(x.tf+" evidence favors "+side(-d)+" ("+rnd(Math.abs(delta),0)+"-point edge)");
  if(Number(x.structure)===d)good.push(x.tf+" structure "+(x.structureLabel||dirText(d)));
  if(Number(x.structure)===-d)bad.push(x.tf+" structure opposes");
  if(Number(x.breakEvent?.direction)===d)good.push(x.tf+" "+x.breakEvent.type+" supports "+side(d));
  if(Number(x.breakEvent?.direction)===-d)bad.push(x.tf+" "+x.breakEvent.type+" opposes "+side(d));
  if(Number(x.sweep?.direction)===d)good.push(x.tf+" "+x.sweep.type+" supports reversal/continuation");
  if(Number(x.chartPattern?.direction)===d&&x.chartPattern?.state==="CONFIRMED")good.push(x.tf+" "+x.chartPattern.type+" confirmed");
 }
 return {good:[...new Set(good)].slice(0,10),bad:[...new Set(bad)].slice(0,8)};
}
function planView(plan,d,price){
 if(!plan)return {available:false,state:"NO_CLEAN_ENTRY_GEOMETRY",entryModel:null,activation:["Wait for a new "+side(d)+" structure/liquidity retest."],invalidation:[],targets:[]};
 const inside=Number.isFinite(price)&&price>=Number(plan.entryLow)&&price<=Number(plan.entryHigh);
 return {available:true,state:inside?"PRICE_IN_CANDIDATE_ZONE":"WAIT_RETEST",entryModel:plan.entryMethod||"MARKET_DRIVEN_RETEST",
  entryLow:plan.entryLow,entryHigh:plan.entryHigh,inside,invalidation:Number.isFinite(Number(plan.invalidation))?[Number(plan.invalidation)]:[],
  targets:[plan.tp1,plan.tp2,plan.tp3].filter(Number.isFinite),
  activation:[inside?"Price is already inside the research entry zone.":"Wait for price to retest "+plan.entryLow+" — "+plan.entryHigh+".",
   "Require selected-TF closed confirmation to remain valid.","Do not chase if price moves materially beyond the planned zone."]};
}
function scenario({d,score,matrix,selected,plan,price,macroDirection,learning}){
 const ev=evidenceAcross(matrix,d),local=triggerFor(selected,d),opp=triggerFor(selected,-d),pv=planView(plan,d,price);
 if(local.length)ev.good.unshift(...local.map(x=>"Selected TF: "+x));
 if(opp.length)ev.bad.unshift(...opp.map(x=>"Selected TF opposite evidence: "+x));
 if(macroDirection===d)ev.good.push("Verified Gold macro context supports "+side(d));
 if(macroDirection===-d)ev.bad.push("Verified Gold macro is a headwind to "+side(d));
 const learn=d===1?learning?.buy:learning?.sell,adj=d===1?learning?.buyAdjustment:learning?.sellAdjustment;
 if(learn?.decidable>=5){
  const txt="Historical directional follow-through: "+learn.followThroughRate+"% from "+learn.decidable+" decidable samples";
  if(Number(adj)>0)ev.good.push(txt);else if(Number(adj)<0)ev.bad.push(txt);
 }
 const structuralTrigger=local.length>0,rawState=pv.inside&&structuralTrigger&&score>=66?"READY_CANDIDATE":
  structuralTrigger&&score>=54?"CONFIRMED_WAIT_RETEST":score>=42?"WATCH":"WEAK";
 return {side:side(d),score:rnd(score,1),state:rawState,entry:pv,evidence:ev.good,contradictions:ev.bad,
  learningAdjustment:Number(adj)||0,
  thesis:local.length?side(d)+" thesis has selected-TF trigger plus all-TF context.":side(d)+" thesis is contextual only; selected-TF trigger is not yet strong enough.",
  invalidatedIf:[
   ...(pv.invalidation.length?["Price violates structural invalidation "+pv.invalidation[0]+"."]:[]),
   "Selected TF closes a fresh "+side(-d)+" CHOCH/BOS against the thesis.",
   "All-TF consensus flips decisively to "+side(-d)+"."
  ],activation:pv.activation};
}
function noTradeScenario({buy,sell,selected,matrix,coverage}){
 const gap=Math.abs(Number(buy.score)-Number(sell.score)),reasons=[];
 if(gap<8)reasons.push("BUY and SELL evidence are too close.");
 if(Number(coverage?.available)<6)reasons.push("All-TF coverage is incomplete ("+(coverage?.available??0)+"/"+(coverage?.total??7)+").");
 if(selected?.regime?.type==="COMPRESSION")reasons.push("Selected TF is in volatility compression; false breaks are more likely.");
 if(!triggerFor(selected,1).length&&!triggerFor(selected,-1).length)reasons.push("No fresh selected-TF structural/liquidity/pattern trigger.");
 if(buy.contradictions.length>=buy.evidence.length&&sell.contradictions.length>=sell.evidence.length)reasons.push("Both directional theses have heavy contradictory evidence.");
 const score=clamp(45+(gap<8?25:0)+(selected?.regime?.type==="COMPRESSION"?12:0)+(reasons.length*3),0,100);
 return {side:"NO_TRADE",score:rnd(score,1),state:reasons.length?"VALID_OPTION":"SECONDARY_OPTION",reasons,
  activation:["Stay flat while evidence is balanced or structure is unclear.","Re-evaluate after a new BOS/CHOCH, liquidity sweep, or clean retest changes the evidence."]};
}
function narrative({selectedTf,selected,matrix,consensus,macroEvidence,nowSec,learning}){
 const s=session(nowSec),available=(matrix||[]).filter(x=>x.available),micro=available.filter(x=>["M1","M5"].includes(x.tf)),
  intraday=available.filter(x=>["M15","M30","H1"].includes(x.tf)),swing=available.filter(x=>["H4","D1"].includes(x.tf));
 const bucket=a=>{const n=a.reduce((z,x)=>z+(Number(x.structure)||0)+(Number(x.trend)||0),0);return n>1?"BULLISH":n<-1?"BEARISH":"MIXED"};
 return {session:s,selectedTf,selectedStructure:(selected?.structure?.highClass||"N/A")+"/"+(selected?.structure?.lowClass||"N/A"),
  selectedRegime:selected?.regime?.type||"UNKNOWN",selectedBreak:selected?.breakEvent?.label||"NONE",
  hierarchy:{micro:bucket(micro),intraday:bucket(intraday),swing:bucket(swing)},
  allTfConsensus:consensus,
  macro:macroEvidence?.assetSpecific?{bias:macroEvidence.bias,available:macroEvidence.available,scope:macroEvidence.scope}:{bias:"CONTEXT_ONLY",available:false,scope:macroEvidence?.scope||"N/A"},
  learning:learning?.ok?{mode:learning.mode,buyAdjustment:learning.buyAdjustment,sellAdjustment:learning.sellAdjustment,
   samples:learning.overall?.decidable||0}:{mode:"UNAVAILABLE",buyAdjustment:0,sellAdjustment:0,samples:0}};
}
export function buildReasoningBrain({symbol,selectedTf,selected,matrix,consensus,coverage,buyScore,sellScore,buyPlan,sellPlan,currentPrice,
 macroEvidence,macroDirection=0,learning,nowSec}={}){
 const buy=scenario({d:1,score:Number(buyScore)||0,matrix,selected,plan:buyPlan,price:currentPrice,macroDirection,learning});
 const sell=scenario({d:-1,score:Number(sellScore)||0,matrix,selected,plan:sellPlan,price:currentPrice,macroDirection,learning});
 const flat=noTradeScenario({buy,sell,selected,matrix,coverage});
 const gap=Math.abs(buy.score-sell.score);
 let primary="NO_TRADE";
 if(gap>=7&&Math.max(buy.score,sell.score)>=42)primary=buy.score>sell.score?"BUY":"SELL";
 if(flat.score>=72&&gap<10)primary="NO_TRADE";
 const alternative=primary==="BUY"?"SELL":primary==="SELL"?"BUY":buy.score>=sell.score?"BUY":"SELL";
 const P=primary==="BUY"?buy:primary==="SELL"?sell:flat,A=alternative==="BUY"?buy:sell;
 const whyPrimary=primary==="NO_TRADE"?(flat.reasons[0]||"Evidence is not sufficiently asymmetric."):
  (P.evidence[0]||P.thesis)+"; score "+P.score+"/100 vs "+A.score+"/100.";
 const change=primary==="NO_TRADE"?
  ["A fresh selected-TF BOS/CHOCH or liquidity sweep creates a clear score gap.","Price retests a clean structure zone with directional confirmation."]:
  [...P.invalidatedIf.slice(0,3),"Alternative "+alternative+" scenario overtakes the primary score by a clear margin."];
 return {version:"1.30",type:"AUDITABLE_SCENARIO_REASONING",symbol,marketNarrative:narrative({selectedTf,selected,matrix,consensus,macroEvidence,nowSec,learning}),
  scenarios:{BUY:buy,SELL:sell,NO_TRADE:flat},primaryScenario:primary,alternativeScenario:alternative,
  decisionSummary:{whyPrimary,whyNotAlternative:primary==="NO_TRADE"?"Neither directional thesis has enough separation.":A.contradictions[0]||"Alternative evidence is weaker than the primary thesis.",
   whatWouldChangeMyMind:change},
  discipline:["Primary scenario is not a guarantee.","Alternative scenario remains live until structurally invalidated.","NO_TRADE is a valid decision, not a failure to signal.",
   "Learning adjustment is capped and cannot override stale data or structural invalidation."]};
}
