import test from "node:test";
import assert from "node:assert/strict";
import {parseBlsPayload} from "../api/macro.js";
const ID=["CES0000000001","LNS14000000","CUUR0000SA0"];
const example=(id,n=26)=>({
 seriesID:id,data:Array.from({length:n},(_,i)=>({year:String(2026-Math.floor(i/12)),period:"M"+String(12-i%12).padStart(2,"0"),value:String(100+i)}))
});
test("BLS primary parser accepts all three complete official monthly series",()=>{
 const d=parseBlsPayload({status:"REQUEST_SUCCEEDED",Results:{series:ID.map(x=>example(x))}});
 assert.deepEqual(Object.keys(d).sort(),[...ID].sort());
 for(const k of ID){assert.equal(d[k].length,26);assert.match(d[k].at(-1).date,/^\d{4}-\d{2}-01$/);}
});
test("BLS API denied / throttled is never interpreted as 16/16 success",()=>{
 for(const status of ["REQUEST_NOT_PROCESSED","REQUEST_FAILED",null]){
  assert.throws(()=>parseBlsPayload({status,Results:{series:ID.map(x=>example(x))}}),/BLS_STATUS/);
 }
});
test("BLS response with a missing primary series cannot masquerade as complete",()=>{
 const d=parseBlsPayload({status:"REQUEST_SUCCEEDED",Results:{series:[example(ID[0]),example(ID[1],5)]}});
 assert.equal(Object.keys(d).length,1);assert.equal(d[ID[1]],undefined);assert.equal(d[ID[2]],undefined);
});
test("Only monthly M01..M12 records are accepted; M13 annual average never contaminates CPI",()=>{
 const x=example(ID[2]);x.data.push({year:"2026",period:"M13",value:"9999"});
 const d=parseBlsPayload({status:"REQUEST_SUCCEEDED",Results:{series:[x]}},[ID[2]]);
 assert.equal(d[ID[2]].length,26);assert.ok(d[ID[2]].every(v=>v.value<1000));
});
