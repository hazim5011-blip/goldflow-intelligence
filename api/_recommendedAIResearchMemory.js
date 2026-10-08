const clean=x=>String(x||"").toLowerCase();

export const RECOMMENDED_AI_RESEARCH_STATE=Object.freeze({
  version:1,
  updatedAtUTC:null,
  mode:"WAIT_FIRST_INTERNET_RESEARCH_CYCLE",
  reasoning:{enabled:false,status:"NO_RESEARCH_MEMORY",model:null},
  sources:[],
  macro:[],
  hypotheses:[]
});

export function researchHypothesesFor(indicator,symbol){
  const i=clean(indicator),s=String(symbol||"").toUpperCase();
  return (RECOMMENDED_AI_RESEARCH_STATE.hypotheses||[]).filter(h=>{
    const hi=clean(h?.indicator),hs=String(h?.symbol||"*").toUpperCase();
    return (hi===i||hi==="*"||hi==="all")&&(hs==="*"||hs===s);
  });
}
