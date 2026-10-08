import test from "node:test";
import assert from "node:assert/strict";
import {recommendedAIPromotionGate} from "../api/_recommendedAIEngine.js";

const metric=(strictWR,netPip,lossPip,den=12)=>({
  strictWR,netPip,lossPip,strictDenominator:den
});

test("Recommended AI promotion gate passes only material OOS P/L improvement",()=>{
  const baseVal=metric(44,-100,-240,12),candVal=metric(55,40,-220,12);
  const baseAll=metric(45,-180,-500,40),candAll=metric(53,60,-480,40);
  const g=recommendedAIPromotionGate(baseVal,candVal,baseAll,candAll);
  assert.equal(g.pass,true);
});

test("Recommended AI rejects candidates that improve by dropping evaluated-signal coverage",()=>{
  const baseVal=metric(40,-100,-240,20),candVal=metric(70,100,-100,15);
  const baseAll=metric(42,-180,-500,50),candAll=metric(65,200,-200,37);
  const g=recommendedAIPromotionGate(baseVal,candVal,baseAll,candAll);
  assert.equal(g.pass,false);
  assert.ok(g.reasons.includes("VALIDATION_COVERAGE_DROPPED_GT_5PCT"));
});

test("Recommended AI rejects candidate when loss magnitude worsens over five percent",()=>{
  const baseVal=metric(45,-50,-200,12),candVal=metric(60,80,-220,12);
  const baseAll=metric(46,-80,-400,40),candAll=metric(55,100,-430,40);
  const g=recommendedAIPromotionGate(baseVal,candVal,baseAll,candAll);
  assert.equal(g.pass,false);
  assert.ok(g.reasons.includes("LOSS_MAGNITUDE_WORSE_GT_5PCT"));
});
