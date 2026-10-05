// GoldFlow production runs on Cloudflare and must use the stable Named Tunnel.
// BROKER_BRIDGE_URL is an explicit enable/configuration gate; broker traffic must
// never fall back to a temporary Quick Tunnel.
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

export async function brokerGet(path,params={},timeoutMs=15000,attempts=3){
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
        const detail=data?.detail||data?.error||txt||("HTTP "+r.status);
        const e=new Error(String(detail));
        e.status=r.status;
        throw e;
      }
      return data;
    }catch(e){
      lastErr=e;
      const status=Number(e?.status||0);
      const retryable=!status || status===408 || status===425 || status===429 || status>=500;
      if(!retryable || attempt>=attempts) throw e;
      await sleep(attempt===1?350:attempt===2?900:1600);
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
  const errorCode=errorCodes[0]||String(error?.code||"")||null;
  if(errorCode) console.error("[GoldFlow broker transport]",{error:msg,code:errorCode,subCodes:errorCodes});
  return res.status(status).json({ok:false,bridgeConfigured:bridgeConfigured(),error:msg,errorCode,errorCodes,...extra});
}

export function classifySymbol(name="",path="",description=""){
  const n=String(name).toUpperCase();
  const p=(String(path)+" "+String(description)).toUpperCase();
  if(/CRYPTO|BITCOIN|ETHEREUM|BTC|ETH|SOL|XRP|LTC|BCH|DOGE|ADA|DOT|AVAX|LINK/.test(n+" "+p)) return "CRYPTO";
  if(/XAU|XAG|XPT|XPD|GOLD|SILVER|METAL/.test(n+" "+p)) return "METALS";
  if(/WTI|BRENT|USOIL|UKOIL|XBR|XTI|NATGAS|NGAS|ENERGY|OIL/.test(n+" "+p)) return "ENERGY";
  if(/US30|DJ30|NAS|USTEC|US100|SPX|US500|GER|DE40|DAX|UK100|JP225|HK50|AUS200|INDEX|INDICES/.test(n+" "+p)) return "INDICES";
  const fx=/^(EUR|GBP|USD|JPY|CHF|AUD|NZD|CAD|SGD|HKD|CNH|CNY|NOK|SEK|DKK|ZAR|MXN|TRY)[A-Z]{3}/.test(n);
  if(fx || /FOREX|FX/.test(p)) return "FOREX";
  if(/SHARE|STOCK|EQUITY|NYSE|NASDAQ/.test(p)) return "STOCKS";
  return "OTHER";
}
