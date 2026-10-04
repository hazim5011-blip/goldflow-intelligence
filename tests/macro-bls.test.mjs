import test from "node:test";
import assert from "node:assert/strict";
import {parseBlsPayload,parseFredBlsCsv} from "../api/macro.js";
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

const makeFred=(name,n=42)=>"observation_date,"+name+"\n"+
 Array.from({length:n},(_,i)=>{
  const date=new Date(Date.UTC(2023,i,1)).toISOString().slice(0,10);
  return date+","+(name==="UNRATE"?(3+i*.03).toFixed(2):name==="CPIAUCNS"?(300+i*.5).toFixed(3):150000+i*90);
 }).join("\n")+"\n";
test("BLS-origin Fed FRED mirror accepts PAYEMS, UNRATE and CPIAUCNS with 12m YoY history",()=>{
 for(const id of ["PAYEMS","UNRATE","CPIAUCNS"]){
  const d=parseFredBlsCsv(makeFred(id),id);
  assert.equal(d.length,42);assert.equal(d[0].date,"2023-01-01");
  assert.equal(d.at(-1).date,"2026-06-01");
 }
});
test("FRED mirror rejects mismatched series header, incomplete history, or fabricated annual CPI average",()=>{
 assert.throws(()=>parseFredBlsCsv(makeFred("UNRATE"),"CPIAUCNS"),/HEADER_MISMATCH/);
 assert.throws(()=>parseFredBlsCsv(makeFred("PAYEMS",12),"PAYEMS"),/HISTORY_TOO_SHORT/);
 const rows=parseFredBlsCsv(makeFred("CPIAUCNS")+"\n2026-12-31,9999","CPIAUCNS");
 assert.equal(rows.length,42);
});
