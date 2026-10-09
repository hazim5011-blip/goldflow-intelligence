const canonMode=mode=>{
  const k=String(mode||"105").toLowerCase();
  if(k==="1.03")return "103";
  if(k==="1.07"||k==="snd")return "snd107";
  if(k==="1.32"||k==="pattern")return "pattern132";
  if(k==="owl"||k==="1.01")return "owl101";
  if(k==="fundstructure"||k==="1.04")return "fund104";
  if(k==="pvt-chart-101")return "pvtchart101";
  if(k==="pvt")return "pvt102";
  return k;
};
const canonSymbol=s=>String(s||"*").trim().toUpperCase()||"*";

export const RECOMMENDED_AI_PROFILE_STATE=Object.freeze({
  "version": 1,
  "updatedAtUTC": "2026-10-09T21:01:43.612Z",
  "policy": "AUTO_PROMOTION_ONLY_AFTER_OOS_GATE",
  "profiles": {}
});

export function aiProfileKey(mode,symbol){
  return canonMode(mode)+"|"+canonSymbol(symbol);
}
export function activeAIProfileRecord(mode,symbol){
  const exact=RECOMMENDED_AI_PROFILE_STATE.profiles[aiProfileKey(mode,symbol)];
  const generic=RECOMMENDED_AI_PROFILE_STATE.profiles[canonMode(mode)+"|*"];
  return exact||generic||null;
}
export function activeAIProfile(mode,symbol){
  const row=activeAIProfileRecord(mode,symbol);
  return row&&row.params&&typeof row.params==="object"?row.params:null;
}
