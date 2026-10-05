import {setRuntimeEnv} from "../api/_runtime.js";
import analyzeHandler from "../api/analyze.js";
import barsHandler from "../api/bars.js";
import bridgeHealthHandler from "../api/bridge-health.js";
import healthHandler from "../api/health.js";
import macroHandler from "../api/macro.js";
import optionsHandler from "../api/options.js";
import smartQuantHandler from "../api/smart-quant.js";
import statusHandler from "../api/status.js";
import symbolsHandler from "../api/symbols.js";
import v8Handler from "../api/v8.js";

const direct={
  "/api/analyze":analyzeHandler,
  "/api/bars":barsHandler,
  "/api/bridge-health":bridgeHealthHandler,
  "/api/health":healthHandler,
  "/api/macro":macroHandler,
  "/api/options":optionsHandler,
  "/api/smart-quant":smartQuantHandler,
  "/api/status":statusHandler,
  "/api/symbols":symbolsHandler,
  "/api/v8":v8Handler
};
const v8Aliases={
  "/api/history":"history",
  "/api/performance":"performance",
  "/api/evidence":"evidence",
  "/api/news-context":"news",
  "/api/forward-ingest":"forward-ingest",
  "/api/forward-outcome":"forward-outcome",
  "/api/forward-proof":"forward-proof"
};

function headerObject(headers){
  const out={};for(const [k,v] of headers.entries())out[k.toLowerCase()]=v;return out;
}
async function requestShim(request,extraQuery={}){
  const u=new URL(request.url),query=Object.fromEntries(u.searchParams.entries());
  Object.assign(query,extraQuery);
  let body=null;
  if(!["GET","HEAD","OPTIONS"].includes(request.method)){
    const ct=(request.headers.get("content-type")||"").toLowerCase();
    if(ct.includes("application/json")){
      const txt=await request.text();
      body=txt?JSON.parse(txt):null;
    }else{
      body=await request.text();
    }
  }
  return {method:request.method,query,headers:headerObject(request.headers),body};
}
function responseShim(){
  let code=200,done=null;
  const headers=new Headers();
  const res={
    setHeader(k,v){headers.set(k,String(v));return res},
    status(n){code=Number(n)||200;return res},
    json(value){
      headers.set("Content-Type","application/json; charset=utf-8");
      done=new Response(JSON.stringify(value),{status:code,headers});return done;
    },
    end(value=""){
      done=new Response(value??"",{status:code,headers});return done;
    }
  };
  return {res,get:()=>done||new Response("",{status:code,headers})};
}
function withCors(response){
  const h=new Headers(response.headers);
  h.set("Access-Control-Allow-Origin","*");
  h.set("Access-Control-Allow-Methods","GET, POST, OPTIONS");
  h.set("Access-Control-Allow-Headers","Content-Type, X-GF-Forward-Key");
  h.set("X-Content-Type-Options","nosniff");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
}
async function runHandler(handler,request,extraQuery){
  const req=await requestShim(request,extraQuery);
  const shim=responseShim();
  const returned=await handler(req,shim.res);
  const response=returned instanceof Response?returned:shim.get();
  return withCors(response);
}
async function staticResponse(request,env,noStore=false){
  const r=await env.ASSETS.fetch(request);
  if(!noStore)return r;
  const h=new Headers(r.headers);h.set("Cache-Control","no-store, max-age=0");
  return new Response(r.body,{status:r.status,statusText:r.statusText,headers:h});
}

export default {
  async fetch(request,env){
    setRuntimeEnv(env);
    const u=new URL(request.url),path=u.pathname;

    if(path.startsWith("/api/")&&request.method==="OPTIONS"){
      return new Response(null,{status:204,headers:{
        "Access-Control-Allow-Origin":"*",
        "Access-Control-Allow-Methods":"GET, POST, OPTIONS",
        "Access-Control-Allow-Headers":"Content-Type, X-GF-Forward-Key"
      }});
    }

    try{
      if(direct[path])return await runHandler(direct[path],request,{});
      if(v8Aliases[path])return await runHandler(v8Handler,request,{route:v8Aliases[path]});
      if(path.startsWith("/api/"))return withCors(new Response(JSON.stringify({ok:false,error:"API_ROUTE_NOT_FOUND"}),{
        status:404,headers:{"Content-Type":"application/json; charset=utf-8"}
      }));
      return staticResponse(request,env,path==="/"||path==="/index.html"||path==="/release.json");
    }catch(e){
      console.error("[GoldFlow Cloudflare Worker]",{path,error:String(e?.message||e)});
      if(path.startsWith("/api/"))return withCors(new Response(JSON.stringify({ok:false,error:"WORKER_RUNTIME_ERROR"}),{
        status:500,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}
      }));
      return staticResponse(request,env,false);
    }
  }
};
