const POSITIVE=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE"]);
const NEGATIVE=new Set(["SL"]);
const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const sigmoid=z=>z>=0?1/(1+Math.exp(-Math.min(40,z))):Math.exp(Math.max(-40,z))/(1+Math.exp(Math.max(-40,z)));
const logit=p=>Math.log(clamp(p,1e-5,1-1e-5)/(1-clamp(p,1e-5,1-1e-5)));

function normalize(samples=[]){
  return samples.map(x=>{
    const score=n(x?.score),outcome=String(x?.outcome||"").toUpperCase(),direction=Math.sign(n(x?.direction)||0);
    const y=POSITIVE.has(outcome)?1:NEGATIVE.has(outcome)?0:null;
    return score!=null&&score>=0&&score<=100&&y!=null&&direction?{
      score,direction,y,outcome,timestampKey:String(x.timestampKey||""),signalId:String(x.signalId||"")
    }:null;
  }).filter(Boolean).sort((a,b)=>a.timestampKey.localeCompare(b.timestampKey)||a.signalId.localeCompare(b.signalId));
}
function solve2(a,b,c,g0,g1){
  const det=a*c-b*b;if(Math.abs(det)<1e-12)return null;
  return [(g0*c-g1*b)/det,(g1*a-g0*b)/det];
}
function fitLogistic(rows,lambda=.35){
  const prev=rows.reduce((s,x)=>s+x.y,0)/Math.max(1,rows.length);
  let b0=logit(prev),b1=0;
  for(let iter=0;iter<60;iter++){
    let a=0,b=0,c=lambda,g0=0,g1=-lambda*b1;
    for(const r of rows){
      const x=(r.score-50)/20,p=sigmoid(b0+b1*x),w=Math.max(1e-6,p*(1-p)),e=r.y-p;
      a+=w;b+=w*x;c+=w*x*x;g0+=e;g1+=e*x;
    }
    const d=solve2(a,b,c,g0,g1);if(!d)break;
    b0+=d[0];b1+=d[1];
    if(Math.max(Math.abs(d[0]),Math.abs(d[1]))<1e-7)break;
  }
  return {intercept:b0,slope:b1,predict:score=>clamp(sigmoid(b0+b1*((score-50)/20)),.02,.98)};
}
function metrics(rows,model,baselineP){
  if(!rows.length)return {count:0,brier:null,baselineBrier:null,brierSkill:null,ece:null,bins:[]};
  let brier=0,base=0;
  const bins=Array.from({length:5},(_,i)=>({low:i*.2,high:(i+1)*.2,count:0,sumP:0,wins:0}));
  for(const r of rows){
    const p=model.predict(r.score),e=p-r.y;brier+=e*e;
    const be=baselineP-r.y;base+=be*be;
    const idx=Math.min(4,Math.floor(p*5)),bin=bins[idx];bin.count++;bin.sumP+=p;bin.wins+=r.y;
  }
  brier/=rows.length;base/=rows.length;
  let ece=0;
  const out=bins.filter(x=>x.count).map(x=>{
    const avgP=x.sumP/x.count,actual=x.wins/x.count;
    ece+=(x.count/rows.length)*Math.abs(avgP-actual);
    return {low:x.low,high:x.high,count:x.count,predicted:Number(avgP.toFixed(4)),actual:Number(actual.toFixed(4))};
  });
  return {count:rows.length,brier:Number(brier.toFixed(6)),baselineBrier:Number(base.toFixed(6)),
    brierSkill:base>0?Number((1-brier/base).toFixed(4)):null,ece:Number(ece.toFixed(4)),bins:out};
}
function base(status,samples,selection){
  return {
    status,calibratedProbability:null,provenance:"FORWARD_LOGGED_ONLY",
    sampleCount:samples.length,selection,
    minSample:50,minWins:10,minLosses:10,
    train:null,holdout:null,reliabilityBins:[],
    note:"Probability is published only after forward-only chronological holdout validation. Historical reconstructed results are never used for calibration."
  };
}
export function buildForwardCalibration(samples=[],current={}){
  const all=normalize(samples),direction=Math.sign(n(current.direction)||0),score=n(current.score);
  if(score==null||score<0||score>100)return {...base("NO_CURRENT_SCORE",all,"ALL"),reason:"Current model score is unavailable."};
  if(!direction)return {...base("NO_CURRENT_DIRECTION",all,"ALL"),reason:"No current BUY/SELL direction exists, so a directional success probability is not published."};

  const same=all.filter(x=>x.direction===direction);
  const selected=same.length>=50?same:all;
  const selection=same.length>=50?"SAME_DIRECTION":"ALL_DIRECTIONS";
  const outBase=base("INSUFFICIENT_FORWARD_SAMPLE",selected,selection);
  const wins=selected.reduce((s,x)=>s+x.y,0),losses=selected.length-wins;
  if(selected.length<50||wins<10||losses<10)return {...outBase,wins,losses,reason:"Need at least 50 completed forward samples with at least 10 wins and 10 losses."};

  const cut=Math.max(35,Math.min(selected.length-15,Math.floor(selected.length*.70)));
  const train=selected.slice(0,cut),hold=selected.slice(cut);
  const trainWins=train.reduce((s,x)=>s+x.y,0),trainLosses=train.length-trainWins;
  const holdWins=hold.reduce((s,x)=>s+x.y,0),holdLosses=hold.length-holdWins;
  if(trainWins<7||trainLosses<7||holdWins<3||holdLosses<3){
    return {...outBase,status:"INSUFFICIENT_CLASS_BALANCE",wins,losses,
      train:{count:train.length,wins:trainWins,losses:trainLosses},
      holdout:{count:hold.length,wins:holdWins,losses:holdLosses},
      reason:"Chronological train/holdout split does not contain enough wins and losses."};
  }

  const trainPrev=trainWins/train.length,model=fitLogistic(train),holdMetrics=metrics(hold,model,trainPrev);
  const slopeOkay=model.slope>.05;
  const skillOkay=holdMetrics.brierSkill!=null&&holdMetrics.brierSkill>=.01;
  const eceOkay=holdMetrics.ece!=null&&holdMetrics.ece<=.18;
  const accepted=slopeOkay&&skillOkay&&eceOkay;
  const common={
    ...outBase,wins,losses,
    train:{count:train.length,wins:trainWins,losses:trainLosses,prevalence:Number(trainPrev.toFixed(4)),intercept:Number(model.intercept.toFixed(5)),slope:Number(model.slope.toFixed(5))},
    holdout:{count:hold.length,wins:holdWins,losses:holdLosses,brier:holdMetrics.brier,baselineBrier:holdMetrics.baselineBrier,brierSkill:holdMetrics.brierSkill,ece:holdMetrics.ece},
    reliabilityBins:holdMetrics.bins,
    validationRules:{positiveSlope:slopeOkay,brierSkillAtLeast1Pct:skillOkay,eceAtMost18Pct:eceOkay}
  };
  if(!accepted)return {...common,status:"WEAK_FORWARD_CALIBRATION",reason:"Forward holdout reliability gate failed; probability remains unpublished."};

  // Validation passed. Refit on the complete selected forward set before producing current probability.
  const finalModel=fitLogistic(selected),p=finalModel.predict(score);
  return {...common,status:"CALIBRATED_FORWARD",calibratedProbability:Number(p.toFixed(4)),
    currentScore:score,finalModel:{intercept:Number(finalModel.intercept.toFixed(5)),slope:Number(finalModel.slope.toFixed(5))},
    reason:"Forward-only chronological holdout validation passed; probability is model calibration, not a guarantee."};
}
