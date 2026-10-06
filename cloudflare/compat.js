/** Vercel-style req/res adapter for Cloudflare Pages advanced mode. */
export function toRequest(request){
 const u=new URL(request.url);
 return {method:request.method.toUpperCase(),query:Object.fromEntries(u.searchParams.entries()),
  headers:Object.fromEntries([...request.headers].map(([k,v])=>[k.toLowerCase(),v])),body:undefined,url:u.pathname+u.search};
}
export async function populateBody(req,request){
 if(!["POST","PUT","PATCH"].includes(req.method))return;
 const bytes=await request.arrayBuffer();
 if(bytes.byteLength>250000)throw Object.assign(new Error("BODY_TOO_LARGE"),{status:413});
 const raw=new TextDecoder().decode(bytes);
 if(/application\/json/i.test(req.headers["content-type"]||"")){
  try{req.body=raw?JSON.parse(raw):null}catch{throw Object.assign(new Error("INVALID_JSON"),{status:400})}
 }else req.body=raw;
}
export function responseAdapter(){
 let status=200,body=null;
 const headers=new Headers({"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type, X-GF-Forward-Key"});
 const res={setHeader(k,v){headers.set(k,String(v));return res},
  getHeader(k){return headers.get(k)},
  status(s){status=s;return res},
  json(v){headers.set("Content-Type","application/json; charset=utf-8");body=JSON.stringify(v);return res},
  send(v){body=String(v??"");return res},
  end(v){if(v!==undefined&&v!==null)body=String(v);return res},
  response(){return new Response([204,205,304].includes(status)?null:body,{status,headers})}
 };
 return res;
}
export async function runLegacy(handler,request,env){
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Content-Type, X-GF-Forward-Key"}});
 const req=toRequest(request),res=responseAdapter();
 Object.defineProperty(req,"cfEnv",{value:env||null,enumerable:false,writable:false,configurable:false});
 try{await populateBody(req,request);await handler(req,res);return res.response()}
 catch(e){let code=e?.status===413?413:e?.status===400?400:500;
  console.error("[GoldFlow Cloudflare API]",String(e?.message||e));
  return new Response(JSON.stringify({ok:false,error:code===500?"INTERNAL_API_ERROR":String(e?.message||e)}),
   {status:code,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}})}
}
