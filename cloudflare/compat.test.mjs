import test from "node:test";
import assert from "node:assert/strict";
import {toRequest,populateBody,responseAdapter,runLegacy} from "./compat.js";
test("preserves route query and header casing expected by Vercel-style req",()=>{
 const q=new Request("https://test.pages.dev/api/study?symbol=XAUUSD247&tf=M15&mode=ai",{headers:{"X-GF-Forward-Key":"sensitive"}});
 const out=toRequest(q);
 assert.equal(out.query.symbol,"XAUUSD247");assert.equal(out.query.tf,"M15");assert.equal(out.headers["x-gf-forward-key"],"sensitive");
});
test("handles no-body 204, JSON, and legacy res.status().end()",async()=>{
 const r=responseAdapter();r.status(204).end();assert.equal(r.response().status,204);
 const s=responseAdapter();s.status(201).json({ok:true});
 assert.equal(s.response().status,201);assert.equal((await s.response().json()).ok,true);
});
test("maps application/json payload and rejects invalid JSON before handler",async()=>{
 const req=new Request("https://test.pages.dev/api/forward-ingest",{method:"POST",headers:{"Content-Type":"application/json"},body:'{"test":1}'});
 const parsed=toRequest(req);await populateBody(parsed,req);assert.equal(parsed.body.test,1);
 const bad=new Request("https://test.pages.dev/api/study",{method:"POST",headers:{"Content-Type":"application/json"},body:'{oops'});
 const response=await runLegacy(()=>{throw Error("SHOULD_NOT_REACH_HANDLER")},bad);
 assert.equal(response.status,400);assert.equal((await response.json()).error,"INVALID_JSON");
});
test("GET/OPTIONS routing and errors fail closed without exposing exception detail",async()=>{
 const fn=(req,res)=>res.status(200).json({ok:true,method:req.method});
 const get=await runLegacy(fn,new Request("https://test.pages.dev/api/health"));
 assert.deepEqual(await get.json(),{ok:true,method:"GET"});
 const opt=await runLegacy(fn,new Request("https://test.pages.dev/api/health",{method:"OPTIONS"}));
 assert.equal(opt.status,204);
 const crash=await runLegacy(()=>{throw Error("SECRET=do-not-emit")},new Request("https://test.pages.dev/api/health"));
 assert.equal(crash.status,500);assert.deepEqual(await crash.json(),{ok:false,error:"INTERNAL_API_ERROR"});
});
