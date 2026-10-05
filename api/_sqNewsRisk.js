const MONTHS={JAN:1,FEB:2,MAR:3,APR:4,MAY:5,JUN:6,JUL:7,AUG:8,SEP:9,OCT:10,NOV:11,DEC:12,
  JANUARY:1,FEBRUARY:2,MARCH:3,APRIL:4,MAY:5,JUNE:6,JULY:7,AUGUST:8,SEPTEMBER:9,OCTOBER:10,NOVEMBER:11,DECEMBER:12};
const monthNames="January|February|March|April|May|June|July|August|September|October|November|December";
function clean(s){return String(s||"").replace(/<[^>]+>/g," ").replace(/&nbsp;|&#160;/gi," ").replace(/&amp;/gi,"&").replace(/\s+/g," ").trim()}
function firstSunday(year,monthIndex){const d=new Date(Date.UTC(year,monthIndex,1));return 1+((7-d.getUTCDay())%7)}
function easternOffsetHours(year,month,day){
  const marStart=firstSunday(year,2)+7,novEnd=firstSunday(year,10);
  const key=month*100+day,start=3*100+marStart,end=11*100+novEnd;
  return key>=start&&key<end?4:5; // UTC = Eastern local + offset
}
function easternToUtc(year,month,day,hour,minute){
  const off=easternOffsetHours(year,month,day);
  return new Date(Date.UTC(year,month-1,day,hour+off,minute,0));
}
function parseClock(hhmm,ampm){
  const [h0,m0]=String(hhmm).split(":").map(Number);let h=h0%12;if(String(ampm).toUpperCase()==="PM")h+=12;return {h,m:m0};
}
function event(type,title,impact,dt,source,url){
  return {type,title,impact,scheduledAtUTC:dt.toISOString(),timezone:"America/New_York",source,url,verifiedSchedule:true};
}

export function parseBlsSchedule(text,type,title,impact="HIGH",url=""){
  const t=clean(text),out=[];
  const re=/\b([A-Z][a-z]{2})\.\s+(\d{1,2}),\s+(20\d{2})\s+(\d{1,2}:\d{2})\s+(AM|PM)\b/g;
  for(const m of t.matchAll(re)){
    const mon=MONTHS[m[1].toUpperCase()],day=Number(m[2]),year=Number(m[3]),clock=parseClock(m[4],m[5]);
    if(mon&&day&&year)out.push(event(type,title,impact,easternToUtc(year,mon,day,clock.h,clock.m),"U.S. Bureau of Labor Statistics",url));
  }
  return dedupe(out);
}
export function parseBeaSchedule(text,year=new Date().getUTCFullYear(),url=""){
  const t=clean(text),matches=[...t.matchAll(new RegExp("\\b("+monthNames+")\\s+(\\d{1,2})\\s+(\\d{1,2}:\\d{2})\\s+(AM|PM)\\b","gi"))],out=[];
  for(let i=0;i<matches.length;i++){
    const m=matches[i],next=matches[i+1]?.index??Math.min(t.length,m.index+500),chunk=t.slice(m.index+m[0].length,next);
    let type=null,title=null;
    if(/Personal Income and Outlays/i.test(chunk)){type="PCE";title="Personal Income and Outlays (PCE)"}
    else if(/\bGDP\b|Gross Domestic Product/i.test(chunk)){type="GDP";title="Gross Domestic Product"}
    if(!type)continue;
    const mon=MONTHS[m[1].toUpperCase()],day=Number(m[2]),clock=parseClock(m[3],m[4]);
    out.push(event(type,title,"HIGH",easternToUtc(year,mon,day,clock.h,clock.m),"U.S. Bureau of Economic Analysis",url));
  }
  return dedupe(out);
}
export function parseFomcMeetings(text,years=[new Date().getUTCFullYear()],url=""){
  const t=clean(text),out=[];
  for(const year of years){
    const start=t.search(new RegExp(year+"\\s+FOMC\\s+Meetings","i"));if(start<0)continue;
    const rest=t.slice(start),next=rest.slice(20).search(/20\d{2}\s+FOMC\s+Meetings/i);
    const section=next>=0?rest.slice(0,next+20):rest.slice(0,12000);
    const re=new RegExp("\\b("+monthNames+")\\s+(\\d{1,2})-(\\d{1,2})(\\*)?","gi");
    for(const m of section.matchAll(re)){
      const mon=MONTHS[m[1].toUpperCase()],day=Number(m[3]);
      const dt=easternToUtc(year,mon,day,14,0);
      out.push(event("FOMC","FOMC Policy Decision"+(m[4]?" + SEP":""),"HIGH",dt,"Federal Reserve",url));
    }
  }
  return dedupe(out);
}
function dedupe(rows){
  const seen=new Set();return rows.filter(x=>{const k=x.type+"|"+x.scheduledAtUTC;if(seen.has(k))return false;seen.add(k);return true}).sort((a,b)=>a.scheduledAtUTC.localeCompare(b.scheduledAtUTC));
}
async function fetchText(url,ms=6500){
  const c=new AbortController(),timer=setTimeout(()=>c.abort(),ms);
  try{
    const r=await fetch(url,{signal:c.signal,cache:"no-store",headers:{"User-Agent":"GoldFlow-SmartQuant/1.0"}});
    if(!r.ok)throw Error("HTTP_"+r.status);return await r.text();
  }finally{clearTimeout(timer)}
}
async function source(name,url,parser){
  try{
    const text=await fetchText(url),events=parser(text);
    if(!events.length)throw Error("NO_EVENTS_PARSED");
    return {name,url,ok:true,events};
  }catch(e){return {name,url,ok:false,error:String(e?.message||e),events:[]}}
}

export async function fetchOfficialNewsRisk(now=new Date()){
  const y=now.getUTCFullYear();
  const defs=[
    ["BLS_CPI","https://www.bls.gov/schedule/news_release/cpi.htm",t=>parseBlsSchedule(t,"CPI","Consumer Price Index","HIGH","https://www.bls.gov/schedule/news_release/cpi.htm")],
    ["BLS_EMPLOYMENT","https://www.bls.gov/schedule/news_release/empsit.htm",t=>parseBlsSchedule(t,"NFP","Employment Situation","HIGH","https://www.bls.gov/schedule/news_release/empsit.htm")],
    ["BLS_PPI","https://www.bls.gov/schedule/news_release/ppi.htm",t=>parseBlsSchedule(t,"PPI","Producer Price Index","MEDIUM","https://www.bls.gov/schedule/news_release/ppi.htm")],
    ["BEA","https://www.bea.gov/news/schedule/full",t=>parseBeaSchedule(t,y,"https://www.bea.gov/news/schedule/full")],
    ["FED_FOMC","https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",t=>parseFomcMeetings(t,[y,y+1],"https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm")]
  ];
  const results=await Promise.all(defs.map(d=>source(d[0],d[1],d[2])));
  const required=new Set(["BLS_CPI","BLS_EMPLOYMENT","BEA","FED_FOMC"]);
  const verified=[...required].every(name=>results.find(x=>x.name===name)?.ok);
  const events=dedupe(results.flatMap(x=>x.events)).filter(x=>Date.parse(x.scheduledAtUTC)>=now.getTime()-60*60000);
  const high=events.filter(x=>x.impact==="HIGH").sort((a,b)=>a.scheduledAtUTC.localeCompare(b.scheduledAtUTC));
  const nextHigh=high[0]||null,minutes=nextHigh?(Date.parse(nextHigh.scheduledAtUTC)-now.getTime())/60000:null;
  let status="CLEAR",block=false;
  if(minutes!=null&&minutes>=-30&&minutes<=30){status="BLOCK_HIGH_IMPACT";block=true}
  else if(minutes!=null&&minutes>30&&minutes<=120)status="EVENT_SOON";
  else if(minutes!=null&&minutes< -30&&minutes>=-60)status="POST_EVENT_CAUTION";
  if(!verified)status="PARTIAL_UNVERIFIED";
  return {
    ok:true,verification:verified?"VERIFIED_OFFICIAL_SCHEDULES":"PARTIAL_UNVERIFIED",
    status,block,checkedAtUTC:now.toISOString(),nextHighImpact:nextHigh,
    minutesToNextHigh:minutes!=null?Number(minutes.toFixed(1)):null,
    upcoming:events.filter(x=>Date.parse(x.scheduledAtUTC)<=now.getTime()+14*86400000).slice(0,20),
    sources:results.map(x=>({name:x.name,url:x.url,ok:x.ok,error:x.error||null,eventCount:x.events.length})),
    policy:{hardBlockMinutesBefore:30,hardBlockMinutesAfter:30,cautionMinutesBefore:120},
    note:"Timing risk uses official BLS, BEA and Federal Reserve schedules only; it does not include private releases such as ADP or unscheduled geopolitical shocks."
  };
}
