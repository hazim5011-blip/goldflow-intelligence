import test from "node:test";
import assert from "node:assert/strict";
import * as r2 from "../cloudflare/forward-r2.js";

test("Cloudflare R2 adapter exports listForwardPrivate required by V8/Study",()=>{
  assert.equal(typeof r2.listForwardPrivate,"function");
});

test("Cloudflare R2 listForwardPrivate fails closed without configured R2 env",async()=>{
  const rows=await r2.listForwardPrivate({indicator:"gf-news",symbol:"XAUUSD247",tf:"M15",limit:10});
  assert.deepEqual(rows,[]);
});
