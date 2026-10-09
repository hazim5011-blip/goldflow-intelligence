// Pages advanced-mode API gateway. Credentials are exclusively Cloudflare encrypted bindings.
import {runLegacy} from "./compat.js";
import health from "./health.js";
import bridgeHealth from "./bridge-health.js";
import symbols from "../api/symbols.js";
import bars from "../api/bars.js";
import analyze from "../api/analyze.js";
import macro from "../api/macro.js";
import status from "../api/status.js";
import options from "../api/options.js";
import v8 from "../api/v8.js";
import history from "../api/_v8HistoryApi.js";
import performance from "../api/_v8PerformanceApi.js";
import evidence from "../api/_v8EvidenceApi.js";
import newsContext from "../api/_v8NewsApi.js";
import forwardIngest from "../api/_v8ForwardIngestApi.js";
import forwardOutcome from "../api/_v8ForwardOutcomeApi.js";
import forwardProof from "../api/_v8ForwardProofApi.js";
import study from "../api/study.js";
import marketOnline from "../api/market-online.js";
import liveNews from "../api/news-live.js";
import recommendedAI from "../api/recommended-ai.js";
import recommendedAIResearch from "../api/recommended-ai-research.js";
const ROUTES={"/api/health":health,"/api/bridge-health":bridgeHealth,"/api/symbols":symbols,
 "/api/bars":bars,"/api/analyze":analyze,"/api/macro":macro,"/api/status":status,
 "/api/options":options,"/api/v8":v8,"/api/history":history,"/api/performance":performance,"/api/evidence":evidence,
 "/api/news-context":newsContext,"/api/forward-ingest":forwardIngest,"/api/forward-outcome":forwardOutcome,"/api/forward-proof":forwardProof,
 "/api/study":study,"/api/market-online":marketOnline,"/api/news-live":liveNews,
 "/api/recommended-ai":recommendedAI,"/api/recommended-ai-research":recommendedAIResearch};
export default {
 async fetch(request,env){
  const u=new URL(request.url),p=u.pathname.replace(/\/$/,"")||"/";
  if(!p.startsWith("/api/"))return env.ASSETS.fetch(request);
  const fn=ROUTES[p];
  if(!fn)return new Response(JSON.stringify({ok:false,error:"UNKNOWN_API_ROUTE"}),
   {status:404,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  return runLegacy(fn,request,env);
 }
};
