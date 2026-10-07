// GF-AI EXPERIENCE / LEARNING BRAIN v1.30
// Pure retrospective calibration from CLOSED Vantage candles.
// This is NOT trained ML, NOT a trade win-rate engine and NOT forward proof.
// It measures directional follow-through after objectively detected structural events
// and may adjust live confluence only by a tightly capped amount when sample size is adequate.
import {readMarketBrain} from "./_aiMarketBrain.js";
import {clamp,rnd,TF_SECONDS} from "./_researchInputs.js";

const HORIZON={M1:16,M5:14,M15:12,M30:10,H1:8,H4:5,D1:4};
const MAX_EVENTS=72;
const MIN_SAMPLES=5;
const MAX_ADJUST=5;

function eventOf(brain,lastIndex){
 if(!brain?.ok)return null;
 const b=brain.breakEvent;
 if(b&&Number.isInteger(b.index)&&b.index===lastIndex&&[1,-1].includes(Number(b.direction)))
  return {direction:Number(b.direction),family:b.type==="CHOCH"?"CHOCH_REVERSAL":"BOS_CONTINUATION",type:b.type};
 const s=brain.liquidity?.sweep;
 if(s&&Number.isInteger(s.index)&&s.index===lastIndex&&[1,-1].includes(Number(s.direction)))
  return {direction:Number(s.direction),family:"LIQUIDITY_SWEEP",type:s.type};
 const c=brain.candlePattern;
 if(c&&[1,-1].includes(Number(c.direction))&&/DISPLACEMENT|ENGULFING|PIN_REJECTION/.test(String(c.type||"")))
  return {direction:Number(c.direction),family:/DISPLACEMENT/.test(c.type)?"DISPLACEMENT":/ENGULFING/.test(c.type)?"ENGULFING":"REJECTION",type:c.type};
 return null;
}
function fingerprint(brain,event){
 const regime=String(brain?.regime?.type||"UNKNOWN");
 const structure=Number(brain?.structure?.bias)||0;
 const aligned=structure===event.direction?"STRUCTURE_ALIGNED":structure===-event.direction?"COUNTER_STRUCTURE":"STRUCTURE_NEUTRAL";
 return event.family+"|"+regime+"|"+aligned;
}
function outcomeFor(bars,i,d,atr,horizon){
 const entry=Number(bars[i]?.c);if(!Number.isFinite(entry)||!Number.isFinite(atr)||atr<=0)return null;
 const take=entry+d*atr,stop=entry-d*.75*atr;
 let mfe=0,mae=0,result="OPEN_WINDOW",exitIndex=null;
 const end=Math.min(bars.length-1,i+horizon);
 for(let j=i+1;j<=end;j++){
  const x=bars[j],fav=d===1?Number(x.h)-entry:entry-Number(x.l),adv=d===1?entry-Number(x.l):Number(x.h)-entry;
  if(Number.isFinite(fav))mfe=Math.max(mfe,fav);if(Number.isFinite(adv))mae=Math.max(mae,adv);
  const hitT=d===1?Number(x.h)>=take:Number(x.l)<=take;
  const hitS=d===1?Number(x.l)<=stop:Number(x.h)>=stop;
  if(hitT&&hitS){result="AMBIGUOUS";exitIndex=j;break}
  if(hitT){result="FOLLOW_THROUGH";exitIndex=j;break}
  if(hitS){result="FAILED_FOLLOW_THROUGH";exitIndex=j;break}
 }
 return {result,entry:rnd(entry),take:rnd(take),stop:rnd(stop),mfeAtr:rnd(mfe/atr,2),maeAtr:rnd(mae/atr,2),
  barsObserved:end-i,exitIndex};
}
function aggregate(events,filter=()=>true){
 const rows=events.filter(filter),closed=rows.filter(x=>["FOLLOW_THROUGH","FAILED_FOLLOW_THROUGH"].includes(x.outcome.result));
 const wins=closed.filter(x=>x.outcome.result==="FOLLOW_THROUGH").length,losses=closed.length-wins;
 const ambiguous=rows.filter(x=>x.outcome.result==="AMBIGUOUS").length,open=rows.filter(x=>x.outcome.result==="OPEN_WINDOW").length;
 const rate=closed.length?wins/closed.length:null;
 const avgMfe=rows.length?rows.reduce((a,x)=>a+(Number(x.outcome.mfeAtr)||0),0)/rows.length:null;
 const avgMae=rows.length?rows.reduce((a,x)=>a+(Number(x.outcome.maeAtr)||0),0)/rows.length:null;
 return {samples:rows.length,decidable:closed.length,followThrough:wins,failed:losses,ambiguous,openWindow:open,
  followThroughRate:rate===null?null:rnd(rate*100,1),avgMfeAtr:avgMfe===null?null:rnd(avgMfe,2),avgMaeAtr:avgMae===null?null:rnd(avgMae,2)};
}
function adjustment(stat){
 if(!stat||stat.decidable<MIN_SAMPLES||stat.followThroughRate===null)return 0;
 const edge=(stat.followThroughRate-50)/50;
 return rnd(clamp(edge*MAX_ADJUST,-MAX_ADJUST,MAX_ADJUST),1);
}
export function learnFromClosedBars(bars=[],tf="M15"){
 if(!Array.isArray(bars)||bars.length<78||!TF_SECONDS[tf])
  return {ok:false,mode:"HISTORICAL_DIRECTIONAL_FOLLOW_THROUGH",reason:"INSUFFICIENT_CLOSED_HISTORY",buyAdjustment:0,sellAdjustment:0};
 const horizon=HORIZON[tf]||10,start=Math.max(58,bars.length-150),events=[],seen=new Set();
 for(let i=start;i<bars.length-horizon;i++){
  const prefix=bars.slice(0,i+1),brain=readMarketBrain(prefix,Number(prefix.at(-1)?.c));
  if(!brain?.ok)continue;
  const event=eventOf(brain,prefix.length-1);if(!event)continue;
  const key=String(prefix.at(-1)?.t)+"|"+event.type+"|"+event.direction;if(seen.has(key))continue;seen.add(key);
  const out=outcomeFor(bars,i,event.direction,Number(brain.atr),horizon);if(!out)continue;
  events.push({time:prefix.at(-1)?.t,direction:event.direction,family:event.family,type:event.type,fingerprint:fingerprint(brain,event),
   regime:brain.regime?.type||"UNKNOWN",structureBias:Number(brain.structure?.bias)||0,outcome:out});
  if(events.length>=MAX_EVENTS)break;
 }
 const buy=aggregate(events,x=>x.direction===1),sell=aggregate(events,x=>x.direction===-1),overall=aggregate(events);
 const families={};
 for(const fam of [...new Set(events.map(x=>x.family))])families[fam]=aggregate(events,x=>x.family===fam);
 return {ok:true,mode:"HISTORICAL_DIRECTIONAL_FOLLOW_THROUGH",tf,historyBars:bars.length,horizonClosedBars:horizon,
  sampleDefinition:"After a detected structural/candle event, measure whether price reaches +1 ATR before -0.75 ATR within the fixed closed-bar horizon. This is NOT an entry simulation.",
  overall,buy,sell,families,buyAdjustment:adjustment(buy),sellAdjustment:adjustment(sell),adjustmentCap:MAX_ADJUST,minSamplesForAdjustment:MIN_SAMPLES,
  recentEvents:events.slice(-10),disclaimer:"Experience calibration is descriptive broker-history evidence, not win probability, trained ML, or forward performance proof."};
}
