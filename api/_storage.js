import {runtimeBinding} from "./_runtime.js";

function bucket(){return runtimeBinding("GOLDFLOW_STORE")||null}
export function storageAvailable(){return !!bucket()}

export async function storagePutImmutable(pathname,text){
  const b=bucket();if(!b)throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
  const obj=await b.put(pathname,String(text),{
    onlyIf:{etagDoesNotMatch:"*"},
    httpMetadata:{contentType:"application/json",cacheControl:"no-store"}
  });
  if(!obj){
    const e=new Error("IMMUTABLE_OBJECT_ALREADY_EXISTS");e.status=409;throw e;
  }
  return {pathname,etag:obj.etag||null,size:obj.size||null};
}
export async function storageGetJson(pathname,maxBytes=300000){
  const b=bucket();if(!b)throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
  const obj=await b.get(pathname);
  if(!obj||!("body" in obj))return null;
  if(Number(obj.size||0)>maxBytes)throw Error("ARCHIVE_TOO_LARGE");
  const text=await obj.text();
  if(text.length>maxBytes)throw Error("ARCHIVE_TOO_LARGE");
  return JSON.parse(text);
}
export async function storageList(prefix,{cursor,limit=500}={}){
  const b=bucket();if(!b)throw Error("FORWARD_STORAGE_NOT_CONFIGURED");
  const r=await b.list({prefix,cursor,limit:Math.max(1,Math.min(1000,Number(limit)||500))});
  return {
    objects:(r.objects||[]).map(x=>({pathname:x.key,size:x.size,etag:x.etag,uploaded:x.uploaded})),
    cursor:r.cursor||null,
    hasMore:!!r.truncated
  };
}
