"""GF-AAT V1.1 market-context headline collector.

Headlines are archived as first-seen evidence, but only sufficiently relevant
items are promoted into the user-facing market context.  A headline never
becomes a BUY/SELL instruction and is never treated as a verified full article.
"""
import urllib.request, xml.etree.ElementTree as ET, re, time, email.utils, hashlib
from urllib.parse import urlsplit

VERSION='GF-AAT-RAW-NEWS-1.1.0'
FEEDS={
 'FED_PRESS':'https://www.federalreserve.gov/feeds/press_all.xml',
 'BLS_EMPLOYMENT':'https://www.bls.gov/feed/empsit.rss',
 'BLS_CPI':'https://www.bls.gov/feed/cpi.rss',
 'BBC_WORLD':'https://feeds.bbci.co.uk/news/world/rss.xml',
 'BBC_BUSINESS':'https://feeds.bbci.co.uk/news/business/rss.xml',
 'GUARDIAN_BUSINESS':'https://www.theguardian.com/business/rss',
}

# Scores are relevance weights, NOT trading-direction weights.
RULES=(
 ('GOLD_DIRECT',5,re.compile(r'\b(gold|xauusd|bullion|precious metals?)\b',re.I)),
 ('USD_RATES',4,re.compile(r'\b(federal reserve|\bfed\b|fomc|treasur(?:y|ies)|bond yields?|real yields?|dxy|u\.?s\.? dollar|dollar index|rate cuts?|rate hikes?|interest rates?|cpi|pce|inflation|nonfarm|payrolls?|unemployment|jobs report)\b',re.I)),
 ('ENERGY_HORMUZ',4,re.compile(r'\b(hormuz|iran|tanker|shipping|brent|crude|opec\+?|oil prices?|oil exports?|middle east|sanctions?)\b',re.I)),
 ('RISK_GEOPOLITICS',3,re.compile(r'\b(missile|airstrike|attack(?:ed|s)?|ceasefire|geopolitical|trade war|tariffs?)\b',re.I)),
 ('MARKET_STRESS',3,re.compile(r'\b(bank crisis|liquidity crisis|default|sovereign debt|market selloff|risk[- ]off|safe haven)\b',re.I)),
)
LOW_SIGNAL=re.compile(r'\b(energy costs?|war|military)\b',re.I)
HISTORICAL_CONTEXT=re.compile(r'\b(world war (?:i|ii|one|two)|second world war|first world war)\b',re.I)

def score_headline(title):
    title=' '.join((title or '').split())
    cats=[];terms=[];score=0
    for cat,w,rx in RULES:
        ms=[m.group(0) for m in rx.finditer(title)]
        if ms:
            cats.append(cat);terms.extend(ms[:3]);score=max(score,w)
    # Generic words alone are intentionally insufficient for promotion.
    if score==0 and LOW_SIGNAL.search(title):score=1;cats=['LOW_SIGNAL_CONTEXT'];terms=[LOW_SIGNAL.search(title).group(0)]
    if HISTORICAL_CONTEXT.search(title) and score<=3:
        score=min(score,1);cats=['LOW_SIGNAL_HISTORICAL_CONTEXT']
    category=cats[0] if cats else 'UNCLASSIFIED'
    return {'relevance_score':int(score),'relevance_category':category,
            'matched_terms':sorted(set(x.lower() for x in terms))[:8],
            'display_candidate':bool(score>=3)}

def _fingerprint(title):
    x=re.sub(r'\W+',' ',title.lower()).strip()
    return hashlib.sha256(x.encode()).hexdigest()[:20]

def pull_public_headlines(store,fetch=None,now=None):
    now=int(time.time()) if now is None else int(now)
    def real_fetch(url):
        req=urllib.request.Request(url,headers={'User-Agent':'GF-AAT-Research/1.1','Accept':'application/rss+xml, text/xml'})
        with urllib.request.urlopen(req,timeout=7) as x:return x.read(1_000_000)
    fetch=fetch or real_fetch
    report={}
    for name,url in FEEDS.items():
        stored=promoted=0
        try:
            data=fetch(url)
            if len(data)>=1_000_000:raise ValueError('Oversized RSS')
            root=ET.fromstring(data)
            for item in root.findall('.//item')[:60]:
                title=' '.join((item.findtext('title') or '').split())[:320]
                rel=score_headline(title)
                if rel['relevance_score']<=0:continue
                raw=(item.findtext('pubDate') or '').strip()
                try: published=int(email.utils.parsedate_to_datetime(raw).timestamp())
                except Exception:continue
                if published>now+300 or now-published>72*3600:continue
                link=(item.findtext('link') or '').strip()
                if urlsplit(link).scheme!='https':continue
                payload={'headline':title,'headline_fingerprint':_fingerprint(title),'feed_date_utc':published,
                         'headline_only':True,'verified_full_article':False,'automatic_price_direction':None,**rel}
                store.save_observation('NEWS','MARKET',name,payload,observed_at=now,published_at=published,source_url=link,
                                       retrieved_at=now,transport='RSS_FETCH',retrieval_meta={'feed':name})
                stored+=1;promoted+=int(rel['display_candidate'])
            report[name]={'ok':True,'stored_headlines':stored,'market_display_candidates':promoted}
        except Exception as e:report[name]={'ok':False,'error':type(e).__name__}
    return report
