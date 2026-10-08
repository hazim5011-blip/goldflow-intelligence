import test from "node:test";
import assert from "node:assert/strict";
import {aggregate} from "../api/_v8Core.js";

const row=(outcome,signedPips,grossPLUSD=null)=>({
  outcome,
  priceMove:signedPips>0?1:-1,
  signedPips,
  signedPoints:signedPips*10,
  grossPLUSD,
  rMultiple:signedPips>0?1:-1,
  symbolResolved:"XAUUSD247"
});

test("Strict WR is PIP-weighted when complete USD is unavailable",()=>{
  const st=aggregate([row("TP1",912.1),row("SL",-2306.5)]);
  assert.equal(st.strictBasis,"PIP");
  assert.ok(Math.abs(st.strictWinRate-(912.1/(912.1+2306.5)*100))<1e-9);
  assert.equal(st.signalWinRate,50);
});

test("Strict WR uses complete Gross USD before PIP",()=>{
  const st=aggregate([row("TP1",100,80),row("SL",-100,-120)]);
  assert.equal(st.strictBasis,"USD_GROSS");
  assert.equal(st.strictWinRate,40);
  assert.equal(st.signalWinRate,50);
});

test("Incomplete USD coverage falls back to complete PIP coverage",()=>{
  const st=aggregate([row("TP1",70,50),row("SL",-30,null)]);
  assert.equal(st.strictBasis,"PIP");
  assert.equal(st.strictWinRate,70);
});

test("Count win rate remains separate from P/L-weighted Strict WR",()=>{
  const rows=[
    row("TP1",10),row("TP1",10),row("TP1",10),row("TP1",10),
    row("SL",-100)
  ];
  const st=aggregate(rows);
  assert.equal(st.signalWinRate,80);
  assert.ok(Math.abs(st.strictWinRate-(40/140*100))<1e-9);
  assert.ok(st.strictWinRate<50);
});


test("BE_ZERO is excluded from Strict WR magnitude and coverage",()=>{
  const st=aggregate([row("TP1",259.88),row("SL",-210),{...row("BE_ZERO",0),priceMove:0,rMultiple:0}]);
  assert.equal(st.strictBasis,"PIP");
  assert.ok(Math.abs(st.strictWinRate-(259.88/(259.88+210)*100))<1e-9);
  assert.equal(st.signalWinRate,50);
  assert.equal(st.beZero,1);
});
