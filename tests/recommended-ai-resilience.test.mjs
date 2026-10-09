import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=path=>readFile(new URL("../"+path,import.meta.url),"utf8");

test("browser APIs retry transient Cloudflare failures and Recommended AI exposes staleness",async()=>{
  const app=await read("app.js"),v8=await read("v8.js");
  assert.match(app,/\[502,503,504\]/);
  assert.match(app,/age>90/);
  assert.match(app,/300000/);
  assert.match(app,/archive STALE/);
  assert.match(v8,/\[502,503,504\]/);
  assert.match(v8,/P\/L WINRATE/);
});

test("critical Cloudflare UI assets are revalidated instead of requiring hard refresh",async()=>{
  const worker=await read("cloudflare/worker.js");
  assert.match(worker,/no-cache, max-age=0, must-revalidate/);
  assert.match(worker,/p\.endsWith\("\.js"\)/);
  assert.match(worker,/p\.startsWith\("\/recommended-ai\/"\)/);
});

test("Recommended AI captures GF-News macro and world-news context every hourly cycle",async()=>{
  const cycle=await read("scripts/recommended-ai-cycle.mjs");
  assert.match(cycle,/const batch=\[\.\.\.groups\[batchIndex\],"gf-news"\]/);
  assert.match(cycle,/\/api\/news-context/);
  assert.match(cycle,/\/api\/news-live/);
  assert.match(cycle,/newsMacroSnapshot/);
});

test("Recommended AI watchdog recovers stale hourly archives",async()=>{
  const wf=await read(".github/workflows/goldflow-recommended-ai-watchdog.yml");
  assert.match(wf,/cron: "47 \* \* \* \*"/);
  assert.match(wf,/age>=75/);
  assert.match(wf,/goldflow-recommended-ai-24h/);
});
