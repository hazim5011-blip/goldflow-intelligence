import {bridgeConfigured,brokerGet,apiError,bridgeBaseUrl,bridgeEndpointMode} from "./_broker.js";
import {lookup} from "node:dns/promises";

const ALLOWED_DIAG_HOST="bridge.hazim5011.com";
async function safeDnsDiagnostic(){
  const host=bridgeBaseUrl();
  let hostname="";
  try{hostname=new URL(host).hostname.toLowerCase()}catch{return{status:"BRIDGE_URL_INVALID"}}
  if(hostname!==ALLOWED_DIAG_HOST)return{status:"UNEXPECTED_BRIDGE_HOST",host:hostname};
  const out={host:hostname};
  try{
    const ips=await lookup(hostname,{all:true,verbatim:true});
    out.nodeResolver={ok:true,addressCount:ips.length};
  }catch(e){out.nodeResolver={ok:false,code:String(e?.code||"UNKNOWN")}}
  const sources=[
    ["cloudflare","https://cloudflare-dns.com/dns-query?name="+hostname+"&type=A"],
    ["google","https://dns.google/resolve?name="+hostname+"&type=A"]
  ];
  for(const [name,url] of sources){
    const c=new AbortController(),timer=setTimeout(()=>c.abort(),4500);
    try{
      const r=await fetch(url,{headers:{Accept:"application/dns-json"},signal:c.signal,cache:"no-store"});
      const d=await r.json();
      out[name]={http:r.status,rcode:d.Status,answers:(d.Answer||[]).filter(a=>a.type===1).map(a=>String(a.data||"")).filter(a=>/^\\d+\\.\\d+\\.\\d+\\.\\d+$/.test(a))};
    }catch(e){out[name]={error:String(e?.cause?.code||e?.code||e?.name||"FETCH_FAILED")}}
    finally{clearTimeout(timer)}
  }
  return out;
}

export default async function handler(req,res){
  if(req.method==="OPTIONS") return res.status(204).end();
  res.setHeader("Cache-Control","no-store");
  if(!bridgeConfigured()) return res.status(200).json({ok:true,configured:false,online:false,status:"BRIDGE OFF"});
  const diagnostic=String(req.query?.dns||"")==="1";
  try{
    const h=await brokerGet("/health",{},15000);
    return res.status(200).json({ok:true,configured:true,online:!!h?.connected,status:h?.connected?"MT5 LIVE":"BRIDGE DATA",bridgeRoute:bridgeEndpointMode(),...h,...(diagnostic?{dns:await safeDnsDiagnostic()}:{})});
  }catch(e){
    const extra={configured:true,online:false,status:"BRIDGE ERROR",bridgeRoute:bridgeEndpointMode()};
    if(diagnostic)extra.dns=await safeDnsDiagnostic();
    return apiError(res,e,200,extra);
  }
}
