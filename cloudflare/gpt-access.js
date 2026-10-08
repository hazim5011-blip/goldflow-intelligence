// Browser access requires a cryptographically verified Cloudflare Access JWT.
// Never trust the presence of CF-Access headers alone: verify signature, issuer, audience and expiry.
const b64urlDecode=s=>{const padded=String(s).replace(/-/g,"+").replace(/_/g,"/");return atob(padded+"=".repeat((4-padded.length%4)%4))};
function bytes(s){return Uint8Array.from(b64urlDecode(s),x=>x.charCodeAt(0))}
function readJwtSegment(s){return JSON.parse(new TextDecoder().decode(bytes(s)))}
async function accessJwt(request,env,requestFetch){
 const team=String(env.GF_GPT_ACCESS_TEAM||"").trim().toLowerCase(),
  audience=String(env.GF_GPT_ACCESS_AUD||"").trim(),
  ownerEmail=String(env.GF_GPT_OWNER_EMAIL||"").trim().toLowerCase();
 if(!/^[a-z0-9-]{1,50}$/.test(team)||!audience||audience.length>150
   ||!ownerEmail||ownerEmail.length>200||!ownerEmail.includes("@"))return null;
 const jwt=request.headers.get("Cf-Access-Jwt-Assertion")||"";
 const sections=jwt.split(".");
 if(sections.length!==3||jwt.length>6000)return null;
 try{
  const header=readJwtSegment(sections[0]),payload=readJwtSegment(sections[1]);
  const now=Math.floor(Date.now()/1000),issuer="https://"+team+".cloudflareaccess.com";
  if(header.alg!=="RS256"||typeof header.kid!=="string"||!header.kid||header.kid.length>200
    ||payload.iss!==issuer||String(payload.email||"").toLowerCase()!==ownerEmail
    ||!(Array.isArray(payload.aud)?payload.aud.includes(audience):payload.aud===audience)
    ||typeof payload.exp!=="number"||payload.exp<=now||payload.exp>now+86400*30
    ||typeof payload.iat!=="number"||payload.iat>now+60)return null;
  const result=await requestFetch(issuer+"/cdn-cgi/access/certs",{
    headers:{Accept:"application/json"},signal:AbortSignal.timeout(5000)});
  if(!result.ok)return null;
  const certs=await result.json(),keys=Array.isArray(certs.keys)?certs.keys:[];
  const key=keys.find(k=>k.kid===header.kid&&k.kty==="RSA"&&k.alg==="RS256");
  if(!key)return null;
  const verifyKey=await crypto.subtle.importKey("jwk",{kty:"RSA",n:key.n,e:key.e,alg:"RS256",ext:true},
    {name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
  const valid=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",verifyKey,bytes(sections[2]),
    new TextEncoder().encode(sections[0]+"."+sections[1]));
  return valid&&typeof payload.sub==="string"&&payload.sub.length>=3
    ?{id:payload.sub,mode:"ACCESS"}:null;
 }catch{return null}
}
function equalSecret(a,b){
 if(typeof a!=="string"||typeof b!=="string"||!b||a.length!==b.length)return false;
 let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
 return diff===0;
}
export async function verifyGptIdentity(request,env,requestFetch=fetch){
 const expected=env.GF_GPT_ADMIN_TOKEN;
 const auth=request.headers.get("authorization")||"";
 if(typeof expected==="string"&&expected.length>=32&&equalSecret(auth,"Bearer "+expected))
   return {id:"admin-server",mode:"BEARER"};
 return accessJwt(request,env,requestFetch);
}
async function keyHash(identity){
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(identity));
 return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,"0")).join("").slice(0,32);
}
export async function quotaCheck(identity,env,nowSec=Math.floor(Date.now()/1000)){
 const kv=env.GF_GPT_RATE_KV;
 if(!kv||typeof kv.get!=="function"||typeof kv.put!=="function")
   return {ok:false,code:"RATE_STORE_NOT_CONFIGURED"};
 const user=await keyHash(identity.id||"unknown"),day=new Date(nowSec*1000).toISOString().slice(0,10);
 // Approximate per-user/day quota (KV writes are eventually consistent).
 const perDay=Math.max(1,Math.min(30,Number(env.GF_GPT_DAILY_LIMIT)||12));
 const dailyKey="gpt:v1:"+user+":"+day;
 const minuteKey="gpt:v1:cooldown:"+user;
 try{
  const [cool,rawCount]=await Promise.all([kv.get(minuteKey),kv.get(dailyKey)]);
  const count=Number(rawCount||0);
  if(cool)return {ok:false,code:"RESEARCH_COOLDOWN"};
  if(!Number.isInteger(count)||count<0||count>=perDay)return {ok:false,code:"RESEARCH_DAILY_QUOTA"};
  // Fail closed if either write errors. Additional WAF/model project rate caps required.
  await kv.put(minuteKey,"1",{expirationTtl:90});
  await kv.put(dailyKey,String(count+1),{expirationTtl:86400*2});
  return {ok:true,remaining:Math.max(0,perDay-count-1)};
 }catch{return {ok:false,code:"RATE_STORE_ERROR"}}
}
