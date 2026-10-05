import {replayOutcome} from "./_v8Core.js";
import {n} from "./_sqFeatures.js";

const resolved=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE","BE_ZERO","SL"]);
function wilson(w,total,z=1.96){
  if(!(total>0))return {low:null,high:null};
  const p=w/total,z2=z*z,den=1+z2/total;
  const center=(p+z2/(2*total))/den;
  const half=z*Math.sqrt((p*(1-p)+z2/(4*total))/total)/den;
  return {low:Math.max(0,center-half),high:Math.min(1,center+half)};
}
function stats(rows){
  const nonzero=rows.filter(x=>x.rMultiple!==0),wins=nonzero.filter(x=>x.rMultiple>0),losses=nonzero.filter(x=>x.rMultiple<0),zeros=rows.filter(x=>x.rMultiple===0);
  const sum=a=>a.reduce((s,x)=>s+x.rMultiple,0),sumPos=sum(wins),sumNeg=Math.abs(sum(losses));
  const wr=nonzero.length?wins.length/nonzero.length:null,ci=wilson(wins.length,nonzero.length);
  return {
    sampleCount:rows.length,nonzeroCount:nonzero.length,wins:wins.length,losses:losses.length,beZero:zeros.length,
    winRate:wr,winRateWilson95:ci,
    meanR:rows.length?sum(rows)/rows.length:null,
    avgWinR:wins.length?sumPos/wins.length:null,
    avgLossRAbs:losses.length?sumNeg/losses.length:null,
    profitFactorR:sumNeg>0?sumPos/sumNeg:null
  };
}
export function buildHistoricalEdge(analysis){
  const history=Array.isArray(analysis?.indicator?.history)?analysis.indicator.history:[];
  const bars=Array.isArray(analysis?.chartBars)?analysis.chartBars:[];
  const tf=analysis?.triggerTF||analysis?.selectedTF||"M5",mode=analysis?.indicatorMode||"105";
  const current=analysis?.indicator?.latestSignal||{},currentDir=Math.sign(n(current.direction)||0),currentScore=n(current.score);
  const rows=[];
  for(const s of history){
    const out=replayOutcome(s,bars,tf,mode);
    if(!resolved.has(out.outcome)||n(out.priceMove)==null)continue;
    const entry=n(s.entry),sl=n(s.invalidation??s.originalSL),dir=Math.sign(n(s.direction)||0);
    const risk=entry!=null&&sl!=null?Math.abs(entry-sl):null;
    if(!(risk>0)||!dir)continue;
    rows.push({
      direction:dir,score:n(s.score),outcome:out.outcome,
      rMultiple:Number((out.priceMove/risk).toFixed(6)),
      time:n(s.time)
    });
  }
  const directional=currentDir?rows.filter(x=>x.direction===currentDir):rows;
  const scoreMatched=currentScore!=null?directional.filter(x=>x.score!=null&&Math.abs(x.score-currentScore)<=15):[];
  let selected=rows,selection="ALL_AVAILABLE";
  if(scoreMatched.length>=20){selected=scoreMatched;selection="DIRECTION_AND_SCORE_BAND"}
  else if(directional.length>=20){selected=directional;selection="DIRECTION_MATCH"}
  const s=stats(selected);
  return {
    ...s,selection,availableResolved:rows.length,
    minForRiskModel:30,sufficientForRiskModel:selected.length>=30&&s.nonzeroCount>=20,
    rDistribution:selected.map(x=>x.rMultiple),
    provenance:"HISTORICAL_CLOSED_CANDLE_RECONSTRUCTION",
    probabilityUse:"NOT_FORWARD_CALIBRATED",
    warning:"Historical reconstructed outcomes can estimate payoff behavior but are not forward-logged probability calibration."
  };
}
