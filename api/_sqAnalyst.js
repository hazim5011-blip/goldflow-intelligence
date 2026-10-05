const n=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const pct=v=>n(v)!=null?Math.round(Number(v)*100)+"%":"N/A";
export function buildSmartAnalyst({decision,regime,mtfMatrix,directionalEdge,calibration,tradePlan,risk,monteCarlo,newsRisk,dataHealth}={}){
  const side=decision?.side||"WAIT",state=decision?.decision||"WAIT";
  const headline=state==="RESEARCH_READY"
    ?side+" RESEARCH_READY — semua gate utama yang disahkan telah lulus."
    :state==="WATCH"
      ?side+" WATCH — setup ada tetapi belum cukup kuat untuk status RESEARCH_READY."
      :"WAIT — jangan kejar entry sehingga gate penting kembali selaras.";

  const support=[];
  if(regime?.name&&regime.name!=="UNKNOWN")support.push("Regime: "+regime.name+" ("+(regime.confidence??0)+"/100 state confidence).");
  if(directionalEdge?.bias)support.push("Directional Edge: "+directionalEdge.bias+" "+(directionalEdge.directionalEdgeIndex??0)+" dengan coverage "+(directionalEdge.coverage??0)+"%.");
  if(mtfMatrix?.readyCount)support.push("MTF: "+mtfMatrix.netBias+" "+(mtfMatrix.netScore??0)+"; aligned "+(mtfMatrix.alignment?.aligned??0)+", opposed "+(mtfMatrix.alignment?.opposed??0)+".");
  if(calibration?.status==="CALIBRATED_FORWARD")support.push("Forward probability: "+pct(calibration.calibratedProbability)+" daripada "+(calibration.sampleCount??0)+" completed forward samples.");

  const blockers=(decision?.gates||[]).filter(g=>g.status!=="PASS"&&g.status!=="NA").map(g=>g.label+": "+g.reason).slice(0,8);
  const warnings=[];
  if(dataHealth?.status&&dataHealth.status!=="GOOD")warnings.push("Data health "+dataHealth.status+" "+(dataHealth.score??"N/A")+"/100.");
  if(newsRisk?.status==="EVENT_SOON")warnings.push("High-impact event semakin hampir.");
  if(newsRisk?.status==="PARTIAL_UNVERIFIED")warnings.push("Coverage jadual berita rasmi belum lengkap.");
  if(tradePlan?.noChase)warnings.push("No-chase aktif: harga sudah terlalu jauh daripada entry.");
  if(tradePlan?.invalidated)warnings.push("Plan telah invalidated oleh harga broker.");

  const riskText=n(risk?.suggestedRiskPct)!=null
    ?"Risk reference "+Number(risk.suggestedRiskPct).toFixed(3)+"% (capped fractional Kelly, bukan arahan lot)."
    :"Risk reference belum tersedia kerana sample payoff belum cukup atau edge konservatif tidak positif.";
  const mcText=monteCarlo?.status==="AVAILABLE_RECONSTRUCTION_BOOTSTRAP"
    ?"Monte Carlo: P(DD≥10%) "+Number(monteCarlo.probabilities?.dd10??0).toFixed(2)+"%, median max DD "+Number(monteCarlo.maxDrawdownPct?.p50??0).toFixed(2)+"%."
    :"Monte Carlo belum mempunyai sample reconstructed R yang mencukupi.";

  return {
    kind:"RULE_BASED_STRUCTURED_ANALYST_NOT_LLM",
    headline,support,blockers,warnings,
    action:tradePlan?.action||"Tunggu setup broker-native yang sah.",
    planStatus:tradePlan?.status||"WAIT",
    riskSummary:riskText,
    monteCarloSummary:mcText,
    nextHighImpact:newsRisk?.nextHighImpact||null,
    note:"Analyst ini hanya merumuskan data berstruktur yang dipaparkan oleh Smart Quant; ia tidak boleh menukar output numeric engine atau mencipta fakta baru."
  };
}
