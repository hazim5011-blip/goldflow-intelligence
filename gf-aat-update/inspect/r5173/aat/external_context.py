"""GF-AAT V1.0 raw external-context collectors.

GoldFlow /api/macro is consumed only as a transport for source-labelled raw
observations. Derived regime/goldImpact/score fields are deliberately ignored.
"""
import json,time
from urllib.request import Request,urlopen
from urllib.parse import urlsplit

VERSION='GF-AAT-EXTERNAL-CONTEXT-1.0.0'
ALLOWED_STATUS={'OFFICIAL','DERIVED'}


def _get_json(url):
    u=urlsplit(url)
    if u.scheme!='https' and not (u.scheme=='http' and u.hostname in ('127.0.0.1','localhost')):
        raise ValueError('External context endpoint must be HTTPS or loopback')
    req=Request(url,headers={'Accept':'application/json','User-Agent':'GF-AAT-Research/1.0'})
    with urlopen(req,timeout=12) as r:
        if r.status!=200:raise RuntimeError('HTTP '+str(r.status))
        raw=r.read(2_000_000)
    return json.loads(raw)


def pull_goldflow_macro(store,website_url,fetch=None,now=None):
    now=int(time.time()) if now is None else int(now);fetch=fetch or _get_json
    data=fetch(website_url.rstrip('/')+'/api/macro')
    if data.get('ok') is not True:raise ValueError('Macro endpoint not OK')
    report={'stored':0,'skipped':0,'source':'GOLDFLOW_MACRO_TRANSPORT','derived_fields_ignored':True}
    for card in data.get('cards') or []:
        status=str(card.get('status') or '').upper()
        source=str(card.get('source') or '').strip()
        name=str(card.get('name') or card.get('id') or '').strip()
        if not name or not source or status not in ALLOWED_STATUS:
            report['skipped']+=1;continue
        payload={k:card.get(k) for k in ('id','name','value','display','date','source','seriesUrl','frequency','status','primarySourceVerified') if k in card}
        payload.update({'data_period':card.get('date'),'verified_primary_source':bool(card.get('primarySourceVerified')),
                        'transport':'GoldFlow /api/macro raw card only','derived_regime_used':False,'gold_impact_used':False})
        url=card.get('seriesUrl') if str(card.get('seriesUrl') or '').startswith('https://') else None
        store.save_observation('MACRO','USD_MACRO:'+name,source,payload,observed_at=now,published_at=None,source_url=url,
                               retrieved_at=now,transport='GOLDFLOW_MACRO_TRANSPORT',retrieval_meta={'endpoint':'/api/macro'})
        report['stored']+=1
    return report
