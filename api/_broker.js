const BASE=(process.env.BROKER_BRIDGE_URL||"").trim().replace(/\/$/,"");
const KEY=(process.env.BROKER_BRIDGE_KEY||"").trim();

export function bridgeConfigured(){ return !!BASE; }

export async function brokerGet(path,params={},timeoutMs=9000){
  if(!BASE) throw new Error("BROKER_BRIDGE_URL_NOT_CONFIGURED");
  const u=new URL(BASE+path);
  for(const [k,v] of Object.entries(params)){
    if(v!==undefined && v!==null && v!=="") u.searchParams.set(k,String(v));
  }
  const c=new AbortController();
  const t=setTimeout(()=>c.abort(),timeoutMs);
  try{
    const h={};
    if(KEY) h["X-Bridge-Key"]=KEY;
    const r=await fetch(u,{headers:h,signal:c.signal,cache:"no-store"});
    const txt=await r.text();
    let data;
    try{data=JSON.parse(txt)}catch{data={raw:txt}}
    if(!r.ok){
      const detail=data?.detail||data?.error||txt||("HTTP "+r.status);
      throw new Error(String(detail));
    }
    return data;
  } finally {
    clearTimeout(t);
  }
}

export function apiError(res,error,status=200,extra={}){
  const msg=String(error?.message||error||"Unknown error");
  return res.status(status).json({ok:false,bridgeConfigured:bridgeConfigured(),error:msg,...extra});
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
