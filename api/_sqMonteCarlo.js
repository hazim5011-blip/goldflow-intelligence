function finite(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}
function quantile(a,p){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),i=(s.length-1)*p,l=Math.floor(i),h=Math.ceil(i);return l===h?s[l]:s[l]+(s[h]-s[l])*(i-l)}
function seedFrom(s){let h=2166136261>>>0;for(const ch of String(s)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let x=seed||1;return()=>{x=(Math.imul(1664525,x)+1013904223)>>>0;return x/4294967296}}
export function runMonteCarlo(edgeHistory,riskRef,opts={}){
  const dist=(edgeHistory?.rDistribution||[]).filter(finite).map(Number);
  if(dist.length<20)return {status:"INSUFFICIENT_SAMPLE",sampleCount:dist.length,minSample:20};
  const paths=Math.max(500,Math.min(5000,Number(opts.paths)||2000)),trades=Math.max(25,Math.min(300,Number(opts.trades)||100));
  const suggested=Number(riskRef?.suggestedRiskPct),riskPct=suggested>0?suggested:.25;
  const riskBasis=suggested>0?"CONSERVATIVE_KELLY_REFERENCE":"STRESS_REFERENCE_0_25_PCT_NOT_RECOMMENDATION";
  const random=rng(seedFrom((opts.seedKey||"GOLDFLOW")+"|"+dist.length+"|"+dist.reduce((s,x)=>s+x,0).toFixed(6)));
  const end=[],maxDD=[],streak5=[];let dd5=0,dd10=0,dd20=0,ruin50=0;
  for(let p=0;p<paths;p++){
    let eq=1,peak=1,mdd=0,lossStreak=0,maxStreak=0;
    for(let t=0;t<trades;t++){
      const r=dist[Math.floor(random()*dist.length)],ret=(riskPct/100)*r;
      eq=Math.max(0,eq*(1+ret));peak=Math.max(peak,eq);
      const dd=peak>0?1-eq/peak:1;mdd=Math.max(mdd,dd);
      if(r<0){lossStreak++;maxStreak=Math.max(maxStreak,lossStreak)}else lossStreak=0;
    }
    const er=100*(eq-1);end.push(er);maxDD.push(100*mdd);streak5.push(maxStreak>=5?1:0);
    if(mdd>=.05)dd5++;if(mdd>=.10)dd10++;if(mdd>=.20)dd20++;if(mdd>=.50)ruin50++;
  }
  const prob=x=>Number((100*x/paths).toFixed(2));
  return {
    status:"AVAILABLE_RECONSTRUCTION_BOOTSTRAP",paths,trades,riskPctUsed:riskPct,riskBasis,
    endingReturnPct:{p05:Number(quantile(end,.05).toFixed(2)),median:Number(quantile(end,.5).toFixed(2)),p95:Number(quantile(end,.95).toFixed(2))},
    maxDrawdownPct:{p50:Number(quantile(maxDD,.5).toFixed(2)),p95:Number(quantile(maxDD,.95).toFixed(2))},
    probabilities:{dd5:prob(dd5),dd10:prob(dd10),dd20:prob(dd20),ruin50:prob(ruin50),lossStreak5:prob(streak5.reduce((s,x)=>s+x,0))},
    warning:"Bootstrap uses reconstructed historical R outcomes, assumes stationarity and excludes future regime changes, slippage tails and model decay."
  };
}
