import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("Cloudflare routes V8 browser endpoints directly without alias rewrites",async()=>{
  const src=await readFile(new URL("./worker.js",import.meta.url),"utf8");
  for(const route of ["/api/history","/api/performance","/api/evidence","/api/news-context","/api/forward-ingest","/api/forward-outcome","/api/forward-proof"]){
    assert.ok(src.includes('"'+route+'":'),"missing direct Cloudflare route "+route);
  }
  assert.ok(!src.includes("const ALIASES="),"legacy alias rewrite must stay removed");
  assert.ok(!src.includes('u.pathname="/api/v8"'),"Cloudflare must not rewrite History through /api/v8");
});
