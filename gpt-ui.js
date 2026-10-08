/* Isolated owner-operated GPT-6 Research tab. No credentials in client storage or JS. */
(function(){
 "use strict";
 var byId=id=>document.getElementById(id);
 var run=byId("gfGptRun"),status=byId("gfGptStatus"),decision=byId("gfGptDecision");
 if(!run||!status||!decision)return;
 var busy=false;
 function message(value,bad){
  status.textContent=String(value||"");
  status.className="notice "+(bad?"bad":"info");
 }
 function put(id,value){var node=byId(id);if(node)node.textContent=String(value??"—")}
 function clear(){
  put("gfGptDecision","WAIT");put("gfGptTechnical","—");put("gfGptFundamental","—");
  put("gfGptSummary","—");put("gfGptRisks","—");put("gfGptSource","Tiada analisis live");
 }
 function classify(code){
  var messages={
   GPT_RESEARCH_DISABLED:"Modul GPT belum diaktifkan. Tiada panggilan berbayar dibuat.",
   GPT_RESEARCH_NOT_CONFIGURED:"Sambungan OpenAI / bridge belum lengkap.",
   RATE_STORE_NOT_CONFIGURED:"Stor had penggunaan KV belum dikonfigurasi.",
   UNAUTHORIZED:"Akses pemilik diperlukan. Log masuk Cloudflare Access untuk halaman/API ini.",
   RESEARCH_COOLDOWN:"Had sementara: satu permintaan setiap 90 saat.",
   RESEARCH_DAILY_QUOTA:"Had analisis harian telah digunakan.",
   BROKER_UNAVAILABLE:"MT5 Vantage tidak dapat dihubungi. AI tidak mengarang harga.",
   BROKER_TICK_MISSING_OR_STALE:"Harga/tick Vantage terlalu lama. Keputusan WAIT.",
   CLOSED_CANDLE_STALE:"Candle terkini terlalu lama. Keputusan WAIT.",
   INSUFFICIENT_CLOSED_BARS:"Sejarah candle belum mencukupi. Keputusan WAIT.",
   OPENAI_UNAVAILABLE:"Model OpenAI tidak tersedia. Semak API key, model dan bajet.",
   OPENAI_INVALID_RESEARCH:"Output AI gagal pengesahan; tiada cadangan trading."
  };
  return messages[code]||String(code||"GPT_RESEARCH_ERROR");
 }
 async function loadStatus(){
  try{
   var r=await fetch("/api/gpt-research",{credentials:"same-origin",cache:"no-store"});
   var data=await r.json();
   if(!r.ok)throw Error(data.error||"STATUS_UNAVAILABLE");
   message(data.enabled?"GPT Research disediakan untuk pemilik yang telah disahkan. Analisis hanya bila butang ditekan.":"GPT Research belum diaktifkan. Website signal sedia ada berfungsi seperti biasa.",false);
   run.disabled=!data.enabled;
  }catch(e){run.disabled=true;message("Status GPT tidak dapat disahkan. "+String(e.message||e),true)}
 }
 run.addEventListener("click",async function(){
  if(busy)return;
  clear();
  var question=byId("gfGptQuestion")?.value.trim()||"",tf=byId("gfGptTF")?.value||"M15";
  if(question.length<5||question.length>240){message("Soalan mesti mengandungi 5 hingga 240 aksara.",true);return}
  busy=true;run.disabled=true;
  message("Menyemak candle broker dan meminta analisis OpenAI…",false);
  try{
   var response=await fetch("/api/gpt-research",{
    method:"POST",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({symbol:"XAUUSD247",tf,question})
   });
   var data=await response.json();
   if(!response.ok||!data.ok){message(classify(data.error),true);put("gfGptDecision","WAIT");return}
   if(data.canEnter!==false||data.isExecutedTrade!==false)throw Error("UNSAFE_EXECUTION_FLAG");
   var a=data.analysis||{};
   put("gfGptDecision",a.decision||"WAIT");
   put("gfGptSummary",a.summary);put("gfGptTechnical",a.technical);
   put("gfGptFundamental",a.fundamental);put("gfGptRisks",a.risks);
   put("gfGptSource",[data.source,data.symbol,data.tf,"Bid "+data.quote?.bid,"Ask "+data.quote?.ask,
     data.generatedAtUTC,"Fundamental "+data.fundamentalFeedStatus].join(" • "));
   message("Kajian bukan signal entry. AI tidak melaksanakan order. Baki panggilan anggaran hari ini: "+
      String(data.remainingRequestsToday??"—"),false);
  }catch(e){message("Analisis gagal: "+String(e.message||e)+". Jangan gunakan ini sebagai signal.",true)}
  finally{busy=false;run.disabled=false}
 });
 document.querySelector('[data-page="gfGptPage"]')?.addEventListener("click",loadStatus);
 clear();
})();
