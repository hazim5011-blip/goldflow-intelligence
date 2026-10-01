import {classifyReleaseEvent} from "./_v8Impact.js";
import macroHandler from "./macro.js";
const COUNTRY="United States";
const TAKE=["GDP","IP","PAYEMS","UNRATE","CPI","COREPCE","BREAKEVEN10","FEDUPPER","WALCL","TGA","ONRRP","US2Y","US10Y","REAL10Y","USDBROAD"];
function wrapper(){let json=null;const res={setHeader(){return res},status(){return res},json(x){json=x;return res},end(){return res}};return {res,result:()=>json}}
function mechanism(id){
  if(id==="CPI"||id==="COREPCE")return {ifHigher:"Jika inflasi melebihi konsensus yang disahkan, jangkaan kadar Fed/yields boleh kekal tinggi; USD mungkin disokong dan gold mungkin tertekan. Reaksi boleh berbeza kerana komponen laporan dan apa yang sudah diambil kira pasaran.",ifLower:"Jika inflasi lebih rendah daripada konsensus, jangkaan dasar lebih longgar boleh menekan USD/yields dan menyokong gold, tetapi bukan kepastian."};
  if(id==="PAYEMS"||id==="UNRATE"||id==="GDP"||id==="IP")return {ifHigher:"Data aktiviti/pekerjaan yang lebih kukuh daripada konsensus boleh mengekalkan jangkaan kadar tinggi dan menyokong USD/yields, tetapi kesan sebenar bergantung pada butiran dan posisi pasaran.",ifLower:"Data yang lemah berbanding konsensus mungkin membuka ruang kepada dasar lebih longgar dan mengurangkan tekanan yields, dengan hasil market tetap tidak pasti."};
  if(id==="FEDUPPER")return {ifHigher:"Perubahan kadar atau kenyataan yang lebih ketat daripada jangkaan boleh menyokong USD/yields dan memberi tekanan kepada gold.",ifLower:"Keputusan/komunikasi lebih longgar daripada jangkaan boleh mengurangkan tekanan yields dan menyokong gold."};
  return {ifHigher:"Kenaikan bacaan ini perlu dinilai bersama yields sebenar, USD, jangkaan pasaran dan komponen lain.",ifLower:"Penurunan bacaan ini tidak secara automatik bermaksud gold akan naik; sahkan konteks dan tindak balas pasaran."};
}
export default async function handler(req,res){
  if(req.method==="OPTIONS")return res.status(204).end();
  if(req.method!=="GET")return res.status(405).json({ok:false,error:"GET_ONLY"});
  res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=900");
  try{
    const m=wrapper();await macroHandler({method:"GET",query:{}},m.res);const result=m.result();
    if(!result?.ok)throw Error("OFFICIAL_MACRO_UNAVAILABLE");
    const at=String(req.query?.at||"").trim(),dt=at?new Date(at):null;
    if(at&&(!Number.isFinite(dt?.getTime())))return res.status(400).json({ok:false,error:"INVALID_AT_TIMESTAMP"});
    const linkedAtSignal=false; // No official release timestamp was archived at signal publication.
    const events=(result.cards||[]).filter(c=>TAKE.includes(c.id)).map(c=>{
      const available=c.value!==null&&c.value!==undefined&&Number.isFinite(Number(c.value));
      return {eventId:"OFFICIAL_"+c.id+"_"+(c.date||"UNKNOWN"),country:COUNTRY,type:c.id,title:c.name,
        actual:available?Number(c.value):null,display:c.display||null,consensus:null,forecast:null,
        previous:null,forecastStatus:"CONSENSUS_UNAVAILABLE",dataPeriod:c.date||null,
        releasedAtUTC:null,verifiedReleaseTimestamp:false,
        fetchedAtUTC:result.fetchedAt,source:c.source,sourceUrl:c.seriesUrl||null,
        derived:c.status==="DERIVED",stale:!!c.stale,status:!available?"UNAVAILABLE":c.stale?"STALE":"OFFICIAL_RECORDED",
        surprise:null,surprisePercent:null,changeVsHistory:c.change??null,changeLabel:c.changeLabel||null,
        ...classifyReleaseEvent({type:c.id,verifiedReleaseTimestamp:false,releasedAtUTC:null}),
        interpretation:{...mechanism(c.id),fact:available?c.name+" "+c.display+" untuk tempoh "+(c.date||"tidak dinyatakan")+". Sumber: "+c.source+".":"Data belum tersedia."},
        signalLinkage:"NOT_LINKED_TO_HISTORICAL_SIGNAL"};
    });
    const observations=events.map(e=>({...e,eventClass:"OFFICIAL_MACRO_OBSERVATION_NOT_RELEASE_EVENT"}));
    const verifiedReleases=observations.filter(e=>e.verifiedReleaseTimestamp&&e.releasedAtUTC&&e.sourceUrl&&e.dataPeriod);
    return res.status(200).json({ok:true,version:"8.0.0",
      verifiedReleases,latestOfficialEvents:verifiedReleases,latestOfficialObservations:observations,
      macro:{regime:result.regime,gold:result.gold,quality:result.quality,fetchedAtUTC:result.fetchedAt},
      historicalSignalAtUTC:at||null,linkedToSignal:linkedAtSignal,
      releaseTiming:"Only verifiedReleases are treated as release-timed news. Observation period dates are NOT publication timestamps. No look-ahead causal attribution is made.",
      caveat:"Without a verified release timestamp and market-consensus feed, GoldFlow does not assert a news surprise, pre-release expectation or definite USD/gold reaction.",
      disclaimer:"Fundamental study is educational, conditional market context; not a BUY/SELL instruction. Users decide and bear their own trading risk."});
  }catch(e){res.setHeader("Cache-Control","no-store");return res.status(200).json({ok:false,error:String(e?.message||e),latestOfficialEvents:[]});}
}