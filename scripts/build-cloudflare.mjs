import {cpSync,existsSync,mkdirSync,rmSync,copyFileSync} from "node:fs";
import {join} from "node:path";

const root=process.cwd(),dist=join(root,"dist");
rmSync(dist,{recursive:true,force:true});mkdirSync(dist,{recursive:true});

const files=["index.html","app.js","v8.js","smart-quant.js","style.css","manifest.webmanifest","sw.js","release.json"];
for(const file of files){
  const src=join(root,file);if(!existsSync(src))throw Error("MISSING_STATIC_ASSET: "+file);
  copyFileSync(src,join(dist,file));
}
for(const dir of ["blog","locales"]){
  const src=join(root,dir);if(existsSync(src))cpSync(src,join(dist,dir),{recursive:true});
}
console.log("Cloudflare static build ready:",dist);
