const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
function rr(direction,entry,sl,tp){
  if(!direction||entry==null||sl==null||tp==null)return null;
  const risk=Math.abs(entry-sl),reward=direction*(tp-entry);
  return risk>0&&reward>0?reward/risk:null;
}
function inZone(price,z){return price!=null&&z&&n(z.low)!=null&&n(z.high)!=null&&price>=Math.min(Number(z.low),Number(z.high))&&price<=Math.max(Number(z.low),Number(z.high))}
export function buildResearchTradePlan({analysis,features,decision,risk,newsRisk}={}){
  const s=analysis?.indicator?.latestSignal||{},direction=Math.sign(n(s.direction)||0),entry=n(s.entry),sl=n(s.invalidation),tp1=n(s.tp1),tp2=n(s.tp2),tp3=n(s.tp3);
  const price=n(analysis?.price),atr=n(features?.atr14);
  const base={direction,side:direction>0?"BUY":direction<0?"SELL":"WAIT",entry,sl,tp1,tp2,tp3,price,
    riskDistance:entry!=null&&sl!=null?Math.abs(entry-sl):null,
    rr:{tp1:rr(direction,entry,sl,tp1),tp2:rr(direction,entry,sl,tp2),tp3:rr(direction,entry,sl,tp3)},
    suggestedRiskPct:n(risk?.suggestedRiskPct),decision:decision?.decision||"WAIT",status:"WAIT_NO_SIGNAL",
    distanceToEntry:entry!=null&&price!=null?Math.abs(price-entry):null,
    distanceToEntryAtr:entry!=null&&price!=null&&atr>0?Math.abs(price-entry)/atr:null,
    activeZone:null,noChase:false,invalidated:false,newsBlocked:newsRisk?.block===true,
    action:"Wait for a valid directional setup."};

  if(!direction)return base;
  if(entry==null||sl==null||direction*(entry-sl)<=0)return {...base,status:"INVALID_PLAN",action:"Trade plan geometry is invalid; do not use it."};
  const invalidated=price!=null&&(direction>0?price<=sl:price>=sl);
  if(invalidated)return {...base,status:"INVALIDATED",invalidated:true,action:"Current broker price has crossed the model invalidation level."};
  if(newsRisk?.block)return {...base,status:"BLOCK_NEWS",newsBlocked:true,action:"High-impact official event is inside the hard-block window."};

  const zones=direction>0?(analysis?.indicator?.activeZones?.buy||[]):analysis?.indicator?.activeZones?.sell||[];
  const zone=zones.find(z=>inZone(price,z))||zones.find(z=>entry!=null&&inZone(entry,z))||null;
  const favorableMove=price!=null&&entry!=null?direction*(price-entry):null;
  const noChase=atr>0&&favorableMove!=null&&favorableMove>.75*atr;
  if(noChase)return {...base,status:"WAIT_NO_CHASE",activeZone:zone,noChase:true,action:"Price has moved more than 0.75 ATR beyond entry; wait for a new setup or pullback."};

  const near=base.distanceToEntryAtr!=null&&base.distanceToEntryAtr<=.35;
  if(decision?.decision==="RESEARCH_READY"&&near)return {...base,status:"READY_NEAR_ENTRY",activeZone:zone,action:"All research gates passed and broker price is near model entry. Manual decision only; no order is sent."};
  if(zone&&inZone(price,zone))return {...base,status:"IN_ZONE_WATCH",activeZone:zone,action:"Broker price is inside the directional zone, but one or more Smart Quant gates are not fully ready."};
  if(near)return {...base,status:"NEAR_ENTRY_WATCH",activeZone:zone,action:"Price is near the model entry; wait for remaining gates to clear."};
  return {...base,status:"WAIT_PULLBACK",activeZone:zone,action:"Directional setup exists, but price is not near the preferred entry."};
}
