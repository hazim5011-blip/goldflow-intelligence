
/* Classification describes a release CATEGORY's usual potential, not the observed
   magnitude or direction of any particular market move. */
const IMPACT = Object.freeze({
  CPI:"HIGH",COREPCE:"HIGH",PAYEMS:"HIGH",UNRATE:"HIGH",FEDUPPER:"HIGH",
  GDP:"HIGH",IP:"MEDIUM",WALCL:"MEDIUM",TGA:"LOW",ONRRP:"LOW",
  BREAKEVEN10:"CONTEXT",US2Y:"CONTEXT",US10Y:"CONTEXT",REAL10Y:"CONTEXT",USDBROAD:"CONTEXT"
});
export function impactForType(id){
  const impact=IMPACT[String(id||"").toUpperCase()]||"LOW";
  return {impact,impactBasis:"TYPICAL_CATEGORY_POTENTIAL",realizedImpactMeasured:false};
}
export function classifyReleaseEvent(event){
  const i=impactForType(event?.type||event?.id);
  return {...i,newsTimingVerified:Boolean(event?.verifiedReleaseTimestamp&&event?.releasedAtUTC)};
}
