import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {reasonDailyUnderperformance} from "../api/_internetResearchScout.js";

const read=p=>readFile(new URL("../"+p,import.meta.url),"utf8");

test("Active Signals is a separate all-indicator live scanner",async()=>{
  const [html,app]=await Promise.all([read("index.html"),read("app.js")]);
  assert.match(html,/data-page="activeSignalsPage"/);
  assert.match(html,/id="activeSignalsPage"/);
  assert.match(html,/Signal terminal seperti TP \/ SL \/ BE \/ TRAILING/);
  assert.match(app,/ACTIVE_SIGNAL_MODES=\["105","103","pvt","pvtchart101","pattern132","snd107","owl101","fund104","gf-ai","gf-news","gf-study"\]/);
  assert.match(app,/activeMapLimit\(ACTIVE_SIGNAL_MODES,2/);
  assert.match(app,/activeSignalsPage[^\n]+loadActiveSignals\(true\)/);
  assert.match(app,/activeSignalsPage[^\n]+60000/);
  assert.match(app,/TP\|TP1\|TP2\|TP3\|SL\|TR\|TRAILING\|BE/);
  assert.match(app,/Buka Indicator & Confirm/);
});

test("OpenAI daily review is P/L-first and persists separately from hourly learning",async()=>{
  const [html,script,wf,worker]=await Promise.all([
    read("index.html"),read("scripts/recommended-ai-daily-review-cycle.mjs"),
    read(".github/workflows/goldflow-recommended-ai-daily-review.yml"),read("cloudflare/worker.js")
  ]);
  assert.match(html,/OpenAI Daily Review/);
  assert.match(html,/P\/L Winrate &lt; 50% atau NET PIP negatif/);
  assert.match(script,/period:"day"/);
  assert.match(script,/metrics\.strictWinRate<50/);
  assert.match(script,/metrics\.netPip<0/);
  assert.match(script,/\/api\/news-context/);
  assert.match(script,/\/api\/news-live/);
  assert.match(script,/\/api\/recommended-ai-daily-review/);
  assert.match(wf,/cron: "50 15 \* \* \*"/);
  assert.match(wf,/recommended-ai\/daily/);
  assert.match(worker,/"\/api\/recommended-ai-daily-review":recommendedAIDailyReview/);
});

test("Daily OpenAI reviewer refuses protected-engine auto editing and no-flags is deterministic",async()=>{
  const src=await read("api/_internetResearchScout.js");
  assert.match(src,/Never recommend editing protected\/native signal-engine logic automatically/);
  assert.match(src,/Allowed numeric management patch keys/);
  const out=await reasonDailyUnderperformance({items:[],reviewDateMYT:"2026-10-09"});
  assert.equal(out.status,"NO_UNDERPERFORMERS");
  assert.deepEqual(out.reviews,[]);
});
