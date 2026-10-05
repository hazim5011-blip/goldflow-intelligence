const POSITIVE=new Set(["TP1","TP2","TP3","TRAILING","BE_POSITIVE"]);
const NEGATIVE=new Set(["SL"]);
function valid(x){const o=String(x?.outcome||"").toUpperCase();return POSITIVE.has(o)||NEGATIVE.has(o)}
function win(x){return POSITIVE.has(String(x?.outcome||"").toUpperCase())?1:0}
function rate(rows){return rows.length?rows.reduce((s,x)=>s+win(x),0)/rows.length:null}
export function buildLearningMonitor(samples=[],calibration={}){
  const rows=(samples||[]).filter(valid).slice().sort((a,b)=>String(a.timestampKey||"").localeCompare(String(b.timestampKey||"")));
  const count=rows.length,need=50,progress=Math.min(100,Math.round(100*count/need));
  const recent=rows.slice(-30),prior=rows.slice(-60,-30),recentRate=rate(recent),priorRate=rate(prior);
  const drift=recent.length>=20&&prior.length>=20?recentRate-priorRate:null;
  const driftWarning=drift!=null&&Math.abs(drift)>=.20;
  const status=calibration?.status||"UNVERIFIED";
  let stage="COLLECTING_FORWARD_DATA";
  if(status==="CALIBRATED_FORWARD")stage=driftWarning?"CALIBRATED_WITH_DRIFT_WARNING":"CALIBRATED_MONITORING";
  else if(count>=50)stage="VALIDATING_FORWARD_CALIBRATION";
  else if(count>=25)stage="MID_COLLECTION";
  const promotionEligible=status==="CALIBRATED_FORWARD"&&count>=100&&
    Number(calibration?.holdout?.brierSkill)>=.02&&Number(calibration?.holdout?.ece)<=.12&&!driftWarning;
  return {
    stage,sampleCount:count,minCalibrationSample:need,collectionProgressPct:progress,
    recentWindow:{count:recent.length,winRate:recentRate},
    priorWindow:{count:prior.length,winRate:priorRate},
    driftPctPoints:drift==null?null:Number((100*drift).toFixed(1)),driftWarning,
    calibrationStatus:status,promotionEligible,
    promotionPolicy:"Manual review only. GoldFlow never auto-promotes a model solely because recent performance improved.",
    nextStep:count<50?"Collect more immutable forward outcomes."
      :status!=="CALIBRATED_FORWARD"?"Improve or revalidate forward calibration; do not publish probability yet."
      :driftWarning?"Investigate regime/data drift before any model change."
      :promotionEligible?"Candidate is eligible for manual shadow-model review; production model remains unchanged."
      :"Continue forward monitoring until sample size and reliability thresholds strengthen."
  };
}
