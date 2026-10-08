import {evaluateAILive} from "./_aiLiveEngine.js";
import {evaluateMarketStudy} from "./_marketStudyEngine.js";
import {extractGFTradePlan} from "./_gfTradePlan.js";

const TF_SECONDS={M1:60,M5:300,M15:900,M30:1800,H1:3600,H4:14400,D1:86400};
const ALL_AI_TFS=["M1","M5","M15","M30","H1","H4","D1"];
const N=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;

function modeName(mode){return mode==="gf-ai"?"GF-AI Live Analyst v1.60":mode==="gf-study"?"GF-Market Study Pro":"GF-News Impact Pro"}
function frameAt(frames,tf,nowSec,offset,selectedTf,selectedSlice){
  if(tf===selectedTf)return selectedSlice;
  const sec=TF_SECONDS[tf]||60;
  return (frames?.[tf]||[]).filter(b=>N(b?.t)!=null&&Number(b.t)-offset+sec<=nowSec-1);
}
function historySignal(output,mode,tf){
  const p=extractGFTradePlan(output,mode);
  if(!p.valid||output?.canEnter!==true)return null;
  const sec=TF_SECONDS[tf]||300;
  const signalTime=p.signalCandleTime;
  if(signalTime==null)return null;
  return {
    time:signalTime,closeTime:signalTime+sec,direction:p.direction,
    code:mode==="gf-ai"?(p.direction>0?"AI BUY":"AI SELL"):p.direction>0?"STUDY BUY":"STUDY SELL",
    score:p.score,entry:p.entry,invalidation:p.sl,tp1:p.tp1,tp2:p.tp2,tp3:p.tp3,
    status:String(output.status||"ENTRY_READY"),zone:{low:p.entryLow,high:p.entryHigh,source:p.entryMethod||p.confirmationType||mode},
    reasons:[...p.reasons,"History entry uses next broker bar OPEN as the first auditable quote after the closed signal candle."],
    planOrigin:p.origin,management:p.management
  };
}

export function buildGFHistoricalSignals({mode,symbol,tf,frames,offsetSeconds=10800,maxCandidates=72}={}){
  if(mode==="gf-news"){
    return {rawHistory:[],historyMode:"FORWARD_ONLY_NEWS_MACRO_ARCHIVE",
      historyNote:"GF-News old outcomes are not backfilled because verified historical macro/news snapshots were not archived. Live GF-News still requires ENTRY + SL + TP1/TP2/TP3; performance begins with forward-archived signals."};
  }
  const sec=TF_SECONDS[tf],selected=Array.isArray(frames?.[tf])?frames[tf]:[];
  if(!sec||selected.length<60)return {rawHistory:[],historyMode:"GF_CLOSED_CANDLE_REPLAY",historyNote:"Insufficient selected-TF broker candles for GF history replay."};
  const evaluator=mode==="gf-ai"?evaluateAILive:mode==="gf-study"?evaluateMarketStudy:null;
  if(!evaluator)return {rawHistory:[],historyMode:"UNSUPPORTED_GF_MODE",historyNote:"Unsupported GF history mode."};
  const first=Math.max(55,selected.length-Math.max(12,Math.min(160,Number(maxCandidates)||72))-1);
  const out=[],seen=new Set();
  for(let i=first;i<selected.length-1;i++){
    const signalBar=selected[i],next=selected[i+1],nextOpen=N(next?.o);
    if(N(signalBar?.t)==null||N(next?.t)==null||nextOpen==null)continue;
    const nowSec=Number(next.t)-offsetSeconds+1,selectedSlice=selected.slice(0,i+1);
    const quote={bid:nextOpen,ask:nextOpen,tickTime:Number(next.t),observedAt:nowSec};
    let result;
    if(mode==="gf-ai"){
      const replayFrames={};
      for(const f of ALL_AI_TFS)replayFrames[f]=frameAt(frames,f,nowSec,offsetSeconds,tf,selectedSlice);
      result=evaluator({symbol,tf,bars:selectedSlice,h1:replayFrames.H1||[],h4:replayFrames.H4||[],
        frames:replayFrames,quote,offsetSeconds,macro:null,nowSec});
    }else{
      result=evaluator({symbol,tf,bars:selectedSlice,h1:frameAt(frames,"H1",nowSec,offsetSeconds,tf,selectedSlice),
        h4:frameAt(frames,"H4",nowSec,offsetSeconds,tf,selectedSlice),quote,offsetSeconds,macro:null,nowSec});
    }
    const sig=historySignal(result,mode,tf);
    if(!sig)continue;
    const key=[sig.time,sig.direction,Number(sig.entry).toFixed(8)].join("|");
    if(seen.has(key))continue;seen.add(key);out.push(sig);
  }
  return {rawHistory:out,historyMode:"GF_CLOSED_CANDLE_NEXT_OPEN_REPLAY",
    historyNote:modeName(mode)+" historical study replays its OWN engine on Vantage closed candles. Entry is the next broker-bar open when that price satisfies the engine's verified entry zone. No legacy indicator signal is borrowed."};
}
