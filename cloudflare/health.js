export default function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 return res.status(200).json({ok:true,service:"GoldFlow Intelligence",version:"8.1.1",hosting:"CLOUDFLARE_PAGES",
  channel:"cloudflare-staging",engine:"GF_RULE_BASED_STUDY_V1",readOnly:true,ts:Date.now()});
}
