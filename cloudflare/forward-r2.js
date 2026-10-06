// Optional Cloudflare R2 adapter for the GoldFlow forward ledger.
// It remains fail-closed until BOTH GF_FORWARD_R2 and FORWARD_INGEST_SECRET are configured.
import {createHash,timingSafeEqual} from "node:crypto";
import {normalizePublishedPayload,normalizeOutcomePayload,forwardPath,outcomePath} from "../api/_v8Ledger.js";

export {normalizePublishedPayload,normalizeOutcomePayload,forwardPath,outcomePath};

const sha256=s=>createHash("sha256").update(s).digest("hex");
const envObj=env=>env&&typeof env==="object"?env:{};
const bucketOf=env=>envObj(env).GF_FORWARD_R2||null;
const secretOf=env=>String(envObj(env).FORWARD_INGEST_SECRET||"");
const readFlag=env=>String(envObj(env).FORWARD_PUBLIC_READ||"").toLowerCase()==="true";

export function forwardConfigured(env){
 return Boolean(bucketOf(env)&&secretOf(env).length>=32);
}
export function publicReadEnabled(env){
 return forwardConfigured(env)&&readFlag(env);
}
export function validateSecret(input,env){
 const expected=secretOf(env);
 if(expected.length<32||typeof input!=="string")return false;
 const a=createHash("sha256").update(input).digest();
 const b=createHash("sha256").update(expected).digest();
 return timingSafeEqual(a,b);
}
function requireBucket(env){
 const bucket=bucketOf(env);
 if(!bucket)throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
 return bucket;
}
function validateLookup(date,id){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^[a-f0-9]{32}$/.test(id))throw Error("INVALID_FORWARD_LOOKUP");
}
async function putImmutable(bucket,key,payload,hashField){
 const raw=JSON.stringify(payload);
 const stored=await bucket.put(key,raw,{
  onlyIf:new Headers({"If-None-Match":"*"}),
  httpMetadata:{contentType:"application/json",cacheControl:"no-store"},
  customMetadata:{schema:String(payload?.schema||"").slice(0,80),integrity:String(payload?.[hashField]||"").slice(0,128)}
 });
 if(!stored)throw Error("IMMUTABLE_OBJECT_ALREADY_EXISTS");
 return {pathname:key,etag:stored.etag||null};
}
async function readPrivateJson(bucket,key,maxBytes=300000){
 const obj=await bucket.get(key);
 if(!obj)return null;
 if(Number.isFinite(Number(obj.size))&&Number(obj.size)>maxBytes)throw Error("ARCHIVE_TOO_LARGE");
 const raw=await obj.text();
 if(raw.length>maxBytes)throw Error("ARCHIVE_TOO_LARGE");
 return JSON.parse(raw);
}
export async function storePublished(record,env){
 if(!forwardConfigured(env))throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
 return putImmutable(requireBucket(env),forwardPath(record),record,"recordHash");
}
export async function storeOutcome(event,env){
 if(!forwardConfigured(env))throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
 return putImmutable(requireBucket(env),outcomePath(event),event,"eventHash");
}
export async function readForwardPrivate(date,id,env){
 validateLookup(date,id);
 const parsed=await readPrivateJson(requireBucket(env),"goldflow-forward/v1/"+date+"/"+id+"/published.json");
 if(!parsed)return null;
 if(parsed.recordMode!=="FORWARD_LOGGED"||parsed.signalId!==id||parsed.receivedAtUTC?.slice(0,10)!==date)throw Error("ARCHIVE_INTEGRITY_ERROR");
 const {recordHash,...body}=parsed;
 if(!recordHash||sha256(JSON.stringify({...body,recordHash:undefined}))!==recordHash)throw Error("RECORD_HASH_MISMATCH");
 return parsed;
}
export async function readForward(date,id,env){
 if(!publicReadEnabled(env))throw Error("FORWARD_PUBLIC_READ_NOT_ENABLED");
 return readForwardPrivate(date,id,env);
}
export async function readForwardOutcomePrivate(date,id,env){
 validateLookup(date,id);
 const event=await readPrivateJson(requireBucket(env),"goldflow-forward/v1/"+date+"/"+id+"/outcome.json");
 if(!event)return null;
 if(event.recordMode!=="FORWARD_LOGGED"||event.signalId!==id||event.date!==date)throw Error("OUTCOME_ARCHIVE_INTEGRITY_ERROR");
 const {eventHash,...body}=event;
 if(!eventHash||sha256(JSON.stringify({...body,eventHash:undefined}))!==eventHash)throw Error("OUTCOME_HASH_MISMATCH");
 return event;
}
export async function readForwardOutcome(date,id,env){
 if(!publicReadEnabled(env))throw Error("FORWARD_PUBLIC_READ_NOT_ENABLED");
 return readForwardOutcomePrivate(date,id,env);
}
