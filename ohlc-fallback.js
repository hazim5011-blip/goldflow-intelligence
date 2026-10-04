// Offline-capable chart renderer for verified broker OHLC; no TradingView or CDN required.
// Price and timestamps must be finite; visualization never creates trade or proof.
(function(){
 "use strict";
 function num(x){return x!==null&&x!==undefined&&Number.isFinite(Number(x))?Number(x):null}
 function escape(x){return String(x||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
 function render(node,input,levels=[]){
  if(!node)return false;
  const rows=(Array.isArray(input)?input:[]).map(x=>({
   t:num(x.time??x.t),o:num(x.open??x.o),h:num(x.high??x.h),l:num(x.low??x.l),c:num(x.close??x.c)
  })).filter(x=>[x.t,x.o,x.h,x.l,x.c].every(Number.isFinite)&&x.h>=Math.max(x.o,x.c,x.l)&&x.l<=Math.min(x.o,x.c))
   .sort((a,b)=>a.t-b.t).slice(-80);
  if(rows.length<3){node.textContent="No valid broker OHLC available.";return false}
  const bands=(Array.isArray(levels)?levels:[]).map(x=>({p:num(x.p),name:String(x.name||"LEVEL")}))
   .filter(x=>x.p!==null);
  const plot={x:63,y:15,w:840,h:270},min=Math.min(...rows.map(x=>x.l),...bands.map(x=>x.p)),
   max=Math.max(...rows.map(x=>x.h),...bands.map(x=>x.p));
  const gap=Math.max((max-min)*.07,Math.abs(max)*.0000005,.000001);
  const low=min-gap,high=max+gap,span=high-low,at=p=>plot.y+(high-p)/span*plot.h,
   fmt=p=>Number(p).toLocaleString("en-US",{maximumFractionDigits:5});
  let markup='<svg role="img" aria-label="Independent broker OHLC fallback chart" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 335" preserveAspectRatio="none" style="height:100%;width:100%;background:#07131c">';
  for(let i=0;i<=4;i++){
   const price=high-span*i/4,y=at(price);
   markup+='<line x1="'+plot.x+'" y1="'+y+'" x2="'+(plot.x+plot.w)+'" y2="'+y+'" stroke="#203747" stroke-width="1"/>'+
    '<text x="4" y="'+(y+4)+'" fill="#adc5cf" font-size="12">'+fmt(price)+'</text>';
  }
  const step=plot.w/rows.length,width=Math.min(step*.65,10);
  rows.forEach((x,i)=>{
   const center=plot.x+step*(i+.5),up=x.c>=x.o,clr=up?"#31d6a4":"#ff6079",
    top=at(Math.max(x.o,x.c)),bottom=at(Math.min(x.o,x.c));
   markup+='<line x1="'+center+'" y1="'+at(x.h)+'" x2="'+center+'" y2="'+at(x.l)+'" stroke="'+clr+'" stroke-width="1"/>'+
    '<rect x="'+(center-width/2)+'" y="'+top+'" width="'+width+'" height="'+Math.max(1,bottom-top)+'" fill="'+clr+'"/>';
  });
  bands.forEach((x,i)=>{
   const y=at(x.p);
   markup+='<line x1="'+plot.x+'" y1="'+y+'" x2="'+(plot.x+plot.w)+'" y2="'+y+
    '" stroke="'+(i===0?"#69bafb":i===1?"#f2c75b":"#9cb4c7")+'" stroke-width="1" stroke-dasharray="5,4"/>'+
    '<text x="'+(plot.x+plot.w-7)+'" y="'+Math.max(13,y-3)+'" text-anchor="end" fill="#d1e2ed" font-size="11">'+escape(x.name)+': '+fmt(x.p)+'</text>';
  });
  const first=new Date(rows[0].t*1000),last=new Date(rows.at(-1).t*1000);
  markup+='<text x="'+plot.x+'" y="323" fill="#a9c1cd" font-size="12">'+escape(first.toISOString().slice(0,16))+' UTC</text>'+
   '<text x="'+(plot.x+plot.w)+'" y="323" text-anchor="end" fill="#a9c1cd" font-size="12">'+escape(last.toISOString().slice(0,16))+' UTC</text></svg>';
  node.innerHTML=markup;return true;
 }
 window.GFOHLC={render};
})();
