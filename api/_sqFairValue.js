import {n,clamp,isGoldSymbol,sign} from "./_sqFeatures.js";

function bounded(x){return Math.max(-1,Math.min(1,x))}
function component(id,label,value,weight,detail){
  return value==null?null:{id,label,value:bounded(value),weight,detail};
}
export function buildDirectionalEdge({analysis,features,regime,macro}){
  const sig=analysis?.indicator?.latestSignal||{},dir=sign(n(sig.direction)||0),score=n(sig.score);
  const setupTrend=sign(features?.setupTrend||0),biasTrend=sign(features?.biasTrend||0);
  const setupStrength=(n(analysis?.indicator?.setupState?.strength)??50)/100;
  const biasStrength=(n(analysis?.indicator?.biasState?.strength)??50)/100;
  const zones=analysis?.indicator?.activeZones||{},buy=(zones.buy||[]).length,sell=(zones.sell||[]).length;
  let liquidity=0;
  if(features?.sweepDown)liquidity=1;else if(features?.sweepUp)liquidity=-1;
  else if(buy||sell)liquidity=bounded((buy-sell)/Math.max(1,buy+sell));

  const comps=[
    component("STRUCTURE","Indicator structure",dir&&score!=null?dir*clamp((score-50)/50,-1,1):null,.22,score!=null?"Engine score "+Math.round(score):"No directional engine score"),
    component("MTF","Multi-timeframe",(setupTrend*setupStrength+biasTrend*biasStrength)/2,.18,"Setup and bias trend/strength"),
    component("EMA","EMA location",features?.ready?bounded(features.emaSpreadAtr/.8):null,.14,"EMA20 minus EMA50 normalized by ATR14"),
    component("MOMENTUM","EMA slope",features?.ready?bounded(features.ema20SlopeAtr5/.5):null,.10,"EMA20 5-bar slope normalized by ATR14"),
    component("LIQUIDITY","Liquidity/zone",features?.ready?liquidity:null,.10,"Sweep and active directional zones"),
    component("REGIME","Regime direction",regime?.name!=="UNKNOWN"?sign(regime?.direction||0)*(n(regime?.confidence)??0)/100:null,.11,regime?.name||"UNKNOWN"),
    component("MACRO","Gold macro",isGoldSymbol(analysis?.symbol||analysis?.requested)&&macro?.ok&&n(macro?.gold?.score)!=null?bounded((Number(macro.gold.score)-50)/50):null,.15,macro?.gold?.bias||"Not applicable")
  ].filter(Boolean);
  const totalW=.22+.18+.14+.10+.10+.11+.15,used=comps.reduce((s,x)=>s+x.weight,0);
  const raw=used?comps.reduce((s,x)=>s+x.value*x.weight,0)/used:0;
  const score100=Math.round(100*raw),coverage=Math.round(100*used/totalW);
  const bias=score100>=20?"BULLISH":score100<=-20?"BEARISH":"MIXED";
  const aligned=dir&&((score100>0&&dir>0)||(score100<0&&dir<0));
  return {
    directionalEdgeIndex:score100,bias,coverage,
    alignmentWithCurrentSignal:dir?aligned:null,
    components:comps.map(x=>({...x,contribution:Number((100*x.value*x.weight/used).toFixed(2))})),
    interpretation:"Directional Edge Index combines normalized evidence; it is not a fair-value price target or calibrated probability."
  };
}
