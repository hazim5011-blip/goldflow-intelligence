import test from 'node:test';
import assert from 'node:assert/strict';
import {runPattern132AutoFibo,PATTERN132_FIBO_LEVELS} from '../api/_pattern132AutoFibo.js';

function baseBars(n=90){
  const a=[];for(let i=0;i<n;i++)a.push({t:1700000000+i*300,o:100,c:100.1,h:101,l:99,v:100});return a;
}
function buyBars(){
  const a=baseBars();
  a[40]={...a[40],o:96,c:97,h:101,l:90};
  a[60]={...a[60],o:103,c:104,h:110,l:99};
  return a;
}
function sellBars(){
  const a=baseBars();
  a[40]={...a[40],o:104,c:103,h:110,l:99};
  a[60]={...a[60],o:97,c:96,h:101,l:90};
  return a;
}

test('Pattern132 Auto Fibo preserves all 21 MQ5 levels and exact source labels',()=>{
  assert.equal(PATTERN132_FIBO_LEVELS.length,21);
  assert.deepEqual(PATTERN132_FIBO_LEVELS.map(x=>x.value),[0,.125,.25,.375,.5,.625,.75,.875,1,-.25,-.375,-.5,1.25,1.375,1.5,-.7,1.7,1.925,-.925,2.125,-1.125]);
  assert.equal(PATTERN132_FIBO_LEVELS[10].label,'-0.375 GONDEN ZONE');
  assert.equal(PATTERN132_FIBO_LEVELS[19].label,'2.125 SL');
});

test('Pattern132 Auto Fibo finds confirmed BUY impulse with older low as MARK 0 and newer high as MARK 1',()=>{
  const r=runPattern132AutoFibo({bars:buyBars()});
  assert.equal(r.ready,true);assert.equal(r.active,true);assert.equal(r.direction,1);
  assert.equal(r.mark0.price,90);assert.equal(r.mark1.price,110);assert.ok(r.mark0.time<r.mark1.time);
  assert.equal(r.levels.find(x=>x.value===.5).price,100);
  assert.equal(r.levels.find(x=>x.value===2.125).price,132.5);
  assert.equal(r.levels.find(x=>x.value===-1.125).price,67.5);
});

test('Pattern132 Auto Fibo finds confirmed SELL impulse with older high as MARK 0 and newer low as MARK 1',()=>{
  const r=runPattern132AutoFibo({bars:sellBars()});
  assert.equal(r.ready,true);assert.equal(r.active,true);assert.equal(r.direction,-1);
  assert.equal(r.mark0.price,110);assert.equal(r.mark1.price,90);assert.ok(r.mark0.time<r.mark1.time);
  assert.equal(r.levels.find(x=>x.value===.5).price,100);
  assert.equal(r.levels.find(x=>x.value===2.125).price,67.5);
  assert.equal(r.levels.find(x=>x.value===-1.125).price,132.5);
});

test('forming candle cannot change confirmed Auto Fibo result',()=>{
  const a=buyBars(),r1=runPattern132AutoFibo({bars:a});
  a[a.length-1]={...a.at(-1),o:1,c:999,h:1000,l:1};
  const r2=runPattern132AutoFibo({bars:a});
  assert.deepEqual(r2,r1);
});

test('last closed candle through MARK 0 removes the impulse',()=>{
  const a=buyBars();a[a.length-2]={...a.at(-2),o:92,c:89,h:93,l:88};
  const r=runPattern132AutoFibo({bars:a});
  assert.equal(r.ready,true);assert.equal(r.active,false);assert.equal(r.reason,'MARK0_INVALIDATED');
});
