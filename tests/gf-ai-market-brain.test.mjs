import test from "node:test";
import assert from "node:assert/strict";
import {readMarketBrain,buildMarketPlan} from "../api/_aiMarketBrain.js";

function wave(n=90,slope=-.22,amp=1.35){
 const out=[];
 for(let i=0;i<n;i++){
  const mid=4300+slope*i+amp*Math.sin(i*Math.PI/3);
  out.push({t:1700000000+i*900,o:mid-.08,c:mid+.08,h:mid+.38,l:mid-.38,v:100+i});
 }
 return out;
}
function forceBreak(list,d){
 const prior=list.slice(0,-1),b=readMarketBrain(prior,prior.at(-1).c);
 assert.ok(b.ok);
 const level=d===1?b.structure.lastHigh?.price:b.structure.lastLow?.price;
 assert.ok(Number.isFinite(level),JSON.stringify(b.structure));
 const prev=list.at(-2);
 list[list.length-1]=d===1?
  {t:list.at(-1).t,o:level-.30,c:level+.80,h:level+1.05,l:Math.min(prev.l,level-.42),v:999}:
  {t:list.at(-1).t,o:level+.30,c:level-.80,h:Math.max(prev.h,level+.42),l:level-1.05,v:999};
 return level;
}

test("Market Brain detects bullish CHOCH after a bearish HH/HL/LH/LL sequence flips",()=>{
 const bars=wave(90,-.22,1.35),before=readMarketBrain(bars.slice(0,-1),bars.at(-2).c);
 assert.equal(before.structure.bias,-1,JSON.stringify(before.structure));
 const level=forceBreak(bars,1),brain=readMarketBrain(bars,level+.1);
 assert.equal(brain.breakEvent?.direction,1,JSON.stringify(brain.breakEvent));
 assert.equal(brain.breakEvent?.type,"CHOCH");
 assert.ok(brain.buy.evidence.some(x=>/CHOCH/.test(x.text)));
 const plan=buildMarketPlan(bars,brain,1,level);
 assert.ok(plan,JSON.stringify({brain,level}));
 assert.equal(plan.entryMethod,"CHOCH_STRUCTURE_RETEST");
 assert.equal(plan.fibConfluence?.bonus===4||plan.fibConfluence?.bonus===0,true);
});

test("Market Brain detects bullish BOS in an already bullish structure and selects RBS retest",()=>{
 const bars=wave(90,.22,1.35),before=readMarketBrain(bars.slice(0,-1),bars.at(-2).c);
 assert.equal(before.structure.bias,1,JSON.stringify(before.structure));
 const level=forceBreak(bars,1),brain=readMarketBrain(bars,level+.1);
 assert.equal(brain.breakEvent?.direction,1);
 assert.equal(brain.breakEvent?.type,"BOS");
 assert.equal(brain.zones.flip?.type,"RBS");
 const plan=buildMarketPlan(bars,brain,1,level);
 assert.ok(plan);
 assert.equal(plan.entryMethod,"RBS_STRUCTURE_RETEST");
 assert.ok(!/FIB/.test(plan.entryMethod));
});

test("Market Brain detects sell-side liquidity sweep and treats it as bullish evidence",()=>{
 const bars=wave(90,0,1.05),i=bars.length-1,prior=bars.slice(i-24,i),lo=Math.min(...prior.map(x=>x.l));
 bars[i]={t:bars[i].t,o:lo+.15,c:lo+.35,h:lo+.52,l:lo-.65,v:999};
 const brain=readMarketBrain(bars,bars[i].c);
 assert.equal(brain.liquidity.sweep?.type,"SELL_SIDE_LIQUIDITY_SWEEP",JSON.stringify(brain.liquidity));
 assert.equal(brain.liquidity.sweep?.direction,1);
 assert.ok(brain.buy.evidence.some(x=>/LIQUIDITY_SWEEP/.test(x.text)));
});

test("Market Brain publishes SND/SNR, FVG/OB and chart-pattern fields without requiring any of them to exist",()=>{
 const brain=readMarketBrain(wave(90,.08,1.6),4305);
 assert.ok(brain.ok);
 assert.ok(Object.hasOwn(brain.zones,"demand"));
 assert.ok(Object.hasOwn(brain.zones,"supply"));
 assert.ok(Object.hasOwn(brain.zones,"fvg"));
 assert.ok(Object.hasOwn(brain.zones,"orderBlock"));
 assert.ok(Object.hasOwn(brain,"chartPattern"));
 assert.ok(Object.hasOwn(brain,"candlePattern"));
 assert.ok(Object.hasOwn(brain,"regime"));
});
