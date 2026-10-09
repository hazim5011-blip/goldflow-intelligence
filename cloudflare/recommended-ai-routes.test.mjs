import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Cloudflare worker routes Recommended AI endpoints",async()=>{
  const src=await readFile(new URL("./worker.js",import.meta.url),"utf8");
  assert.match(src,/\/api\/recommended-ai"/);
  assert.match(src,/\/api\/recommended-ai-research"/);
  assert.match(src,/import recommendedAI from/);
  assert.match(src,/import recommendedAIResearch from/);
});

test("Cloudflare build copies persistent Recommended AI archive",async()=>{
  const src=await readFile(new URL("./build.mjs",import.meta.url),"utf8");
  assert.match(src,/"recommended-ai"/);
});
