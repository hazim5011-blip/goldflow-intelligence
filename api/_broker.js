// GoldFlow Production must use the stable Named Tunnel. The older Vercel env
// may still contain an expired *.trycloudflare.com URL from V7.5.
// Keep the existing env presence gate and BRIDGE_KEY; never route broker traffic
// through a temporary Quick Tunnel again.
const CONFIGURED_BASE=(process.env.BROKER_BRIDGE_URL||"").trim().replace(/\/$/,"");
const PERMANENT_BASE="https://bridge.hazim5011.com";
const BASE=CONFIGURED_BASE?PERMANENT_BASE:"";
export function bridgeBaseUrl(){return BASE;}
// VantageMarkets-Live 3 was observed reporting an MT5 tick/bar clock at UTC+3
// relative to the bridge host in October 2026. Use the SAME explicit offset
// for freshness, history UTC labels and candle age; never infer it per tick.
export function vantageBrokerUtcOffsetSeconds(){
 const raw=process.env.VANTAGE_TICK_UTC_OFFSET_SECONDS;
 const n=raw===undefined||raw===""?10800:Number(raw);
 return Number.isInteger(n)&&Math.abs(n)<=50400?n:null;
}

export function bridgeEndpointMode(){return BASE?"PERMANENT_NAMED_TUNNEL":"UNCONFIGURED";}
const KEY=(process.env.BROKER_BRIDGE_KEY||"").trim();

export function bridgeConfigured(){ return !!BASE; }

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function cleanBridgeError(error,status=0,raw=""){
  const name=String(error?.name||""),code=String(error?.code||""),msg=String(error?.message||error||"");
  if(name==="AbortError"||code==="20"||/aborted|aborterror/i.test(msg)){
    const e=new Error("BRIDGE_TIMEOUT • Vantage bridge/tunnel did not answer before the safety timeout.");
    e.code="BRIDGE_TIMEOUT";e.status=status||504;return e;
  }
  if([520,521,522,523,524].includes(Number(status))||/cloudflare|origin web server|web server returned an invalid|connection timed out/i.test(raw+" "+msg)){
    const e=new Error("BRIDGE_TUNNEL_ORIGIN_UNAVAILABLE • Cloudflare tunnel cannot reach the local MT5 bridge.");
    e.code="BRIDGE_TUNNEL_ORIGIN_UNAVAILABLE";e.status=Number(status)||503;return e;
  }
  return error instanceof Error?error:new Error(msg||"Bridge request failed");
}

export async function brokerGet(path,params={},timeoutMs=15000,attempts=2){
  if(!BASE) throw new Error("BROKER_BRIDGE_URL_NOT_CONFIGURED");
  const u=new URL(BASE+path);
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined && v!==null && v!=="") u.searchParams.set(k,String(v));
  }
  let lastErr;
  for(let attempt=1;attempt<=Math.max(1,attempts);attempt++){
    const c=new AbortController();
    const t=setTimeout(()=>c.abort(),timeoutMs);
    try{
      const h={"Accept":"application/json"};
      if(KEY) h["X-Bridge-Key"]=KEY;
      const r=await fetch(u,{headers:h,signal:c.signal,cache:"no-store"});
      const txt=await r.text();
      let data;
      try{data=JSON.parse(txt)}catch{data={raw:txt}}
      if(!r.ok){
        const detail=data?.detail||data?.error||("HTTP "+r.status);
        const base=new Error(String(detail));base.status=r.status;
        throw cleanBridgeError(base,r.status,txt);
      }
      return data;
    }catch(e){
      const clean=cleanBridgeError(e,Number(e?.status||0),"");
      lastErr=clean;
      const status=Number(clean?.status||0);
      const retryable=!status || status===408 || status===425 || status===429 || status>=500;
      if(!retryable || attempt>=attempts) throw clean;
      await sleep(attempt===1?400:1000);
    }finally{
      clearTimeout(t);
    }
  }
  throw lastErr||new Error("Bridge request failed");
}

export function apiError(res,error,status=200,extra={}){
  const msg=String(error?.message||error||"Unknown error");
  // Undici/Node can wrap DNS, TCP and TLS failures as generic "fetch failed".
  // Surface only machine-readable error codes (never URL, token or bridge key).
  const causes=Array.isArray(error?.cause?.errors)?error.cause.errors:[error?.cause];
  const errorCodes=[...new Set(causes.map(x=>String(x?.code||"").trim()).filter(Boolean))];
  const errorCode=String(error?.code||"")||errorCodes[0]||null;
  const userError=errorCode==="BRIDGE_TIMEOUT"?"BRIDGE TIMEOUT • Local MT5 bridge / Cloudflare tunnel is not responding. No new signal will be issued until broker data returns.":
    errorCode==="BRIDGE_TUNNEL_ORIGIN_UNAVAILABLE"?"BRIDGE TUNNEL OFFLINE • Cloudflare cannot reach the local MT5 bridge. Check the bridge PC and named tunnel. No new signal is issued.":msg;
  if(errorCode) console.error("[GoldFlow broker transport]",{error:msg,code:errorCode,subCodes:errorCodes});
  return res.status(status).json({ok:false,bridgeConfigured:bridgeConfigured(),error:userError,errorCode,errorCodes,...extra});
}

export function classifySymbol(name="",path="",description=""){
  const n=String(name).toUpperCase();
  const p=(String(path)+" "+String(description)).toUpperCase();
  // Classification only: NEVER infer ONLINE/24H from these name patterns.
  // Exact availability requires /catalog tradeMode and a fresh exact-symbol tick.
  if(/^(?:VOL(?:ATILITY)?[._ -]*(?:10|25|50|75|80|100|150|200|250|300|500|1000)(?:[._ -]*(?:1S|S))?|V(?:10|25|50|75|80|100)(?:[._ -]*1S)?|(?:FIXED[._ -]*)?STEP[._ -]*(?:0[.]?[1-5]|1|INDEX)?|BOOM[._ -]*[0-9]*|CRASH[._ -]*[0-9]*|JUMP[._ -]*[0-9]*|RANGE[._ -]*BREAK|DRIFT[._ -]*SWITCH)/i.test(n)||/SYNTHETIC|DERIVED INDICES|STEP INDEX|FIXEDSTEP|FIXED STEP|VOLATILITY INDEX|CONTINUOUS INDEX/.test(p))return "SYNTHETIC";
  if(/CRYPTO|BITCOIN|ETHEREUM|BTC|ETH|SOL|XRP|LTC|BCH|DOGE|ADA|DOT|AVAX|LINK/.test(n+" "+p)) return "CRYPTO";
  if(/XAU|XAG|XPT|XPD|GOLD|SILVER|METAL/.test(n+" "+p)) return "METALS";
  if(/WTI|BRENT|USOIL|UKOIL|XBR|XTI|NATGAS|NGAS|ENERGY|OIL/.test(n+" "+p)) return "ENERGY";
  if(/US30|DJ30|NAS|USTEC|US100|SPX|US500|GER|DE40|DAX|UK100|JP225|HK50|AUS200|INDEX|INDICES/.test(n+" "+p)) return "INDICES";
  const fx=/^(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SGD|HKD|CNH|CNY|NOK|SEK|DKK|ZAR|MXN|TRY)[A-Z]{3}/.test(n);
  if(fx || /FOREX|FX/.test(p)) return "FOREX";
  if(/SHARE|STOCK|EQUITY|NYSE|NASDAQ/.test(p)) return "STOCKS";
  return "OTHER";
}
