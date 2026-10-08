import test from "node:test";
import assert from "node:assert/strict";
await import("../ai-lifecycle.js");
const life=globalThis.GFAILifecycle;

function ready(overrides={}){
 const d={
  mode:"ai",symbol:"XAUUSD247",tf:"M5",status:"AI_BUY_READY",canEnter:true,
  bid:4118,ask:4118.2,quoteAgeSeconds:1,entryQuote:4118.2,updatedAtUTC:"2026-10-08T12:00:00Z",
  confirmation:{direction:1,entryLow:4117.5,entryHigh:4118.5,invalidation:4108,tp1:4128,tp2:4138,tp3:4148,signalCandleTime:1,confirmationCloseUTC:"2026-10-08T11:59:00Z",tradeIdeaId:"GF-AAA"},
  professionalPlaybook:{tradeIdea:{id:"GF-AAA",anchorTf:"M30",quality:{grade:"A+",score:86,eligible:true}}},
  reasoning:{primaryScenario:"BUY"},analysis:{trigger:{direction:1}}
 };
 return {...d,...overrides};
}
test("GF-AI lifecycle only creates observed candidate from verified A-grade ENTRY READY",()=>{
 const a=life.candidate(ready(),null);
 assert.ok(a);
 assert.equal(a.id,"GF-AAA");
 assert.equal(a.side,"BUY");
 assert.equal(a.entryPrice,4118.2);
 assert.equal(a.invalidation,4108);
 assert.ok(a.risk>0);
 assert.equal(a.recoveryFrom,null);
});
test("GF-AI lifecycle protects after +0.5R and cuts at structural invalidation",()=>{
 const a=life.candidate(ready(),null),r=a.risk;
 let d=ready({bid:a.entryPrice+.6*r,ask:a.entryPrice+.6*r+.1,canEnter:false,status:"AI_BUY_CONFIRMED"});
 const p=life.evaluate(a,d);
 assert.equal(p.state,"PROTECT");
 assert.match(p.action,/PROTECT/);
 d=ready({bid:a.invalidation-.1,ask:a.invalidation,canEnter:false,status:"AI_BUY_WATCH"});
 const cut=life.evaluate(a,d);
 assert.equal(cut.state,"CUT_LOSS");
 assert.equal(cut.terminal,true);
 assert.match(cut.action,/CUT/);
});
test("GF-AI lifecycle can cut an old thesis when a new opposite A-grade structural idea confirms",()=>{
 const a=life.candidate(ready(),null);
 const d=ready({
  status:"AI_SELL_READY",canEnter:true,bid:4117,ask:4117.2,
  confirmation:{direction:-1,entryLow:4116.5,entryHigh:4117.5,invalidation:4125,tp1:4107,tp2:4098,tp3:4088,signalCandleTime:2,confirmationCloseUTC:"2026-10-08T12:04:00Z",tradeIdeaId:"GF-BBB"},
  professionalPlaybook:{tradeIdea:{id:"GF-BBB",anchorTf:"M30",quality:{grade:"A",score:78,eligible:true}}},
  reasoning:{primaryScenario:"SELL"},analysis:{trigger:{direction:-1}}
 });
 const x=life.evaluate(a,d);
 assert.equal(x.state,"CUT_LOSS");
 assert.match(x.action,/THESIS FLIPPED/);
});
test("Recovery Brain requires a NEW A-grade idea and never martingales",()=>{
 const loss={...life.candidate(ready(),null),terminalState:"CUT_LOSS",terminalReason:"test"};
 const same=life.recovery(loss,ready({canEnter:false,status:"AI_BUY_WATCH"}));
 assert.equal(same.state,"WAIT_RECOVERY");
 const watch=ready({
  canEnter:false,status:"AI_SELL_WATCH",
  professionalPlaybook:{tradeIdea:{id:"GF-NEW",anchorTf:"M30",quality:{grade:"A+",score:85,eligible:true}}},
  reasoning:{primaryScenario:"SELL"},analysis:{trigger:{direction:-1}}
 });
 assert.equal(life.recovery(loss,watch).state,"RECOVERY_WATCH");
 const r=life.recovery(loss,{...watch,canEnter:true,status:"AI_SELL_READY",
  confirmation:{direction:-1,entryLow:4116,entryHigh:4117,invalidation:4125,tp1:4106,tp2:4098,tp3:4090}});
 assert.equal(r.state,"RECOVERY_READY");
 assert.match(r.reason,/NORMAL risk only/i);
 assert.match(r.reason,/never martingale/i);
});
