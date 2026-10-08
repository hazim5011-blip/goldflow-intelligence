// Pages advanced-mode API gateway. Credentials are exclusively Cloudflare encrypted bindings.
import {runLegacy} from "./compat.js";
import {handleGptResearch} from "./gpt-research.js";
import health from "./health.js";
import bridgeHealth from "./bridge-health.js";
import symbols from "../api/symbols.js";
import bars from "../api/bars.js";
import analyze from "../api/analyze.js";
import macro from "../api/macro.js";
import status from "../api/status.js";
import options from "../api/options.js";
import v8 from "../api/v8.js";
import study from "../api/study.js";
import marketOnline from "../api/market-online.js";
import liveNews from "../api/news-live.js";
const ROUTES={"/api/health":health,"/api/bridge-health":bridgeHealth,"/api/symbols":symbols,
 "/api/bars":bars,"/api/analyze":analyze,"/api/macro":macro,"/api/status":status,
 "/api/options":options,"/api/v8":v8,"/api/study":study,"/api/market-online":marketOnline,
 "/api/news-live":liveNews};
const ALIASES={"/api/history":"history","/api/performance":"performance","/api/evidence":"evidence",
 "/api/news-context":"news","/api/forward-ingest":"forward-ingest","/api/forward-outcome":"forward-outcome",
 "/api/forward-proof":"forward-proof"};
export default {
 async fetch(request,env){
  const u=new URL(request.url),p=u.pathname.replace(/\/$/,"")||"/";
  if(!p.startsWith("/api/"))return env.ASSETS.fetch(request);
  if(p==="/api/gpt-research")return handleGptResearch(request,env);
  let fn=ROUTES[p];
  if(!fn&&ALIASES[p]){u.pathname="/api/v8";u.searchParams.set("route",ALIASES[p]);
   fn=v8;request=new Request(u.toString(),request);}
  if(!fn)return new Response(JSON.stringify({ok:false,error:"UNKNOWN_API_ROUTE"}),
   {status:404,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
  return runLegacy(fn,request,env);
 }
};
