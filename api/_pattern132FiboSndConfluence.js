const ENTRY_ROLES=new Set(["LETTER","LOW_RISK","MEDIUM_RISK","HIGH_RISK","GOLDEN","COUNTER","FULL_MARGIN"]);

const finite=v=>Number.isFinite(Number(v));
const sideDir=z=>Number(z?.currentDirection??z?.direction??0);
const zoneLow=z=>Math.min(Number(z?.low),Number(z?.high));
const zoneHigh=z=>Math.max(Number(z?.low),Number(z?.high));
const isSNDZone=z=>/\bSND\b|\bDEMAND\b|\bSUPPLY\b/i.test(String(z?.sourceEvent||z?.state||""));

function distanceToZone(price,low,high){
  if(price<low)return low-price;
  if(price>high)return price-high;
  return 0;
}
function publicLayer(x,distance=0){
  return {value:Number(x.value),label:String(x.label||""),role:String(x.role||"LETTER"),price:Number(x.price),distance};
}
function decorateZone(zone,autoFibo,tolerance){
  const z={...zone};
  const d=sideDir(z),low=zoneLow(z),high=zoneHigh(z);
  const active=!!autoFibo?.active,levels=Array.isArray(autoFibo?.levels)?autoFibo.levels.filter(x=>finite(x?.price)):[];
  if(!isSNDZone(z)){
    z.fiboSnd={eligible:false,confirmed:false,watch:false,reason:"NOT_SND_ZONE",entryLayers:[]};
    return z;
  }
  if(!active){
    z.fiboSnd={eligible:false,confirmed:false,watch:false,reason:String(autoFibo?.reason||autoFibo?.error||"FIBO_INACTIVE"),entryLayers:[]};
    return z;
  }
  if(d!==Number(autoFibo.direction)){
    z.fiboSnd={eligible:false,confirmed:false,watch:false,reason:"FIBO_DIRECTION_MISMATCH",entryLayers:[]};
    return z;
  }

  const entryCandidates=levels.filter(x=>ENTRY_ROLES.has(String(x.role||"")));
  const inside=entryCandidates.filter(x=>Number(x.price)>=low&&Number(x.price)<=high).map(x=>publicLayer(x,0));
  const nearest=entryCandidates.map(x=>publicLayer(x,distanceToZone(Number(x.price),low,high))).sort((a,b)=>a.distance-b.distance)[0]||null;
  const confirmed=inside.length>0;
  const watch=!confirmed&&nearest&&nearest.distance<=tolerance;
  const meta={
    eligible:true,
    confirmed,
    watch:!!watch,
    reason:confirmed?"SND_FIBO_LEVEL_INSIDE":watch?"SND_FIBO_LEVEL_NEAR":"NO_FIBO_LEVEL_NEAR_SND",
    direction:d,
    entryArea:{low,high},
    entryLayers:inside,
    nearestLayer:nearest,
    tolerance
  };
  z.fiboSnd=meta;
  z.entryConfirmed=confirmed;
  z.entryLayers=inside;
  if(confirmed)z.sourceEvent=String(z.sourceEvent||"SND")+" • FIBO+SND ENTRY";
  else if(watch)z.sourceEvent=String(z.sourceEvent||"SND")+" • FIBO NEAR";
  return z;
}
function priority(z){
  if(z?.fiboSnd?.confirmed)return 0;
  if(z?.fiboSnd?.watch)return 1;
  if(isSNDZone(z))return 2;
  return 3;
}

export function buildPattern132FiboSndConfluence({activeZones,autoFibo,point=0}={}){
  const src=activeZones||{};
  const atr=finite(autoFibo?.atr)?Math.abs(Number(autoFibo.atr)):0;
  const pt=finite(point)?Math.abs(Number(point)):0;
  // 0.20 ATR mirrors Pattern v1.32's existing level-tolerance scale, but is WATCH only.
  // A confirmed entry requires an actual custom Fibo entry level to sit inside the SND box.
  const tolerance=Math.max(pt*5,atr*.20);
  const decorateSide=list=>(Array.isArray(list)?list:[]).map(z=>decorateZone(z,autoFibo,tolerance)).sort((a,b)=>priority(a)-priority(b));
  const buy=decorateSide(src.buy),sell=decorateSide(src.sell),swap=decorateSide(src.swap);
  const all=[...buy,...sell,...swap];
  const confirmedZones=all.filter(z=>z?.fiboSnd?.confirmed);
  const watchZones=all.filter(z=>z?.fiboSnd?.watch);
  return {
    ready:true,
    active:confirmedZones.length>0,
    state:confirmedZones.length?"ENTRY_CONFLUENCE_CONFIRMED":watchZones.length?"ENTRY_CONFLUENCE_WATCH":"WAIT_SND_FIBO_CONFLUENCE",
    direction:autoFibo?.active?Number(autoFibo.direction)||0:0,
    tolerance,
    confirmedCount:confirmedZones.length,
    watchCount:watchZones.length,
    confirmedZones:confirmedZones.map(z=>({direction:sideDir(z),low:zoneLow(z),high:zoneHigh(z),sourceEvent:z.sourceEvent,entryLayers:z.fiboSnd.entryLayers})),
    watchZones:watchZones.map(z=>({direction:sideDir(z),low:zoneLow(z),high:zoneHigh(z),sourceEvent:z.sourceEvent,nearestLayer:z.fiboSnd.nearestLayer})),
    activeZones:{buy,sell,swap}
  };
}
