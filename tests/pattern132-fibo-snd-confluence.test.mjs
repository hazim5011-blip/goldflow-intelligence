import test from 'node:test';
import assert from 'node:assert/strict';
import {PATTERN132_FIBO_DEFAULTS} from '../api/_pattern132AutoFibo.js';
import {buildPattern132FiboSndConfluence} from '../api/_pattern132FiboSndConfluence.js';

function fib(direction,atr,levels){
  return {ready:true,active:true,direction,atr,levels};
}
function snd(direction,low,high,label){
  return {direction,currentDirection:direction,low,high,state:'SND',sourceEvent:'SND '+label,baseScore:60};
}

test('Auto Fibo source defaults use swing depth 3, lookback 180 and 1.50 ATR',()=>{
  assert.deepEqual(PATTERN132_FIBO_DEFAULTS,{swingDepth:3,lookback:180,minSwingATR:1.50,atrPeriod:14});
});

test('same-direction SND is confirmed only when an entry-capable Fibo level is inside the SND box',()=>{
  const r=buildPattern132FiboSndConfluence({
    activeZones:{buy:[snd(1,99,101,'DEMAND')],sell:[],swap:[]},
    autoFibo:fib(1,2,[
      {value:0,label:'0 MARK 0',role:'MARK',price:99.5},
      {value:.5,label:'0.5 MEDIUM RISK',role:'MEDIUM_RISK',price:100},
      {value:2.125,label:'2.125 SL',role:'SL',price:100.5}
    ]),
    point:.01
  });
  assert.equal(r.active,true);assert.equal(r.confirmedCount,1);
  const z=r.activeZones.buy[0];
  assert.equal(z.fiboSnd.confirmed,true);
  assert.deepEqual(z.entryLayers.map(x=>x.label),['0.5 MEDIUM RISK']);
});

test('opposite-direction SND never becomes a Fibo entry',()=>{
  const r=buildPattern132FiboSndConfluence({
    activeZones:{buy:[],sell:[snd(-1,99,101,'SUPPLY')],swap:[]},
    autoFibo:fib(1,2,[{value:.5,label:'0.5 MEDIUM RISK',role:'MEDIUM_RISK',price:100}]),
    point:.01
  });
  assert.equal(r.confirmedCount,0);
  assert.equal(r.activeZones.sell[0].fiboSnd.reason,'FIBO_DIRECTION_MISMATCH');
});

test('nearby Fibo is WATCH only and cannot become confirmed entry',()=>{
  const r=buildPattern132FiboSndConfluence({
    activeZones:{buy:[snd(1,100.25,100.5,'DEMAND')],sell:[],swap:[]},
    autoFibo:fib(1,1,[{value:.5,label:'0.5 MEDIUM RISK',role:'MEDIUM_RISK',price:100.1}]),
    point:.01
  });
  assert.equal(r.confirmedCount,0);assert.equal(r.watchCount,1);
  assert.equal(r.activeZones.buy[0].fiboSnd.watch,true);
});

test('confluence math is scale-independent for forex-like and crypto-like prices',()=>{
  const fx=buildPattern132FiboSndConfluence({
    activeZones:{buy:[snd(1,1.0998,1.1002,'DEMAND')],sell:[],swap:[]},
    autoFibo:fib(1,.001,[{value:.5,label:'0.5 MEDIUM RISK',role:'MEDIUM_RISK',price:1.1}]),
    point:.00001
  });
  const crypto=buildPattern132FiboSndConfluence({
    activeZones:{buy:[snd(1,65000,65100,'DEMAND')],sell:[],swap:[]},
    autoFibo:fib(1,100,[{value:.5,label:'0.5 MEDIUM RISK',role:'MEDIUM_RISK',price:65050}]),
    point:.01
  });
  assert.equal(fx.confirmedCount,1);assert.equal(crypto.confirmedCount,1);
});
