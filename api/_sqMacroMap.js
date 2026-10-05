const WEIGHTS={REAL10Y:.22,USDBROAD:.18,US10Y:.11,US2Y:.10,CPI:.09,COREPCE:.08,NETLIQ:.09,FEDUPPER:.07,BREAKEVEN10:.06};
const impactValue=x=>String(x||"MIXED").toUpperCase()==="SUPPORTIVE"?1:String(x||"MIXED").toUpperCase()==="PRESSURE"?-1:0;
export function buildMacroContributionMap(macro){
  if(!macro?.ok)return {ok:false,reason:macro?.error||"MACRO_UNAVAILABLE",rows:[]};
  const rows=(macro.drivers||[]).map(d=>{
    const weight=WEIGHTS[d.id]||.04,raw=impactValue(d.goldImpact),freshness=d.stale?.5:1;
    const contribution=raw*weight*freshness;
    return {
      id:d.id,name:d.name,display:d.display,source:d.source,date:d.date,status:d.status,stale:!!d.stale,
      goldImpact:d.goldImpact||"MIXED",weight:Number(weight.toFixed(3)),freshnessMultiplier:freshness,
      contribution:Number((100*contribution).toFixed(2))
    };
  }).sort((a,b)=>Math.abs(b.contribution)-Math.abs(a.contribution));
  const support=rows.filter(x=>x.contribution>0).reduce((s,x)=>s+x.contribution,0);
  const pressure=Math.abs(rows.filter(x=>x.contribution<0).reduce((s,x)=>s+x.contribution,0));
  const net=support-pressure;
  return {
    ok:true,rows,supportScore:Number(support.toFixed(2)),pressureScore:Number(pressure.toFixed(2)),netScore:Number(net.toFixed(2)),
    bias:net>=8?"SUPPORTIVE":net<=-8?"PRESSURE":"MIXED",
    topSupport:rows.filter(x=>x.contribution>0).slice(0,3),
    topPressure:rows.filter(x=>x.contribution<0).slice(0,3),
    note:"Derived contribution map from GoldFlow macro-driver impacts. It is a context decomposition, not a causal attribution or price forecast."
  };
}
