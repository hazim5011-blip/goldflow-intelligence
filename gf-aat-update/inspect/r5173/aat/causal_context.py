"""GF-AAT V1.4 profile-aware causal macro/news context.

The engine is deliberately conservative.  It classifies *what kind of driver*
was observed and how fresh that evidence is for each trading profile.  It does
not turn headlines into broker instructions, it does not invent release
surprises, and it never makes past decisions aware of observations that had not
been seen at that timestamp.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from urllib.parse import urlsplit

VERSION = 'GF-AAT-CAUSAL-CONTEXT-1.4.0'

# Faster profiles decay event context sooner.  These are research priors, not
# learned trading settings and not claims of optimality.
PROFILE_DECAY = {
    'SCALPING': {'NEWS': 90*60, 'MACRO': 4*3600, 'MAX_AGE': 24*3600},
    'DAY': {'NEWS': 6*3600, 'MACRO': 24*3600, 'MAX_AGE': 3*86400},
    'SWING': {'NEWS': 36*3600, 'MACRO': 7*86400, 'MAX_AGE': 14*86400},
    'POSITION': {'NEWS': 5*86400, 'MACRO': 21*86400, 'MAX_AGE': 45*86400},
}

OFFICIAL_DOMAIN_SUFFIXES = (
    'federalreserve.gov', 'bls.gov', 'bea.gov', 'treasury.gov',
    'stlouisfed.org', 'newyorkfed.org',
)

DRIVER_RULES = (
    ('REAL_YIELD', re.compile(r'\b(real yield|real rate|tips|dfii10|10[- ]?year real)\b', re.I)),
    ('US2Y', re.compile(r'\b(us ?2y|2[- ]?year treasury|two[- ]?year treasury|dgs2)\b', re.I)),
    ('US10Y', re.compile(r'\b(us ?10y|10[- ]?year treasury|ten[- ]?year treasury|dgs10)\b', re.I)),
    ('USD_DXY', re.compile(r'\b(dxy|dollar index|u\.?s\.? dollar|usd index|broad dollar)\b', re.I)),
    ('FED_POLICY', re.compile(r'\b(federal reserve|\bfed\b|fomc|fed funds|rate cut|rate hike|policy rate|dot plot|powell)\b', re.I)),
    ('CPI_PCE', re.compile(r'\b(cpi|consumer price|pce|personal consumption expenditures|inflation)\b', re.I)),
    ('LABOR_NFP_ADP', re.compile(r'\b(nonfarm|nfp|payroll|adp|unemployment|jobless|employment|jobs report)\b', re.I)),
    ('OIL_INFLATION', re.compile(r'\b(brent|wti|crude|oil price|opec|hormuz|tanker|shipping)\b', re.I)),
    ('GEOPOLITICAL_SAFE_HAVEN', re.compile(r'\b(geopolitical|missile|airstrike|attack|ceasefire|war|sanction|safe haven|trade war|tariff)\b', re.I)),
    ('MARKET_STRESS', re.compile(r'\b(bank crisis|liquidity crisis|default|sovereign debt|market selloff|risk[- ]off)\b', re.I)),
    ('GOLD_DIRECT', re.compile(r'\b(gold|xauusd|bullion|precious metals?)\b', re.I)),
)


def _text(row):
    p = row.get('payload') or {}
    if not isinstance(p, dict): p = {}
    pieces = [row.get('subject'), row.get('source_name'), p.get('headline'), p.get('id'), p.get('name'), p.get('display'), p.get('seriesUrl')]
    return ' '.join(str(x) for x in pieces if x not in (None, ''))


def classify_driver(row):
    text = _text(row)
    for name, rx in DRIVER_RULES:
        if rx.search(text):
            return name
    cat = str((row.get('payload') or {}).get('relevance_category') or '')
    if cat == 'USD_RATES':
        return 'USD_RATES_GENERAL'
    if cat == 'ENERGY_HORMUZ':
        return 'OIL_INFLATION'
    if cat == 'RISK_GEOPOLITICS':
        return 'GEOPOLITICAL_SAFE_HAVEN'
    return 'OTHER_CONTEXT'


def _domain(url):
    try:
        return (urlsplit(url or '').hostname or '').lower()
    except Exception:
        return ''


def _official_domain(url):
    d = _domain(url)
    return bool(d and any(d == suffix or d.endswith('.'+suffix) for suffix in OFFICIAL_DOMAIN_SUFFIXES))


def _source_quality(row):
    p = row.get('payload') or {}
    if not isinstance(p, dict): p = {}
    verified = bool(p.get('verified_primary_source') or p.get('primarySourceVerified'))
    if _official_domain(row.get('source_url')) and row.get('kind') in ('NEWS','MACRO'):
        return 'PRIMARY_OFFICIAL'
    if verified:
        return 'PRIMARY_VERIFIED_BY_TRANSPORT'
    if row.get('kind') == 'NEWS' and str(row.get('source_name') or '').upper().startswith(('FED_', 'BLS_')):
        return 'PRIMARY_OFFICIAL_FEED'
    return 'SECONDARY_OR_UNVERIFIED'


def _number(value):
    if isinstance(value, (int,float)) and math.isfinite(float(value)):
        return float(value)
    if isinstance(value, str):
        m = re.search(r'[-+]?\d+(?:\.\d+)?', value.replace(',', ''))
        if m:
            try:
                return float(m.group(0))
            except Exception:
                pass
    return None


def _row_numeric_value(row):
    p = row.get('payload') or {}
    if not isinstance(p, dict): p = {}
    for k in ('value','actual','last','close','rate','yield'):
        if k in p:
            v = _number(p.get(k))
            if v is not None:
                return v
    return _number(p.get('display'))


def _movement(current, previous):
    if current is None or previous is None:
        return 'UNKNOWN'
    tol = max(abs(previous), 1.0) * 1e-8
    if current > previous + tol:
        return 'UP'
    if current < previous - tol:
        return 'DOWN'
    return 'FLAT'


def gold_implication(driver, movement):
    """Return a conditional research implication, never a signal."""
    if movement not in ('UP','DOWN'):
        if driver == 'GEOPOLITICAL_SAFE_HAVEN':
            return 'CONDITIONAL_SAFE_HAVEN_SUPPORT_REQUIRES_PRICE_CONFIRMATION'
        if driver == 'OIL_INFLATION':
            return 'MIXED_INFLATION_AND_RISK_CHANNELS_REQUIRE_CONFIRMATION'
        return 'DIRECTION_UNKNOWN_WITHOUT_VERIFIED_CHANGE_OR_SURPRISE'
    if driver in ('USD_DXY','US2Y','US10Y','REAL_YIELD'):
        return 'GOLD_HEADWIND_IF_PERSISTENT' if movement == 'UP' else 'GOLD_SUPPORT_IF_PERSISTENT'
    return 'DIRECTION_REQUIRES_VERIFIED_SURPRISE_AND_MARKET_REACTION'


def _base_relevance(row):
    p = row.get('payload') or {}
    if not isinstance(p, dict):
        p = {}
    if row.get('kind') == 'NEWS':
        raw = p.get('relevance_score')
        try:
            score = float(raw or 0)
        except (TypeError, ValueError):
            # Legacy/archive rows may carry labels such as HIGH instead of a number.
            score = {'LOW':1.0,'MEDIUM':3.0,'HIGH':5.0}.get(str(raw or '').upper(),0.0)
        if not math.isfinite(score):
            score = 0.0
        return max(0.0, min(5.0, score))
    q = _source_quality(row)
    return 5.0 if q.startswith('PRIMARY_') else 3.0


def _weight(profile, kind, event_time, asof, base):
    cfg = PROFILE_DECAY[profile]
    age = max(0, int(asof)-int(event_time))
    if age > cfg['MAX_AGE']:
        return 0.0, age
    hl = max(1, int(cfg.get(kind, cfg['NEWS'])))
    w = float(base) * (0.5 ** (age/hl))
    return round(w, 6), age


def _latest_receipt(store, observation_id, asof):
    if hasattr(store, 'latest_observation_receipt'):
        return store.latest_observation_receipt(observation_id, asof)
    return None


def snapshot(store, profile, asof, limit=400):
    profile = profile.upper()
    if profile not in PROFILE_DECAY:
        raise ValueError('Unknown profile')
    asof = int(asof)
    rows = store.observations(asof, limit=limit)

    # Track only information genuinely known by asof.  For numeric macro series,
    # previous values are resolved chronologically within the known archive.
    macro_rows = [r for r in rows if r.get('kind') == 'MACRO']
    previous_by_subject = {}
    movement_by_id = {}
    for row in sorted(macro_rows, key=lambda x:(int(x.get('first_seen_utc') or 0), str(x.get('id') or ''))):
        key = (row.get('source_name'), row.get('subject'))
        cur = _row_numeric_value(row)
        movement_by_id[row.get('id')] = _movement(cur, previous_by_subject.get(key))
        if cur is not None:
            previous_by_subject[key] = cur

    items = []
    timestamp_issues = []
    for row in rows:
        if row.get('kind') not in ('NEWS','MACRO'):
            continue
        first_seen = int(row.get('first_seen_utc') or 0)
        published = row.get('source_published_utc')
        if first_seen > asof or (published is not None and int(published) > asof):
            continue
        if published is not None and int(published) > first_seen + 300:
            timestamp_issues.append({'observation_id':row.get('id'),'issue':'PUBLICATION_AFTER_FIRST_OBSERVATION'})
            continue
        event_time = int(published) if published is not None else first_seen
        base = _base_relevance(row)
        weight, age = _weight(profile, row.get('kind'), event_time, asof, base)
        if weight <= 0:
            continue
        driver = classify_driver(row)
        movement = movement_by_id.get(row.get('id'),'UNKNOWN') if row.get('kind') == 'MACRO' else 'UNKNOWN'
        receipt = _latest_receipt(store, row.get('id'), asof)
        p = row.get('payload') or {}
        if not isinstance(p, dict): p = {}
        item = {
            'observation_id':row.get('id'), 'kind':row.get('kind'), 'driver':driver,
            'subject':row.get('subject'), 'source_name':row.get('source_name'), 'source_url':row.get('source_url'),
            'published_at_utc':int(published) if published is not None else None,
            'first_observed_at_utc':first_seen,
            'retrieved_at_utc':int(receipt['retrieved_at_utc']) if receipt else first_seen,
            'source_quality':_source_quality(row), 'age_seconds':age,
            'base_relevance':base, 'profile_relevance':weight,
            'movement':movement, 'gold_implication':gold_implication(driver,movement),
            'headline':p.get('headline') if row.get('kind') == 'NEWS' else None,
            'data_period':p.get('data_period') or p.get('date'),
            'numeric_value':_row_numeric_value(row),
            'payload_hash':row.get('payload_sha256'),
            'direction_is_conditional_not_signal':True,
        }
        items.append(item)

    items.sort(key=lambda x:(x['profile_relevance'], x['first_observed_at_utc']), reverse=True)
    drivers = {}
    for x in items:
        d = drivers.setdefault(x['driver'], {'driver':x['driver'],'evidence_count':0,'peak_relevance':0.0,'total_relevance':0.0,'implications':set(),'source_quality':set()})
        d['evidence_count'] += 1
        d['peak_relevance'] = max(d['peak_relevance'], float(x['profile_relevance']))
        d['total_relevance'] += float(x['profile_relevance'])
        d['implications'].add(x['gold_implication'])
        d['source_quality'].add(x['source_quality'])
    summary = []
    for d in drivers.values():
        summary.append({
            'driver':d['driver'],'evidence_count':d['evidence_count'],
            'peak_relevance':round(d['peak_relevance'],6),'total_relevance':round(d['total_relevance'],6),
            'implications':sorted(d['implications']),'source_quality':sorted(d['source_quality'])
        })
    summary.sort(key=lambda x:(x['peak_relevance'],x['total_relevance']),reverse=True)
    high = [x for x in items if x['profile_relevance'] >= 2.0]
    # Do not fingerprint continuously decaying numeric weights; otherwise a
    # normal refresh would look like a meaningful state change. Membership,
    # driver identity and verified movement are stable until evidence truly changes.
    signature_payload = [(x['observation_id'],x['driver'],x['movement']) for x in high[:12]]
    signature = hashlib.sha256(json.dumps(signature_payload,separators=(',',':'),sort_keys=True).encode()).hexdigest()[:20]
    return {
        'version':VERSION,'profile':profile,'asof_utc':asof,
        'status':'PROFILE_CAUSAL_CONTEXT_AVAILABLE' if items else 'CONTEXT_UNAVAILABLE',
        'profile_decay_seconds':dict(PROFILE_DECAY[profile]),
        'dominant_drivers':summary[:8], 'evidence':items[:30],
        'high_relevance_count':len(high),'high_relevance_signature':signature,
        'timestamp_integrity':{'publication_observation_retrieval_separated':True,'issues':timestamp_issues,'issue_count':len(timestamp_issues)},
        'causal_guardrails':[
            'Evidence is visible only after first observation time.',
            'Publication, first observation and retrieval timestamps are separate.',
            'Headlines do not provide verified economic surprise values.',
            'Conditional Gold implications never authorize an entry or override broker invalidation.'
        ],
        'can_authorize_entry':False,'can_override_broker_invalidation':False,'orders_sent':0,
    }
