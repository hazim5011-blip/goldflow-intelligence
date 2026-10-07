const CACHE="goldflow-v8-8.1.3-production-r11";
const SHELL=["/","/index.html","/style.css","/app.js","/v8.js","/study-lifecycle.js","/tv-hybrid.js","/chart-tools.js","/study-ui.js","/ohlc-fallback.js","/locales/en.json","/locales/ms.json","/manifest.webmanifest"];
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const req=event.request,url=new URL(req.url);if(url.origin!==location.origin||url.pathname.startsWith("/api/"))return;
 const networkFirst=req.mode==="navigate"||/^(\/(?:index\.html|app\.js|v8\.js|tv-hybrid\.js|chart-tools\.js|study-ui\.js|style\.css|manifest\.webmanifest)|\/locales\/)/.test(url.pathname);
 if(!networkFirst)return;
 event.respondWith(fetch(req).then(response=>{
  if(response.ok){const copy=response.clone();caches.open(CACHE).then(c=>c.put(req,copy)).catch(()=>{});}
  return response;
 }).catch(()=>caches.match(req).then(cached=>cached||caches.match("/index.html"))));
});
