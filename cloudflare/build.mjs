// Bundle Pages advanced mode from the exact checked-out staging source. NO token included in dist.
import {build} from "esbuild";
import {cp,mkdir,rm,writeFile,access} from "node:fs/promises";
import {resolve,join,basename} from "node:path";
const root=resolve(process.cwd()),dist=join(root,"dist");
for(const need of ["index.html","app.js","v8.js","study-lifecycle.js","tv-hybrid.js","chart-tools.js","study-ui.js","ohlc-fallback.js","style.css","release.json",
 "api/_studyEngine.js","api/market-online.js","api/news-live.js","cloudflare/worker.js"])await access(join(root,need));
await rm(dist,{recursive:true,force:true});await mkdir(dist,{recursive:true});
for(const f of ["index.html","app.js","v8.js","study-lifecycle.js","tv-hybrid.js","chart-tools.js","study-ui.js","ohlc-fallback.js","style.css","release.json",
 "sw.js","manifest.webmanifest"])await cp(join(root,f),join(dist,basename(f)));
for(const dir of ["blog","locales"])await cp(join(root,dir),join(dist,dir),{recursive:true});
await writeFile(join(dist,"_routes.json"),JSON.stringify({version:1,include:["/api/*"],exclude:[]},null,2)+"\n");
await build({entryPoints:[join(root,"cloudflare/worker.js")],outfile:join(dist,"_worker.js"),
 bundle:true,format:"esm",platform:"neutral",target:"es2022",external:["node:crypto"],logLevel:"info",plugins:[{
 name:"cloudflare-r2-forward-ledger",setup(plugin){
  plugin.onResolve({filter:/^\.\/_v8Ledger\.js$/},()=>({path:join(root,"cloudflare/forward-r2.js")}));
 }
}]});
console.log("Cloudflare dist prepared: GF Study, Market Online, World News, and optional fail-closed R2 forward archive adapter.");
