import history from "./_v8HistoryApi.js";
import performance from "./_v8PerformanceApi.js";
import evidence from "./_v8EvidenceApi.js";
import news from "./_v8NewsApi.js";
import forwardIngest from "./_v8ForwardIngestApi.js";
import forwardOutcome from "./_v8ForwardOutcomeApi.js";
import forwardProof from "./_v8ForwardProofApi.js";

const ROUTES={history,performance,evidence,news,"forward-ingest":forwardIngest,"forward-outcome":forwardOutcome,"forward-proof":forwardProof};

export default async function handler(req,res){
  const route=String(req.query?.route||"");
  const fn=ROUTES[route];
  if(!fn)return res.status(404).json({ok:false,error:"UNKNOWN_V8_ROUTE"});
  const q={...(req.query||{})};delete q.route;req.query=q;
  return fn(req,res);
}
