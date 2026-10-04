// GoldFlow World News: independent from MT5, broker candle, and BLS macro.
// Two evidence tiers: curated SOURCE-ATTRIBUTED stories and trustworthy publisher
// headlines from public RSS. Headlines are NEVER interpreted as full article proof.
// No claim of independently verified blame, consensus, price reaction or live orders.
const HOURS=3600000;
export const CURATED_WORLD_NEWS=[
 {id:"ukmto-incident-149-20261002",title:"UKMTO melaporkan tanker terkena projektil di timur Oman",
  titleEN:"UKMTO reports an unidentified projectile strike on a tanker east of Oman",
  publishedOn:"2026-10-02",publisher:"UKMTO",sourceUrl:"https://www.ukmto.org/",
  verification:"OFFICIAL_INCIDENT_REPORT",category:"GEOPOLITICS",impact:"HIGH",
  reported:"Amaran UKMTO #149 bertarikh 2 Oktober: nakhoda melaporkan tanker minyak mentah terkena projektil tidak dikenal pasti kira-kira 4 batu nautika di timur Oman. Anak kapal dilaporkan selamat; penyiasatan masih berjalan.",
  reportedEN:"UKMTO alert #149 (2 October) reports an unidentified projectile struck a crude oil tanker roughly 4 nautical miles east of Oman. Crew reported safe; investigation ongoing.",
  limitation:"Laporan keselamatan maritim, bukan pengesahan siapa pelaku serangan."},
 {id:"wsj-hormuz-shipping-20261004",title:"Risiko Hormuz berulang: WSJ melaporkan tujuh serangan baharu sejak 28 September",
  titleEN:"Repeated Hormuz shipping risk: WSJ reports seven new strikes since 28 September",
  publishedOn:"2026-10-04",publisher:"The Wall Street Journal",
  sourceUrl:"https://www.wsj.com/world/middle-east/oil-was-pouring-through-the-strait-of-hormuz-again-then-attacks-on-shipping-resurged-fe9f0dd9",
  verification:"PUBLISHER_REPORTED_WITH_OFFICIAL_CROSSCHECK",category:"GEOPOLITICS",impact:"HIGH",
  reported:"Menurut laporan WSJ, rekod UKMTO mencatat tujuh serangan baharu sejak 28 September. Pemantau industri yang dipetik WSJ menganggarkan pemulihan aliran eksport minyak kini berdepan pengurangan sekitar 2–3 juta tong sehari. Angka aliran itu ialah anggaran sumber WSJ, bukan ukuran langsung GoldFlow.",
  reportedEN:"WSJ reports seven renewed UKMTO-recorded strikes since 28 September. Industry estimates cited in the report suggest a potential 2–3 million bpd decline in recovering oil flows. This is a source estimate, not an independent GoldFlow measurement.",
  limitation:"Atribusi individu bagi setiap serangan belum disahkan secara bebas; angka aliran minyak ialah anggaran yang dilaporkan."},
 {id:"reuters-opec-november-20261004",title:"OPEC+ mengekalkan sasaran pengeluaran November dalam pasaran minyak yang masih ketat",
  titleEN:"OPEC+ maintains November output targets amid a tight physical oil market",
  publishedOn:"2026-10-04",publisher:"Reuters",
  sourceUrl:"https://www.reuters.com/business/energy/opec-agrees-principle-keep-november-oil-output-targets-steady-sources-say-2026-10-04/",
  verification:"PUBLISHER_REPORTED",category:"ENERGY_SUPPLY",impact:"HIGH",
  reported:"Reuters melaporkan OPEC+ bersetuju mengekalkan sasaran pengeluaran November. Gangguan eksport serantau bermakna sasaran nominal sahaja tidak membuktikan aliran fizikal minyak sudah pulih.",
  reportedEN:"Reuters reports that OPEC+ agreed to keep November production targets steady. Nominal quotas do not, by themselves, prove disrupted physical Gulf exports have fully recovered.",
  limitation:"Sahkan perkembangan lanjut dengan kenyataan rasmi OPEC+ apabila diterbitkan."},
 {id:"reuters-oman-tanker-20261002",title:"Tanker minyak terkena projektil tidak dikenal pasti berhampiran Oman",
  titleEN:"Oil tanker struck by unknown projectile near Oman",
  publishedOn:"2026-10-02",publisher:"Reuters",
  sourceUrl:"https://www.reuters.com/business/energy/crude-oil-tanker-struck-by-unknown-projectile-off-oman-ukmto-says-2026-10-02/",
  verification:"PUBLISHER_REPORTED_WITH_OFFICIAL_CROSSCHECK",category:"GEOPOLITICS",impact:"HIGH",
  reported:"Reuters memetik UKMTO berkenaan serangan projektil terhadap tanker kira-kira 4 batu nautika di timur Oman. Maklumat awal menyebut anak kapal selamat dan tiada kesan alam sekitar yang dilaporkan.",
  reportedEN:"Reuters cites UKMTO on a projectile strike on a tanker about 4 nautical miles east of Oman; initial reporting indicated crew safety and no reported environmental impact.",
  limitation:"Kemungkinan merujuk insiden UKMTO #149 yang sama, bukan bilangan serangan tambahan."},
 {id:"wsj-g7-energy-relief-20261002",title:"Pelan pelepasan rizab bahan api G7 boleh meredakan sebahagian tekanan harga minyak",
  titleEN:"G7 fuel-reserve release plan could partially offset the oil supply shock",
  publishedOn:"2026-10-02",publisher:"The Wall Street Journal",
  sourceUrl:"https://www.wsj.com/business/energy-oil/oil-prices-fall-as-middle-east-crude-exports-recover-but-shipping-risks-remain-84ca187f",
  verification:"PUBLISHER_REPORTED",category:"ENERGY_SUPPLY",impact:"MEDIUM",
  reported:"WSJ melaporkan rancangan G7 melepaskan sekitar 100 juta tong minyak dan produk bahan api daripada rizab kecemasan untuk mengurangkan tekanan bekalan. Ini faktor pengimbang risiko Hormuz, bukan bukti risiko perkapalan telah tamat.",
  reportedEN:"WSJ reports a plan by G7 countries to release about 100 million barrels of oil and fuel from emergency reserves. This may offset some Hormuz supply pressure but does not remove shipping risk.",
  limitation:"Rancangan dan jumlah sebenar pelepasan boleh berubah; bukan bukti impak harga Gold yang telah berlaku."}
];
const trustedNames=new Set(["reuters","associated press","ap news","bbc news","bbc","the wall street journal",
 "wsj","bloomberg","financial times","the guardian","al jazeera","al jazeera english","cnbc",
 "s&p global","the economic times","nikkei asia","marketwatch","the new york times","ukmto"]);
