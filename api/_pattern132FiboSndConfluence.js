const ENTRY_ROLES=new Set(["LETTER","LOW_RISK","MEDIUM_RISK","HIGH_RISK","GOLDEN","COUNTER","FULL_MARGIN"]);
const TARGET_ROLES=new Set(["MARK","LETTER","LOW_RISK","MEDIUM_RISK","HIGH_RISK","GOLDEN","COUNTER","FULL_MARGIN"]);

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
function orderEntryLayers(items,direction){
  return items.slice().sort((a,b)=>direction>0?b.price-a.price:a.price-b.price).map((x,i)=>({...x,layerIndex:i+1,layerCode:i===0?"ENTRY":"L"+(i+1)}));
}
function protectiveStop(levels,direction,low,high,tolerance){
  const sl=levels.filter(x=>String(x.role||"")==="SL").map(x=>publicLayer(x,0));
  const adverse=sl.filter(x=>direction>0?x.price<low:x.price>high).sort((a,b)=>direction>0?b.price-a.price:a.price-b.price);
  if(adverse.length)return {...adverse[0],source:"AUTO_FIBO_SL"};
  return {price:direction>0?low-tolerance:high+tolerance,label:"SND INVALIDATION",role:"SL",value:null,distance:tolerance,source:"SND_FALLBACK"};
}
function targetReferences(levels,direction,low,high,entryLayers){
  const used=new Set(entryLayers.map(x=>Number(x.price).toFixed(10)));
  const out=levels.filter(x=>TARGET_ROLES.has(String(x.role||""))&&finite(x.price)&&!used.has(Number(x.price).toFixed(10))&&(direction>0?Number(x.price)>high:Number(x.price)<low))
    .map(x=>publicLayer(x,0))
    .sort((a,b)=>direction>0?a.price-b.price:b.price-a.price)
    .slice(0,3)
    .map((x,i)=>({...x,targetIndex:i+1,targetCode:"TP"+(i+1)}));
  return out;
}
function decorateZone(zone,autoFibo,tolerance,currentPrice){
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
  const insideRaw=entryCandidates.filter(x=>Number(x.price)>=low&&Number(x.price)<=high).map(x=>publicLayer(x,0));
  const inside=orderEntryLayers(insideRaw,d);
  const nearest=entryCandidates.map(x=>publicLayer(x,distanceToZone(Number(x.price),low,high))).sort((a,b)=>a.distance-b.distance)[0]||null;
  const confirmed=inside.length>0;
  const watch=!confirmed&&nearest&&nearest.distance<=tolerance;
  const stop=confirmed?protectiveStop(levels,d,low,high,tolerance):null;
  const targets=confirmed?targetReferences(levels,d,low,high,inside):[];
  const priceDistance=finite(currentPrice)?distanceToZone(Number(currentPrice),low,high):null;
  const meta={
    eligible:true,
    confirmed,
    watch:!!watch,
    reason:confirmed?"SND_FIBO_LEVEL_INSIDE":watch?"SND_FIBO_LEVEL_NEAR":"NO_FIBO_LEVEL_NEAR_SND",
    direction:d,
    entryArea:{low,high},
    entryLayers:inside,
    primaryEntry:inside[0]||null,
    layerCount:inside.length,
    protectiveStop:stop,
    targetReferences:targets,
    nearestLayer:nearest,
    tolerance,
    priceDistance
  };
  z.fiboSnd=meta;
  z.entryConfirmed=confirmed;
  z.entryLayers=inside;
  if(confirmed)z.sourceEvent=String(z.sourceEvent||"SND")+" • FIBO+SND ENTRY "+inside.length+"L";
  else if(watch)z.sourceEvent=String(z.sourceEvent||"SND")+" • FIBO NEAR";
  return z;
}
function priority(z){
  if(z?.fiboSnd?.confirmed)return 0;
  if(z?.fiboSnd?.watch)return 1;
  if(isSNDZone(z))return 2;
  return 3;
}
function planFromZone(z){
  const m=z.fiboSnd||{},targets=m.targetReferences||[];
  return {
    direction:sideDir(z),
    sourceEvent:z.sourceEvent,
    entryArea:m.entryArea||{low:zoneLow(z),high:zoneHigh(z)},
    primaryEntry:m.primaryEntry||null,
    layers:m.entryLayers||[],
    layerCount:Number(m.layerCount||0),
    protectiveStop:m.protectiveStop||null,
    targets,
    tp1:targets[0]||null,
    tp2:targets[1]||null,
    tp3:targets[2]||null,
    priceDistance:m.priceDistance
  };
}

export function buildPattern132FiboSndConfluence({activeZones,autoFibo,point=0,price=null}={}){
  const src=activeZones||{};
  const atr=finite(autoFibo?.atr)?Math.abs(Number(autoFibo.atr)):0;
  const pt=finite(point)?Math.abs(Number(point)):0;
  // Existing Pattern v1.32 level tolerance is 0.20 ATR. Here it is WATCH-only.
  // Confirmed ENTRY requires a custom Fibo entry level physically inside same-direction SND.
  const tolerance=Math.max(pt*5,atr*.20);
  const decorateSide=list=>(Array.isArray(list)?list:[]).map(z=>decorateZone(z,autoFibo,tolerance,price)).sort((a,b)=>priority(a)-priority(b));
  const buy=decorateSide(src.buy),sell=decorateSide(src.sell),swap=decorateSide(src.swap);
  const all=[...buy,...sell,...swap];
  const confirmedZones=all.filter(z=>z?.fiboSnd?.confirmed);
  const watchZones=all.filter(z=>z?.fiboSnd?.watch);
  const plans=confirmedZones.map(planFromZone).sort((a,b)=>{
    const ad=finite(a.priceDistance)?Number(a.priceDistance):Infinity,bd=finite(b.priceDistance)?Number(b.priceDistance):Infinity;
    if(ad!==bd)return ad-bd;
    return Number(b.layerCount||0)-Number(a.layerCount||0);
  });
  return {
    ready:true,
    active:confirmedZones.length>0,
    state:confirmedZones.length?"ENTRY_CONFLUENCE_CONFIRMED":watchZones.length?"ENTRY_CONFLUENCE_WATCH":"WAIT_SND_FIBO_CONFLUENCE",
    direction:autoFibo?.active?Number(autoFibo.direction)||0:0,
    tolerance,
    confirmedCount:confirmedZones.length,
    watchCount:watchZones.length,
    bestPlan:plans[0]||null,
    plans,
    confirmedZones:confirmedZones.map(z=>({direction:sideDir(z),low:zoneLow(z),high:zoneHigh(z),sourceEvent:z.sourceEvent,entryLayers:z.fiboSnd.entryLayers,protectiveStop:z.fiboSnd.protectiveStop,targetReferences:z.fiboSnd.targetReferences})),
    watchZones:watchZones.map(z=>({direction:sideDir(z),low:zoneLow(z),high:zoneHigh(z),sourceEvent:z.sourceEvent,nearestLayer:z.fiboSnd.nearestLayer})),
    activeZones:{buy,sell,swap}
  };
}
