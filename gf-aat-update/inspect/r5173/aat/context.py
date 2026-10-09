"""Independent observations available at a decision timestamp.

V1.1 keeps the append-only raw archive but promotes only market-relevant,
deduplicated headlines to the decision/dashboard context. It never converts a
headline into a trade direction or a verified article claim.
"""
import time,re,hashlib

VERSION='aat-observed-external-context-1.1.0'

def _norm_headline(s):
    return re.sub(r'\W+',' ',(s or '').lower()).strip()

def _fallback_relevance(title):
    # Backward compatibility for V1.0 rows that predate explicit relevance tags.
    t=(title or '').lower()
    if any(x in t for x in ('gold','xauusd','bullion')):return 5,'GOLD_DIRECT'
    if any(x in t for x in ('federal reserve','fomc','treasury','yield','inflation','cpi','pce','payroll','unemployment','dollar')):return 4,'USD_RATES'
    if any(x in t for x in ('hormuz','iran','tanker','shipping','brent','crude','opec','oil price','oil export')):return 4,'ENERGY_HORMUZ'
    if any(x in t for x in ('missile','airstrike','ceasefire','geopolitical','tariff')):return 3,'RISK_GEOPOLITICS'
    return 0,'UNCLASSIFIED'

def snapshot(store,asof=None,news_window=72*3600,limit=120):
    asof=int(time.time()) if asof is None else int(asof)
    rows=store.observations(asof,limit=limit)
    news_candidates=[];macro=[];unverified=0;filtered=0
    for row in rows:
        if int(row['first_seen_utc'])>asof:continue
        if row['source_published_utc'] is not None and row['source_published_utc']>asof:continue
        p=row['payload']
        receipt=store.latest_observation_receipt(row['id'],asof) if hasattr(store,'latest_observation_receipt') else None
        proof={'kind':row['kind'],'source_name':row['source_name'],
            'source_url':row['source_url'],'source_published_utc':row['source_published_utc'],
            'first_seen_utc':row['first_seen_utc'],
            'retrieved_at_utc':receipt['retrieved_at_utc'] if receipt else row['first_seen_utc'],
            'hash':row['payload_sha256']}
        if row['kind']=='NEWS':
            if asof-row['first_seen_utc']>news_window:continue
            unverified+=1
            score=p.get('relevance_score');cat=p.get('relevance_category')
            if score is None:score,cat=_fallback_relevance(p.get('headline',''))
            score=int(score or 0)
            proof.update({'headline':p.get('headline',''),'headline_only':True,'full_article_verified':False,
                          'relevance_score':score,'relevance_category':cat or 'UNCLASSIFIED',
                          'display_candidate':bool(score>=3)})
            if score>=3:news_candidates.append(proof)
            else:filtered+=1
        elif row['kind']=='MACRO':
            proof.update({'data_period':p.get('data_period'),
                          'primary_verified':bool(p.get('verified_primary_source',False)) and not p.get('supplied_by_api')})
            macro.append(proof)
    # Cross-source duplicate suppression for presentation only. Raw rows remain untouched.
    best={}
    for x in news_candidates:
        key=_norm_headline(x['headline']) or x['hash']
        cur=best.get(key)
        rank=(x['relevance_score'],x['source_published_utc'] or 0,x['first_seen_utc'])
        if cur is None or rank>(cur['_rank']):best[key]={**x,'_rank':rank}
    news=[{k:v for k,v in x.items() if k!='_rank'} for x in best.values()]
    news.sort(key=lambda x:(x['relevance_score'],x['source_published_utc'] or 0,x['first_seen_utc']),reverse=True)
    macro.sort(key=lambda x:(bool(x.get('primary_verified')),x.get('first_seen_utc',0)),reverse=True)
    return {'status':'RECORDED_CONTEXT_ONLY' if news or macro else 'CONTEXT_UNAVAILABLE',
        'asof_utc':asof,'news':news[:15],'macro':macro[:12],
        'unverified_headline_count':unverified,'market_relevant_news_count':len(news),
        'filtered_low_relevance_news_count':filtered,
        'can_override_broker_invalidation':False,'can_authorize_entry':False,
        'surprise_or_price_reaction_claimed':False,
        'source_quality':'RELEVANCE_FILTERED_HEADLINES_NEED_ARTICLE_CROSSCHECK',
        'version':VERSION}
