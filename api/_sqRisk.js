function finite(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function clamp(x,a,b){return Math.max(a,Math.min(b,x))}
export function buildRiskReference(edgeHistory,opts={}){
  const hardCapPct=finite(opts.hardCapPct)?clamp(Number(opts.hardCapPct),.05,2):.50;
  const fraction=finite(opts.kellyFraction)?clamp(Number(opts.kellyFraction),.05,.5):.25;
  const minSample=30;
  const base={
    status:"INSUFFICIENT_SAMPLE",hardRiskCapPct:hardCapPct,kellyFraction:fraction,
    suggestedRiskPct:null,fullKellyPct:null,fractionalKellyPct:null,
    probabilityBasis:"HISTORICAL_RECONSTRUCTION_ONLY",minSample,
    warning:"Risk sizing is a research reference, not an instruction. Forward calibration is required before production sizing."
  };
  if(!edgeHistory?.sufficientForRiskModel||edgeHistory.sampleCount<minSample)return base;
  const p=Number(edgeHistory.winRateWilson95?.low);
  const avgWin=Number(edgeHistory.avgWinR),avgLoss=Number(edgeHistory.avgLossRAbs);
  if(!(p>0&&p<1&&avgWin>0&&avgLoss>0))return {...base,status:"INVALID_PAYOFF_INPUT"};
  const b=avgWin/avgLoss,q=1-p;
  const k=(p*b-q)/b;
  const full=Math.max(0,k),frac=full*fraction,suggested=Math.min(hardCapPct/100,frac);
  return {
    ...base,status:full>0?"AVAILABLE_CONSERVATIVE":"NO_POSITIVE_KELLY_EDGE",
    conservativeWinRate:p,payoffRatio:b,
    fullKellyPct:Number((100*full).toFixed(3)),
    fractionalKellyPct:Number((100*frac).toFixed(3)),
    suggestedRiskPct:Number((100*Math.max(0,suggested)).toFixed(3)),
    capped:suggested>=hardCapPct/100,
    method:"Wilson-95 lower win rate + average reconstructed R payoff; fractional Kelly capped by hard risk limit."
  };
}
