// GoldFlow Professional Review: no browser keys or model self-modification.
(()=>{
"use strict";
const el=id=>document.getElementById(id),run=el("gfGptReviewRun"),history=el("gfGptReviewHistory");
if(!run||!history)return;
const indicator=el("gfGptReviewIndicator"),status=el("gfGptReviewStatus");
let busy=false;
function note(message,isBad=false){status.textContent=message;status.className="notice "+(isBad?"bad":"info")}
function set(id,v){if(el(id))el(id).textContent=String(v??"—")}
function reset(){for(const id of ["gfGptReviewDiagnosis","gfGptReviewEvidence","gfGptReviewSuggestion",
 "gfGptReviewValidation","gfGptReviewLimitations"])set(id,"—");set("gfGptReviewDecision","—");}
function show(o){
 const r=o?.review||o||{};
 set("gfGptReviewDecision",r.decision||o.decision||"—");
 set("gfGptReviewDiagnosis",r.diagnosis);
 set("gfGptReviewEvidence",r.evidence);
 set("gfGptReviewSuggestion",r.recommendation);
 set("gfGptReviewValidation",r.validation);
 set("gfGptReviewLimitations",r.limitations);
 set("gfGptReviewEvidenceSource",[
   o?.indicator,o?.symbol,o?.tf,
   o?.source,o?.historyMode,o?.generatedAtUTC,
   "Published review • "+(o?.persisted===false?"NOT SAVED":"R2 audit archive"),
   "Changes applied: NO"
 ].filter(Boolean).join(" • "));
}
function error(code){const c=String(code||"UNKNOWN");const m={
 PROFESSIONAL_REVIEW_DISABLED:"GPT Professional Review belum diaktifkan. Tiada caj OpenAI.",
 REVIEW_STORAGE_NOT_CONFIGURED:"Storan GPT Review R2 berasingan belum disediakan. Tiada caj OpenAI.",
 UNAUTHORIZED:"Akses pemilik diperlukan melalui Cloudflare Access.",
 RESEARCH_COOLDOWN:"Terlalu kerap. Tunggu tempoh cooldown.",
 RESEARCH_DAILY_QUOTA:"Kuota analisis hari ini sudah digunakan.",
 RECOMMENDED_ARCHIVE_STALE_OR_INVALID:"Arkib Recommended AI sudah basi / tidak sah.",
 NO_INDICATOR_MATCHING_EVIDENCE:"Tiada rekod tepat indikator ini untuk XAUUSD247 M15.",
 OPENAI_REVIEW_UNAVAILABLE:"GPT tidak dapat memberikan review yang sah. Tiada strategi diubah.",
 REVIEW_PERSISTENCE_FAILED:"Review gagal disimpan dalam R2. Tiada setting signal diubah."
};return m[c]||c}
async function fetchStatus(){
 try{
  const req=await fetch("/api/gpt-research",{credentials:"same-origin",cache:"no-store"});
  const data=await req.json();
  const enabled=req.ok&&data.enabled;
  run.disabled=!enabled;history.disabled=!enabled;
  note(enabled?"Jika review enabled, tekan GPT Kaji Indicator & SL; hanya rekod evidence akan digunakan.":"GPT belum diaktifkan; signal GoldFlow kekal seperti sedia ada.");
 }catch{run.disabled=true;history.disabled=true;note("Status GPT tidak dapat disahkan.",true)}
}
async function action(method){
 if(busy)return;
 busy=true;run.disabled=true;history.disabled=true;reset();
 const id=indicator.value;
 note(method==="POST"?"GPT menyemak prestasi indikator berdasarkan arkib Recommended AI…":"Membaca audit GPT terdahulu…");
 try{
  const res=await fetch("/api/gpt-professional-review"+(method==="GET"?"?indicator="+encodeURIComponent(id):""),{
   method,credentials:"same-origin",cache:"no-store",
   ...(method==="POST"?{headers:{"Content-Type":"application/json"},body:JSON.stringify({indicator:id,tf:"M15"})}:{})
  });
  const x=await res.json();if(!res.ok||!x.ok){note(error(x.error),true);return}
  if(method==="GET"){
   if(!Array.isArray(x.items)||!x.items.length){note("Tiada rekod GPT untuk indikator ini. Tiada sejarah direka.");return}
   show({...x.items[0],persisted:true});
   note("Rekod terkini dipaparkan. "+x.items.length+" rekod tersedia (had senarai).");
  }else{
   if(x.changesApplied!==false||x.permissionToChange!==false||x.persisted!==true)
    throw Error("UNSAFE_REVIEW_NOT_PERSISTED");
   show(x);note("Review disimpan dalam R2 berasingan. Keputusan: "+x.decision+
    ". Cadangan sahaja; tiada perubahan indikator/SL/TP.");
  }
 }catch(e){note("Review tidak tersedia: "+String(e.message||e),true)}
 finally{busy=false;run.disabled=false;history.disabled=false}
}
run.addEventListener("click",()=>action("POST"));
history.addEventListener("click",()=>action("GET"));
document.querySelector('[data-page="recommendedAIPage"]')?.addEventListener("click",fetchStatus);
})();
