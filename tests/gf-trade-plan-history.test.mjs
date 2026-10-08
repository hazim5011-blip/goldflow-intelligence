import test from 'node:test';
import assert from 'node:assert/strict';
import {extractGFTradePlan,enforceGFTradePlan} from '../api/_gfTradePlan.js';
import {buildGFHistoricalSignals} from '../api/_gfHistoryAdapters.js';

test('GF BUY entry-ready plan requires Entry SL TP1 TP2 TP3 geometry',()=>{
  const out={canEnter:true,status:'AI_BUY_READY',direction:1,entryQuote:100,
    confirmation:{direction:1,entryLow:99,entryHigh:101,invalidation:95,tp1:105,tp2:110,tp3:115,score:80,signalCandleTime:1000}};
  const p=extractGFTradePlan(out,'gf-ai');
  assert.equal(p.valid,true);assert.equal(p.entry,100);assert.equal(p.sl,95);assert.equal(p.tp3,115);
  assert.equal(enforceGFTradePlan(out,'gf-ai').canEnter,true);
});

test('GF SELL entry-ready plan validates inverse risk geometry',()=>{
  const p=extractGFTradePlan({canEnter:true,status:'SELL_ENTRY_READY',direction:-1,entryQuote:100,
    confirmation:{direction:-1,entryLow:99,entryHigh:101,invalidation:105,tp1:95,tp2:90,tp3:85,signalCandleTime:1000}},'gf-study');
  assert.equal(p.valid,true);assert.equal(p.side,'SELL');assert.equal(p.sl,105);
});

test('directional READY is blocked when TP or SL geometry is incomplete',()=>{
  const out=enforceGFTradePlan({canEnter:true,status:'BUY_ENTRY_READY',direction:1,
    confirmation:{direction:1,entryLow:99,entryHigh:101,invalidation:95,tp1:105,tp2:null,tp3:115}},'gf-news');
  assert.equal(out.canEnter,false);assert.equal(out.status,'WAIT_TRADE_PLAN_INCOMPLETE');
  assert.equal(out.tradePlan.valid,false);
});

test('GF-News history refuses retrospective macro/news backfill',()=>{
  const r=buildGFHistoricalSignals({mode:'gf-news',symbol:'XAUUSD247',tf:'M15',frames:{M15:[]},offsetSeconds:10800});
  assert.equal(r.rawHistory.length,0);assert.match(r.historyMode,/FORWARD_ONLY/);
});
