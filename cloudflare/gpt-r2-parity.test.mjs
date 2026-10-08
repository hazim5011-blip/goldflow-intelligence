import test from "node:test";
import assert from "node:assert/strict";
import {listForwardPrivate} from "./forward-r2.js";

test("R2 forward list fails closed without configured binding",async()=>{
 const out=await listForwardPrivate({indicator:"gf-news",symbol:"XAUUSD247",tf:"M15"});
 assert.deepEqual(out,[]);
});

test("R2 forward list is read only and empty when bucket has no objects",async()=>{
 const actions=[];
 const env={FORWARD_INGEST_SECRET:"s".repeat(40),GF_FORWARD_R2:{
  async list(query){actions.push(["list",query]);return {objects:[],truncated:false,cursor:null}},
  async get(key){actions.push(["get",key]);throw Error("UNEXPECTED_GET")},
  async put(){actions.push(["put"]);throw Error("UNEXPECTED_PUT")}
 }};
 const out=await listForwardPrivate({indicator:"gf-news",limit:20},env);
 assert.deepEqual(out,[]);
 assert.deepEqual(actions.map(x=>x[0]),["list"]);
 assert.equal(actions[0][1].prefix,"goldflow-forward/v1/");
});