const topics=[
 {key:"HORMUZ",query:"(Strait of Hormuz OR UKMTO OR tanker attacks OR Red Sea shipping) when:2d"},
 {key:"GOLD",query:"(gold XAUUSD OR central bank gold OR safe haven gold) when:2d"},
 {key:"ENERGY",query:"(OPEC oil OR Brent crude OR energy supply OR G7 oil reserves) when:2d"},
 {key:"FED",query:"(Federal Reserve rates OR US Treasury yields OR CPI NFP dollar) when:2d"}
];
function clean(v){return String(v==null?"":v).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
 .replace(/<[^>]*>/g," ").replace(/&#x([0-9a-f]+);/gi,(_,x)=>String.fromCodePoint(parseInt(x,16)))
 .replace(/&#([0-9]+);/g,(_,x)=>String.fromCodePoint(parseInt(x,10)))
 .replace(/&(amp|quot|apos|lt|gt|nbsp);/gi,(_,x)=>({amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" "}[x.toLowerCase()]))
 .replace(/[\u0000-\u001f]+/g," ").replace(/\s+/g," ").trim().slice(0,700)}
function tag(s,k){const m=String(s).match(new RegExp("<"+k+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/"+k+">","i"));return clean(m?.[1]||"")}
function safeLink(v){try{const u=new URL(v);return u.protocol==="https:"&&u.username===""&&u.password===""?u.href:null}catch{return null}}
function fnv(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
function normalizedTitle(s){return clean(s).toLowerCase().replace(/\s+[-|]\s+(reuters|bbc news|the guardian|wsj|al jazeera).*$/i,"").replace(/[^a-z0-9]+/g," ").trim()}
const relevant=/\b(gold|xauusd|bullion|safe.haven|silver|hormuz|tanker|maritime|iran|israel|yemen|houthi|red sea|opec|crude|oil|brent|energy|fuel reserves|fed|federal reserve|inflation|treasury|yields?|usd|u\.s\. dollar|dxy|nonfarm|payroll|cpi|pce|interest rates?|geopolitic|sanctions?|tariffs?|central bank)\b/i;
export function classifyHeadline(title){
 const s=String(title||"").toLowerCase();
 let category="MARKET_CONTEXT",impact="LOW";
 if(/hormuz|attack|strik|missil|drone|tanker|war\b|iran|israel|houthi|shipping|blockade|ceasefire|red sea|sanction/.test(s)){
  category="GEOPOLITICS";impact=/hormuz|attack|strik|missil|blockade|ceasefire|war\b/.test(s)?"HIGH":"MEDIUM";
 }else if(/oil|brent|opec|energy|crude|fuel|petroleum|diesel/.test(s)){
  category="ENERGY_SUPPLY";impact=/opec|supply|export|reserve|crude|brent/.test(s)?"MEDIUM":"LOW";
 }else if(/fed\b|fomc|federal reserve|treasury|yields?|real rate|rate cut|rate hike|interest/.test(s)){
  category="MONETARY_POLICY";impact=/fomc|rate decision|rate hike|rate cut|powell/.test(s)?"HIGH":"MEDIUM";
 }else if(/\bcpi\b|\bpce\b|payroll|jobs report|nonfarm|gdp|inflation/.test(s)){
  category="ECONOMIC_RELEASE";impact=/cpi|pce|nonfarm|payroll|inflation/.test(s)?"HIGH":"MEDIUM";
 }else if(/gold|bullion|dollar|dxy|central bank/.test(s)){
  category="GOLD_MARKET";impact="MEDIUM";
 }
 return {category,impact};
}
export function mechanism(cat){
 if(cat==="GEOPOLITICS")return {
  pathway:"Peningkatan risiko geopolitik/perkapalan boleh menambah permintaan safe-haven untuk Gold, khususnya jika DXY dan real yields tidak turut melonjak.",
  opposing:"Gangguan minyak boleh meningkatkan jangkaan inflasi, US yields dan USD; ini boleh mengehadkan kenaikan Gold atau mencetuskan whipsaw."};
 if(cat==="ENERGY_SUPPLY")return {
  pathway:"Gangguan bekalan minyak boleh menaikkan premium risiko dan minat terhadap Gold; langkah menambah bekalan boleh mengurangkan premium tersebut.",
  opposing:"Harga minyak yang tinggi juga boleh menyokong inflation expectations/yields; arah XAUUSD mesti disahkan dengan DXY, US2Y/US10Y, real yields dan harga broker."};
 if(cat==="MONETARY_POLICY"||cat==="ECONOMIC_RELEASE")return {
  pathway:"Berita yang melemahkan jangkaan kadar sebenar atau USD berpotensi menyokong Gold selepas pasaran menilai actual, consensus dan butiran laporan.",
  opposing:"Kejutan hawkish/US yields atau USD yang meningkat boleh menekan Gold. Tajuk berita sahaja tidak membuktikan surprise atau pergerakan harga."};
 return {
  pathway:"Pantau sama ada maklumat ini mengubah permintaan safe-haven, jangkaan kadar, USD atau posisi risiko terhadap Gold.",
  opposing:"Tiada arah BUY/SELL yang boleh disahkan daripada headline sahaja; tunggu harga, spread dan candle broker."};
}
function mechanismEN(cat){
 if(cat==="GEOPOLITICS")return {
  pathwayEN:"Higher geopolitical/shipping risks can increase safe-haven Gold demand, particularly if the dollar and real yields are not rising simultaneously.",
  opposingEN:"Oil disruption may increase inflation expectations, US yields and the dollar, limiting Gold or triggering opening whipsaw."};
 if(cat==="ENERGY_SUPPLY")return {
  pathwayEN:"Oil supply disruption may raise the risk premium and safe-haven interest in Gold. Actual reserve releases can also temper that pressure.",
  opposingEN:"Expensive oil can lift inflation expectations and real yields. Recheck fresh Brent/WTI, DXY, US2Y/US10Y and broker XAUUSD rather than assuming direction."};
 if(cat==="MONETARY_POLICY"||cat==="ECONOMIC_RELEASE")return {
  pathwayEN:"A development that reduces expected real rates or dollar strength could support Gold after verified details and actual-versus-consensus become available.",
  opposingEN:"Hawkish repricing or higher US yields/USD could pressure Gold. Headlines do not prove a macro surprise or a realized price move."};
 return {
  pathwayEN:"Watch whether the news changes demand for safe havens, rates, the US dollar or overall risk appetite.",
  opposingEN:"No BUY/SELL direction is confirmed by a headline alone. Require price, spread and CLOSED broker candle evidence."};
}
export function makeEditorial(now=Date.now()){
 return CURATED_WORLD_NEWS.filter(s=>{
  const t=Date.parse(s.publishedOn+"T12:00:00Z");
  return Number.isFinite(t)&&now-t<=120*HOURS&&t<=now+24*HOURS;
 }).map(s=>({...s,sourceMode:"CURATED_SOURCE_ATTRIBUTED",publishedAtUTC:null,
   publicationDatePrecision:"DAY",dateLabel:s.publishedOn,headlineOnly:false,
   ...mechanism(s.category),...mechanismEN(s.category),goldStudyOnly:true,priceReactionVerified:false}));
}
export function parseRss(xml,feed,now=Date.now()){
 const out=[];
 const items=String(xml||"").match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi)||[];
 for(const item of items.slice(0,70)){
  const title=tag(item,"title"),rawSource=tag(item,"source"),publisher=feed.publisher||rawSource;
  const publisherId=publisher.toLowerCase().trim();
  if(!trustedNames.has(publisherId)||!relevant.test(title))continue;
  const published=Date.parse(tag(item,"pubDate")||tag(item,"published")||tag(item,"dc:date"));
  if(!Number.isFinite(published)||published>now+5*60000||published<now-72*HOURS)continue;
  const link=safeLink(tag(item,"link")||tag(item,"guid"));
  if(!link)continue;
  if(feed.google&&new URL(link).hostname!=="news.google.com")continue;
  if(!feed.google&&!feed.domains.includes(new URL(link).hostname))continue;
  const normalized=normalizedTitle(title);
  if(normalized.length<24)continue;
  const flags=classifyHeadline(title);
  out.push({id:"feed-"+fnv(normalized+"|"+publisherId),title,titleEN:title,publisher,sourceUrl:link,
   publishedAtUTC:new Date(published).toISOString(),publishedOn:new Date(published).toISOString().slice(0,10),
   publicationDatePrecision:"RSS_FEED_TIMESTAMP_NOT_INDEPENDENTLY_VERIFIED",
   dateLabel:new Date(published).toISOString(),
   reported:"Tajuk feed penerbit: "+title+". Buka artikel sumber untuk butiran; feed ini tidak menyediakan semakan kandungan penuh oleh GoldFlow.",
   reportedEN:"Publisher feed headline: "+title+". Open the original article for details; GoldFlow has not independently read or verified the full report.",
   verification:"PUBLISHER_HEADLINE_VIA_"+(feed.google?"GOOGLE_NEWS":"DIRECT_RSS"),
   sourceMode:feed.google?"AGGREGATOR_RSS_HEADLINE":"PUBLISHER_DIRECT_RSS_HEADLINE",
   headlineOnly:true,limitation:"Tarikh ialah masa pada feed; atribusi, angka dalam headline dan kandungan penuh belum disahkan bebas.",
   category:flags.category,impact:flags.impact,...mechanism(flags.category),...mechanismEN(flags.category),
   goldStudyOnly:true,priceReactionVerified:false});
  if(out.length>=18)break;
 }
 return out;
}
async function grab(feed,fetcher,now){
 const c=new AbortController(),tm=setTimeout(()=>c.abort(),5500);
 try{
  const r=await fetcher(feed.url,{signal:c.signal,headers:{"Accept":"application/rss+xml, application/xml, text/xml, */*","User-Agent":"GoldFlow-Research-News/8.1.3"},cache:"no-store"});
  if(!r.ok)throw Error("HTTP_"+r.status);
  const xml=await r.text();
  if(xml.length>1250000)throw Error("FEED_TOO_LARGE");
  if(!xml.includes("<rss")&&!xml.includes("<item"))throw Error("RSS_FORMAT_UNAVAILABLE");
  return {key:feed.key,items:parseRss(xml,feed,now),ok:true};
 }catch(e){return {key:feed.key,items:[],ok:false,errorCode:String(e?.name==="AbortError"?"TIMEOUT":e?.message||"FEED_UNAVAILABLE").slice(0,45)}}
 finally{clearTimeout(tm)}
}
export function feedDefinitions(){
 const google=q=>({google:true,domains:["news.google.com"],url:"https://news.google.com/rss/search?q="+encodeURIComponent(q)+"&hl=en-US&gl=US&ceid=US%3Aen"});
 return [
  ...topics.map(t=>({...google(t.query),key:t.key})),
  {key:"BBC_BUSINESS",url:"https://feeds.bbci.co.uk/news/business/rss.xml",domains:["www.bbc.com","www.bbc.co.uk","bbc.com","bbc.co.uk"],publisher:"BBC News",google:false},
  {key:"GUARDIAN_WORLD",url:"https://www.theguardian.com/world/rss",domains:["www.theguardian.com","theguardian.com"],publisher:"The Guardian",google:false},
  {key:"GUARDIAN_BUSINESS",url:"https://www.theguardian.com/business/rss",domains:["www.theguardian.com","theguardian.com"],publisher:"The Guardian",google:false}
 ];
}
export async function collectWorldNews(fetcher=fetch,now=Date.now()){
 const outcomes=await Promise.all(feedDefinitions().map(f=>grab(f,fetcher,now)));
 const seenIds=new Set(),seenTitles=new Set(),items=[];
 for(const entry of [...makeEditorial(now),...outcomes.flatMap(o=>o.items)]){
  const normalized=normalizedTitle(entry.titleEN||entry.title);
  if(seenIds.has(entry.id)||seenTitles.has(normalized))continue;
  seenIds.add(entry.id);seenTitles.add(normalized);items.push(entry);
 }
 const at=s=>Date.parse((s.publishedAtUTC||s.publishedOn+"T12:00:00Z"));
 items.sort((a,b)=>at(b)-at(a));
 const liveItems=outcomes.flatMap(o=>o.items);
 const working=outcomes.filter(o=>o.ok).length;
 return {ok:true,engine:"GF_WORLD_NEWS_MONITOR_V1",updatedAtUTC:new Date(now).toISOString(),
  newsMode:"LIVE_HEADLINES_PLUS_CURATED_SOURCE_ATTRIBUTED",
  sourceStatus:working===outcomes.length?"AVAILABLE":working?"PARTIAL":"LIVE_FEEDS_UNAVAILABLE",
  sourceChecks:outcomes.map(o=>({feed:o.key,status:o.ok?"FETCHED":"UNAVAILABLE",headlineCount:o.items.length,
   errorCode:o.ok?null:o.errorCode})),
  fetchedLiveHeadlines:liveItems.length,curatedCandidates:makeEditorial(now).length,
  pollAfterSeconds:300,items:items.slice(0,45),
  openingWatch:["Tentukan sama ada XAUUSD247 benar-benar ONLINE; terminal MT5 LIVE tidak semestinya pasaran Gold dibuka.",
   "Bandingkan pembukaan Gold dan spread dengan penutupan terakhir; jangan reka fresh M15 semasa hujung minggu.",
   "Semak Brent/WTI, DXY, US2Y, US10Y dan real yields pada timestamp masing-masing.",
   "Tunggu spread stabil, candle M15 sah dan H1/struktur sebelum mempertimbangkan zon BUY/SELL."],
  disclosure:"Publisher headline or source-attributed report, NOT automatic fact-check of article body, release consensus, verified market reaction or broker order. No synthetic prices.",
  fallbackNote:working?"Newest headlines are fetched when this tab is open; some providers may fail.":"External feeds are temporarily unavailable. Dated source-attributed editorial reports remain visible; DO NOT treat them as fresh live headlines."};
}
