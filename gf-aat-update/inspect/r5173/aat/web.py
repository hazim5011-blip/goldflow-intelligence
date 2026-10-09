"""Local-only FastAPI research dashboard with admin-authorized data mutations.
Not exposed via Cloudflare. Never store broker credentials in browser JavaScript.
"""
import os,time,secrets
from pathlib import Path
from fastapi import FastAPI,HTTPException,Header,Query
from fastapi.responses import HTMLResponse
from pydantic import BaseModel,Field
from .settings import Settings,PROFILE_TF,PROFILE_REQUIRED_TF,PROFILE_OPTIONAL_TF,TF_SECONDS
from .service import ResearchService,FETCH_TFS
from .mentor import explain,requested_profile
from .knowledge import briefing,TOPICS,VERSION as KNOWLEDGE_VERSION
from .forensics import inspect_archive,inspect_market_event,VERSION as FORENSIC_VERSION
from .collector import import_csv
from .raw_news import pull_public_headlines
from .external_context import pull_goldflow_macro
from .lifecycle import mark_paper_entry
from .trading_curriculum import curriculum_summary,VERSION as CURRICULUM_VERSION
from .knowledge_scout import snapshot as knowledge_scout_snapshot, run_scout as run_knowledge_scout, VERSION as KNOWLEDGE_SCOUT_VERSION

BUILD_ID='gf-aat-1.6.3-r5.17.3-structural-entry-geometry'
RUNTIME_REVISION='R5.17.3'
API_CONTRACT='mission-asset-fleet-cognitive-reasoning-contextual-playbook-context-lens-pattern-brain-adaptive-tools-knowledge-scout-outcomes-closed-loop-lessons-false-block-correction-effectiveness-v15'
service=ResearchService()
BOOT_UTC=int(time.time())
app=FastAPI(title='GF-AAT Independent Robot • RESEARCH ONLY',version='1.6.3-r5.17.3',docs_url=None,redoc_url=None)

def guard(token):
    expected=os.getenv('AAT_ADMIN_TOKEN','')
    if len(expected)<24:raise HTTPException(503,'Admin changes disabled until AAT_ADMIN_TOKEN has 24+ characters')
    if not token or not secrets.compare_digest(expected,token):raise HTTPException(403,'Admin token invalid')

def broker_name():
    x=service.store.db.execute('SELECT broker FROM candles WHERE symbol=? GROUP BY broker ORDER BY COUNT(*) DESC LIMIT 1',(service.settings.symbol,)).fetchone()
    return x['broker'] if x else None

class CollectInput(BaseModel):
    initial:bool=False
    timeframes:list[str]=Field(default_factory=lambda:list(FETCH_TFS))
class ObserveInput(BaseModel):
    kind:str
    subject:str
    source_name:str
    source_url:str|None=None
    source_published_utc:int|None=None
    payload:dict
class ChatInput(BaseModel):
    message:str=Field(min_length=1,max_length=1000)
    profile:str='SCALPING'
    signal_id:str|None=None

@app.get('/',response_class=HTMLResponse)
def homepage():return Path(__file__).with_name('dashboard.html').read_text(encoding='utf-8')

@app.get('/api/ping')
def ping():
    # Deliberately DB-free.  The startup supervisor calls this frequently and
    # must not contend with dashboard/research SQLite work.
    return {'ok':True,'status':'ALIVE','system':'GF-AAT independent',
            'version':'1.6.3-r5.17.3','runtime_revision':RUNTIME_REVISION,
            'build_id':BUILD_ID,
            'api_contract':API_CONTRACT,
            'uptime_seconds':max(0,int(time.time())-BOOT_UTC),
            'read_only_broker':True,'auto_order_execution':False,'orders_sent':0}

@app.get('/api/health')
def health():
    return {'ok':True,'status':'RESEARCH_ONLY','connected_live_broker':False, # health endpoint alone cannot prove live quote
      'system':'GF-AAT independent','server_local_only':True,'runtime_revision':RUNTIME_REVISION,
      'build_id':BUILD_ID,'api_contract':API_CONTRACT,'research_only':True,'auto_order_execution':False,'orders_sent':0,
      'mission_version':'GF-AAT-MISSION-1.0.0','asset_brain_version':'GF-AAT-ASSET-BRAIN-1.0.0',
      'fleet_version':'GF-AAT-ROBOT-FLEET-1.0.0','cognitive_brain_version':'GF-AAT-COGNITIVE-RESEARCH-BRAIN-1.8.0','professional_reasoning_version':'GF-AAT-PRO-REASONING-COUNCIL-1.2.0','scalping_campaign_version':'GF-AAT-SCALPING-CAMPAIGN-1.2.0','trade_coach_version':'GF-AAT-PRO-TRADE-COACH-1.0.0','entry_playbook_version':'GF-AAT-CONTEXTUAL-ENTRY-PLAYBOOK-1.0.0','signal_outcome_tracker_version':'GF-AAT-SIGNAL-OUTCOME-TRACKER-1.1.0','operational_state_version':'GF-AAT-OPERATIONAL-STATE-1.0.0',
      **service.diagnostics()}

@app.get('/api/mission')
def mission():
    # R5.3: additive/non-fatal mission module. Core R4 runtime must stay alive
    # even if a newly-copied optional architecture module is damaged or absent.
    try:
        from .mission import manifest
        return {'ok':True,**manifest()}
    except Exception as exc:
        return {'ok':False,'status':'OPTIONAL_MODULE_UNAVAILABLE','module':'mission',
                'error':type(exc).__name__+': '+str(exc)[:180],
                'research_paper_only':True,'auto_order_execution':False,'orders_sent':0}

@app.get('/api/asset-brain')
def asset_brain():
    try:
        from .asset_brain import build_asset_brain
        return {'ok':True,**build_asset_brain(service.settings.symbol)}
    except Exception as exc:
        return {'ok':False,'status':'OPTIONAL_MODULE_UNAVAILABLE','module':'asset_brain',
                'symbol':service.settings.symbol,'error':type(exc).__name__+': '+str(exc)[:180],
                'missing_optional_context_blocks_research':False,'orders_sent':0}

@app.get('/api/fleet')
def fleet():
    try:
        from .fleet import build_fleet
        return {'ok':True,**build_fleet(service)}
    except Exception as exc:
        # Fleet presentation must never take down the core market research API.
        return {'ok':False,'status':'OPTIONAL_MODULE_UNAVAILABLE','module':'fleet',
                'error':type(exc).__name__+': '+str(exc)[:180],
                'profiles':{},'dropdown_affects_view_only':True,'orders_sent':0}

@app.get('/api/cognitive/{profile}')
def cognitive(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    try:
        from .cognitive_brain import build as build_cognitive
        from .asset_brain import build_asset_brain
        from .fleet import build_fleet
        bundle=service.decision(b,profile)
        try:live=service.live_feed()
        except Exception as exc:live={'quote_status':'UNAVAILABLE','error':type(exc).__name__}
        try:fleet_profile=(build_fleet(service,b).get('profiles') or {}).get(profile,{})
        except Exception:fleet_profile={}
        events=service.store.recent_canonical_market_events(profile,limit=4)
        return {'ok':True,**build_cognitive(profile,bundle,live,build_asset_brain(service.settings.symbol),fleet_profile,events)}
    except Exception as exc:
        return {'ok':False,'status':'OPTIONAL_MODULE_UNAVAILABLE','module':'cognitive_brain','profile':profile,
                'error':type(exc).__name__+': '+str(exc)[:180],'research_only':True,'orders_sent':0}

@app.get('/api/reasoning/{profile}')
def professional_reasoning(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    try:
        from .pro_reasoning import build as build_reasoning
        from .asset_brain import build_asset_brain
        from .fleet import build_fleet
        bundle=service.decision(b,profile)
        try:live=service.live_feed()
        except Exception as exc:live={'quote_status':'UNAVAILABLE','error':type(exc).__name__}
        try:fleet_profile=(build_fleet(service,b).get('profiles') or {}).get(profile,{})
        except Exception:fleet_profile={}
        return {'ok':True,**build_reasoning(profile,bundle,live,build_asset_brain(service.settings.symbol),fleet_profile)}
    except Exception as exc:
        return {'ok':False,'status':'OPTIONAL_MODULE_UNAVAILABLE','module':'professional_reasoning','profile':profile,
                'error':type(exc).__name__+': '+str(exc)[:180],'research_only':True,'orders_sent':0}

@app.get('/api/scalping-campaign')
def scalping_campaign():
    b=broker_name()
    if not b:return {'ok':False,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    try:
        return {'ok':True,**service.scalping_campaign(b)}
    except Exception as exc:
        return {'ok':False,'status':'OPTIONAL_MODULE_UNAVAILABLE','module':'scalping_campaign',
                'error':type(exc).__name__+': '+str(exc)[:180],'research_only':True,'orders_sent':0}

@app.get('/api/profiles')
def profiles():return {'ok':True,'profiles':{x:{'entry_tf':y[0],
   'context_tfs':list(dict.fromkeys(y[1:])),
   'mandatory_tfs':list(PROFILE_REQUIRED_TF[x]),
   'optional_tfs':list(PROFILE_OPTIONAL_TF[x]),
   'minimum_closed_candles_per_used_tf':80} for x,y in PROFILE_TF.items()}}

@app.get('/api/live-feed')
def live_feed():
    return {'ok':True,**service.live_feed()}

@app.get('/api/coverage')
def coverage():
    broker=broker_name()
    return {'ok':bool(broker),'broker':broker,'symbol':service.settings.symbol,
       'frames':{tf:service.store.latest(broker,service.settings.symbol,tf) for tf in FETCH_TFS} if broker else {}}

@app.get('/api/candles')
def candles(tf:str='M5',limit:int=Query(150,ge=10,le=500)):
    broker=broker_name()
    if not broker or tf not in TF_SECONDS:raise HTTPException(404,'Broker history/TF unavailable')
    rows=service.store.candles(broker,service.settings.symbol,tf,limit)
    return {'ok':True,'source':'OWN_RAW_MT5_ARCHIVE','tf':tf,'broker':broker,'symbol':service.settings.symbol,
      'historical_not_forward_signal_proof':True,
      'bars':[{'t':x.t,'o':x.o,'h':x.h,'l':x.l,'c':x.c,'v':x.v,'first_seen_utc':x.first_seen_utc} for x in rows]}

@app.get('/api/study/{profile}')
def study(profile:str):
    if profile.upper() not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:raise HTTPException(503,'No broker archive yet; first run COLLECT BACKFILL')
    return service.study(b,profile.upper())

@app.get('/api/signals')
def signals(limit:int=Query(50,ge=1,le=150),profile:str|None=None):
    from .signal_outcomes import evaluate_signal, profile_summary
    q='SELECT id FROM signals';args=[]
    chosen=None
    if profile:
        chosen=profile.upper()
        if chosen not in PROFILE_TF:raise HTTPException(400,'Unknown profile')
        q+=' WHERE profile=?';args.append(chosen)
    q+=' ORDER BY created_at_utc DESC LIMIT ?';args.append(limit)
    now=int(time.time());out=[]
    for r in service.store.db.execute(q,args):
        sig=service.store.signal(r['id'])
        out.append({**sig,'research_outcome':evaluate_signal(service.store,sig,now),
                    'signal_self_review':service.store.signal_self_review(sig['id']),
                    'closed_loop_review':service.store.closed_loop_review(sig['id'])})
    summary=None
    if chosen:
        b=broker_name()
        if b:summary=profile_summary(service.store,b,service.settings.symbol,chosen,now,limit=max(limit,100))
    return {'ok':True,'mode':'FORWARD_SETUP_LOG_WITH_POST_T0_OUTCOME_AUDIT','signals':out,'summary':summary,
            'cancel_or_expire_before_entry_is_not_a_loss':True,'orders_sent':0}

@app.get('/api/signal-outcomes/{profile}')
def signal_outcomes(profile:str,limit:int=Query(100,ge=1,le=300)):
    from .signal_outcomes import profile_summary
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    return {'ok':True,**profile_summary(service.store,b,service.settings.symbol,profile,int(time.time()),limit)}

@app.get('/api/live-signal/{profile}')
def live_signal(profile:str):
    from .signal_outcomes import build_live_signal
    from .cognitive_brain import build as build_cognitive
    from .asset_brain import build_asset_brain
    from .fleet import build_fleet
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    try:
        bundle=service.decision(b,profile)
        try: live=service.live_feed()
        except Exception: live={}
        try: fleet_profile=(build_fleet(service,b).get('profiles') or {}).get(profile,{})
        except Exception: fleet_profile={}
        events=service.store.recent_canonical_market_events(profile,limit=4)
        cognitive=build_cognitive(profile,bundle,live,build_asset_brain(service.settings.symbol),fleet_profile,events)
    except Exception:
        cognitive={}
    return {'ok':True,**build_live_signal(service.store,b,service.settings.symbol,profile,cognitive,int(time.time()),live)}

@app.get('/api/memory/{profile}')
def research_memory(profile:str,limit:int=Query(12,ge=1,le=50)):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    recent=service.store.recent_research(profile,limit=limit)
    signals=service.store.db.execute('''SELECT id FROM signals WHERE profile=? AND broker=?
        AND symbol=? ORDER BY created_at_utc DESC LIMIT ?''',
        (profile,b or '',service.settings.symbol,limit)).fetchall()
    forward=[]
    for row in signals:
        sig=service.store.signal(row['id'])
        events=service.store.events(sig['id'])
        forward.append({'id':sig['id'],'side':sig['side'],'state':sig['state'],
           'created_at_utc':sig['created_at_utc'],'origin_candle_open_utc':sig['origin_candle_open_utc'],
           'entry_low':sig['entry_low'],'entry_high':sig['entry_high'],'sl':sig['sl'],
           'last_event':{k:events[-1][k] for k in ('event_type','to_state','reason','created_at_utc')} if events else None,
           'hash_chain_valid':service.store.verify_chain(sig['id']),
           'provenance':'FORWARD_SIGNAL_NOT_BROKER_ORDER'})
    return {'ok':True,'profile':profile,'broker':b,'symbol':service.settings.symbol,
       'retrospective_or_forward_studies':[{'id':x['id'],'candle_open_utc':x['analyzed_candle_open_utc'],
          'analyzed_at_utc':x['analyzed_at_utc'],'status':x['status'],'side':x['side'],
          'score':x['score'],'source_mode':x['source_mode'],'algorithm':x['algo_version']}
          for x in recent],
       'forward_signals':forward,
       'checkpoint':service.store.checkpoint(b,service.settings.symbol,profile,__import__('aat.structure',fromlist=['ALGORITHM']).ALGORITHM) if b else None,
       'study_results_are_not_forward_trade_performance':True,'actual_broker_orders':0}

@app.get('/api/behaviour')
def behaviour(profile:str='SCALPING',limit:int=Query(16,ge=1,le=100)):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(400,'Unknown profile')
    b=broker_name()
    rows=service.store.db.execute("SELECT id FROM signals WHERE profile=? AND broker=? AND symbol=? ORDER BY created_at_utc DESC LIMIT 12",(profile,b or '',service.settings.symbol)).fetchall()
    result=[]
    for row in rows:
        s=service.store.signal(row['id'])
        reviews=service.store.behaviour_reviews(s['id'],limit=limit)
        result.append({'signal_id':s['id'],'profile':profile,'side':s['side'],'signal_state':s['state'],
            'original_sl':s['sl'],'recent_behaviour':reviews,
            'event_hash_chain_valid':service.store.verify_chain(s['id'])})
    return {'ok':True,'mode':'RESEARCH_ONLY','symbol':service.settings.symbol,
            'algorithm':'aat-adaptive-market-behaviour-0.3.0','records':result,
            'no_broker_orders':True,'past_patterns_not_live_trades':True}

@app.get('/api/curriculum')
def curriculum():
    return {'ok':True,**curriculum_summary(),'orders_sent':0}

@app.get('/api/teacher/{profile}')
def teacher(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    return {'ok':True,'profile':profile,'teaching':service.teacher(b,profile),'orders_sent':0}

@app.get('/api/knowledge')
def knowledge(q:str='',limit:int=Query(3,ge=1,le=5)):
    if q.strip():data=briefing(q,limit)
    else:data={'topics':[dict(x) for x in TOPICS],
        'knowledge_is_codified_playbook_not_model_weights':True,
        'market_data_must_be_fetched_and_time_verified_separately':True}
    return {'ok':True,'version':KNOWLEDGE_VERSION,**data,'topic_count':len(TOPICS),
        'autonomous_knowledge_scout_enabled':True,'knowledge_scout_version':KNOWLEDGE_SCOUT_VERSION,
        'internet_findings_are_candidates_not_active_rules':True,'real_orders_sent':0}

@app.get('/api/knowledge-scout')
def knowledge_scout(limit:int=Query(12,ge=1,le=30)):
    return {'ok':True,**knowledge_scout_snapshot(service.store,limit=limit),'orders_sent':0}

@app.post('/api/admin/knowledge-scout/run')
def knowledge_scout_run(x_aat_admin:str|None=Header(default=None)):
    guard(x_aat_admin)
    # Admin-only manual run. Normal operation is automatic in the research loop.
    return {'ok':True,'report':run_knowledge_scout(service.store,max_topics=2),'orders_sent':0}

@app.get('/api/pattern-brain/{profile}')
def pattern_brain(profile:str,limit:int=Query(12,ge=1,le=50)):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    bundle=service.decision(b,profile)
    return {'ok':True,'profile':profile,'current':bundle.get('pattern_brain') or {},
            'recent_saved':service.store.recent_pattern_observations(profile,limit),'orders_sent':0}

@app.get('/api/tool-selection/{profile}')
def tool_selection(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','orders_sent':0}
    bundle=service.decision(b,profile)
    return {'ok':True,'profile':profile,'selection':bundle.get('adaptive_tools') or {},'orders_sent':0}

@app.get('/api/forensics')
def forensic_archive(limit:int=Query(8,ge=1,le=30)):
    b=broker_name()
    return {'ok':bool(b),'version':FORENSIC_VERSION,
      'cases':service.store.recent_forensic_cases(b,service.settings.symbol,limit) if b else [],
      'retrospective_not_forward_proof':True,'real_orders_sent':0}

@app.get('/api/forensics/inspect')
def forensic_inspect(tf:str='M5',lookback:int=Query(300,ge=50,le=1500),candle_open_utc:int|None=None):
    b=broker_name()
    if not b:raise HTTPException(503,'No broker candle archive')
    if tf not in TF_SECONDS:raise HTTPException(400,'Unsupported TF')
    # GET is read-only. Only explicit chat investigation archives the case.
    return inspect_archive(service.store,b,service.settings.symbol,tf,lookback,candle_open_utc)

@app.get('/api/intelligence/{profile}')
def intelligence(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE','current':None,'saved':service.store.recent_intelligence(profile,8),'orders_sent':0}
    return {'ok':True,'profile':profile,'current':service.intelligence(b,profile),'saved':service.store.recent_intelligence(profile,8),'orders_sent':0}

@app.get('/api/market-events')
def market_events(profile:str='SCALPING',limit:int=Query(12,ge=1,le=50),audit_history:bool=False):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(400,'Unknown profile')
    raw=service.store.recent_market_events(profile,max(limit,50))
    events=service.store.recent_market_events(profile,limit) if audit_history else service.store.recent_canonical_market_events(profile,limit)
    return {'ok':True,'profile':profile,'events':events,'view':'AUDIT_HISTORY' if audit_history else 'CANONICAL',
            'raw_event_rows':len(raw),'canonical_event_rows':len(service.store.recent_canonical_market_events(profile,50)),
            'orders_sent':0}

@app.get('/api/learning/{profile}')
def learning_memory(profile:str,limit:int=Query(8,ge=1,le=30)):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    cases=[]
    for c in service.store.recent_learning_cases(profile,limit=limit):
        cases.append({
            'id':c['id'],'profile':c['profile'],'tf':c['tf'],'source_event_id':c['source_event_id'],
            'source_candle_open_utc':c['source_candle_open_utc'],'created_at_utc':c['created_at_utc'],
            'thesis':c['thesis'],'origin_close':c['origin_close'],'origin_atr':c['origin_atr'],
            'hash_valid':c['hash_valid'],'event_types':(c.get('context') or {}).get('event_types',[]),
            'followups':service.store.learning_followups(c['id']),
            'self_review':service.store.self_review(c['id']),
        })
    from .signal_self_review import memory_snapshot as signal_loss_memory_snapshot
    from .closed_loop_learning import snapshot as closed_loop_snapshot
    from .correction_effectiveness import snapshot as correction_effectiveness_snapshot
    from .technical_evidence_learning import snapshot as technical_evidence_learning_snapshot
    return {'ok':True,'profile':profile,'summary':service.store.learning_summary(profile),'latest':cases,
            'signal_loss_memory':signal_loss_memory_snapshot(service.store,profile),
            'closed_loop':closed_loop_snapshot(service.store,profile,limit=max(12,limit)),
            'correction_effectiveness':correction_effectiveness_snapshot(service.store,profile,limit=max(20,limit)),
            'technical_evidence_learning':technical_evidence_learning_snapshot(service.store,profile,limit=max(30,limit)),
            'mode':'EMPIRICAL_MEMORY_NOT_TRAINED_ML','auto_rule_mutation':False,'orders_sent':0}

@app.get('/api/closed-loop-learning/{profile}')
def closed_loop_learning(profile:str,limit:int=Query(50,ge=1,le=200)):
    from .closed_loop_learning import snapshot
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**snapshot(service.store,profile,limit=limit)}

@app.get('/api/correction-effectiveness/{profile}')
def correction_effectiveness(profile:str,limit:int=Query(100,ge=1,le=500)):
    from .correction_effectiveness import snapshot
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**snapshot(service.store,profile,limit=limit)}

@app.get('/api/technical-evidence-learning/{profile}')
def technical_evidence_learning(profile:str,limit:int=Query(100,ge=1,le=500)):
    from .technical_evidence_learning import snapshot
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**snapshot(service.store,profile,limit=limit)}

@app.get('/api/signal-self-review/{profile}')
def signal_self_review_memory(profile:str):
    from .signal_self_review import memory_snapshot
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**memory_snapshot(service.store,profile)}

@app.get('/api/causal-context/{profile}')
def causal_context(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**service.causal_context(profile)}

@app.get('/api/performance/{profile}')
def performance_research(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**service.performance(profile)}

@app.get('/api/validation/{profile}')
def validation_gate(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    return {'ok':True,**service.validation(profile)}

@app.get('/api/readiness')
def readiness():
    return {'ok':True,**service.readiness()}

@app.get('/api/decision/{profile}')
def unified_decision(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE'}
    return {'ok':True,**service.decision(b,profile)}

@app.get('/api/analyst/{profile}')
def professional_analyst(profile:str):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(404,'Unknown profile')
    b=broker_name()
    if not b:return {'ok':False,'profile':profile,'status':'NO_BROKER_ARCHIVE'}
    return {'ok':True,**service.analyst(b,profile)}

@app.get('/api/mentor-feed')
def mentor_feed(profile:str='SCALPING',limit:int=Query(12,ge=1,le=50)):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(400,'Unknown profile')
    return {'ok':True,'profile':profile,'updates':service.store.recent_mentor_updates(profile,limit),'orders_sent':0}

@app.get('/api/autonomous-mentor')
def autonomous_mentor(profile:str='SCALPING',limit:int=Query(12,ge=1,le=50)):
    profile=profile.upper()
    if profile not in PROFILE_TF:raise HTTPException(400,'Unknown profile')
    return {'ok':True,'profile':profile,
            'updates':service.store.recent_autonomous_mentor_updates(profile,limit),
            'meaningful_change_only':True,'orders_sent':0}

@app.get('/api/context')
def external_context():
    from .context import snapshot
    return snapshot(service.store)

@app.get('/api/profile-overview')
def profile_overview():
    out={}
    for name in PROFILE_TF:
        recent=service.store.recent_research(name,limit=1)
        last=recent[0] if recent else None
        out[name]={'status':last['status'] if last else 'NOT_YET_OBSERVED',
            'source_mode':last['source_mode'] if last else None,
            'observed_utc':last['analyzed_at_utc'] if last else None,
            'forward_signals':service.store.db.execute('SELECT COUNT(*) FROM signals WHERE profile=?',(name,)).fetchone()[0]}
    return {'ok':True,'profiles':out,'dropdown_affects_view_only':True,'orders_sent':0}

@app.get('/api/signals/{signal_id}/events')
def signal_events(signal_id:str):
    s=service.store.signal(signal_id)
    if not s:raise HTTPException(404,'Unknown signal')
    return {'ok':True,'signal':s,'events':service.store.events(signal_id),'hash_chain_valid':service.store.verify_chain(signal_id)}

@app.post('/api/chat')
def chat(body:ChatInput):
    profile=requested_profile(body.message,body.profile.upper())
    if profile not in PROFILE_TF:raise HTTPException(400,'Unknown profile')
    b=broker_name();s=service.store.signal(body.signal_id) if body.signal_id else None
    if body.signal_id and (not s or s['profile']!=profile or s['symbol']!=service.settings.symbol or s['broker']!=b):
        raise HTTPException(404,'Signal ID not found for this profile and broker')
    if not s and b:
        recent=service.store.db.execute('''SELECT id FROM signals WHERE profile=? AND broker=? AND symbol=?
          ORDER BY created_at_utc DESC LIMIT 1''',(profile,b,service.settings.symbol)).fetchone()
        if recent:s=service.store.signal(recent['id'])
    try:r=service.study(b,profile) if b else {'status':'NO_HISTORY','profile':profile}
    except Exception:r={'status':'INSUFFICIENT_HISTORY','profile':profile}
    context=service.store.observations(int(time.time()),limit=10)
    q=body.message.lower();forensic=None
    intel=service.intelligence(b,profile) if b else None
    mev=service.store.recent_canonical_market_events(profile,limit=6) if b else []

    # EVENT questions are never answered by substituting a visually similar
    # historical candle.  Bind the forensic audit to the exact stored event row.
    event_terms=('structural event','market event','event h4','event m5','event m15','event h1',
                 'sweep_low_reclaim','sweep_high_reclaim','bearish_displacement','bullish_displacement',
                 'closed_breakout','event terbaru','event latest')
    asks_event=any(term in q for term in event_terms)
    if asks_event and b and mev:
        # Prefer the exact recent event whose TF/type/ID is named in the question.
        # Fall back to the newest event only when the user did not disambiguate it.
        import re
        tfmatch=re.search(r'\b(m1|m5|m15|m30|h1|h4|d1|w1)\b',q)
        wanted_tf=tfmatch.group(1).upper() if tfmatch else None
        named_types=[x for x in ('SWEEP_LOW_RECLAIM','SWEEP_LOW_NO_RECLAIM','SWEEP_HIGH_RECLAIM','SWEEP_HIGH_NO_RECLAIM',
                                  'BEARISH_DISPLACEMENT','BULLISH_DISPLACEMENT','CLOSED_BREAKOUT_UP','CLOSED_BREAKOUT_DOWN','EXTREME_CANDLE')
                     if x.lower() in q]
        event_id_match=re.search(r'\b[0-9a-f]{32}\b',q)
        wanted_id=event_id_match.group(0) if event_id_match else None
        candidates=[e for e in mev if (not wanted_tf or e.get('tf')==wanted_tf)
                    and (not wanted_id or e.get('id')==wanted_id)
                    and (not named_types or all(x in (e.get('event_types') or []) for x in named_types))]
        chosen=candidates[0] if candidates else mev[0]
        forensic=inspect_market_event(service.store,b,service.settings.symbol,chosen)
        if forensic.get('status')=='EVENT_FORENSIC_REVIEW':
            forensic['case_id']=service.store.save_forensic_case(forensic)
    elif any(word in q for word in ('wick','ekor','spike','anomali','abnormal','liquidity sweep','candle panjang','lilin panjang')):
        # Generic anomaly questions retain the V0.3 archive search behaviour.
        # The result explicitly says it is a selected candidate, not the event.
        import re
        tfmatch=re.search(r'\b(m1|m5|m15|m30|h1|h4|d1|w1)\b',q)
        tf=tfmatch.group(1).upper() if tfmatch else PROFILE_TF[profile][0]
        if b:
            forensic=inspect_archive(service.store,b,service.settings.symbol,tf,lookback=300)
            if forensic.get('status')=='HISTORICAL_FORENSIC_REVIEW':
                forensic['case_id']=service.store.save_forensic_case(forensic)
    learning={'summary':service.store.learning_summary(profile),'latest':[]}
    for c in service.store.recent_learning_cases(profile,limit=3):
        learning['latest'].append({**c,'followups':service.store.learning_followups(c['id']),'self_review':service.store.self_review(c['id'])})
    unified=service.decision(b,profile) if b else None
    teaching=(unified or {}).get('teaching') if unified else None
    analyst=(unified or {}).get('analyst') if unified else None
    answer=explain(body.message,r,s,context,service.store.events(s['id']) if s else None,
                   service.store.behaviour_reviews(s['id'],limit=1) if s else None,forensic=forensic,
                   intelligence=intel,market_events=mev,learning=learning,unified=unified,teaching=teaching,analyst=analyst)
    if unified:
        try:
            from .cognitive_brain import build as build_cognitive
            from .asset_brain import build_asset_brain
            cb=build_cognitive(profile,unified,service.live_feed(),build_asset_brain(service.settings.symbol),{},mev)
            answer['cognitive_brain_version']=cb.get('version')
            answer['recommended_research_action']=cb.get('recommended_research_action')
            pr=cb.get('professional_reasoning') or {}
            answer['professional_reasoning_version']=pr.get('version')
            answer['reasoning_conclusion']=pr.get('conclusion')
            answer['answer']=cb.get('mentor_summary','')+'\n\n'+answer.get('answer','')
        except Exception:
            pass
    return answer

@app.post('/api/collect')
def collect(body:CollectInput,x_aat_admin:str|None=Header(None)):
    guard(x_aat_admin)
    if len(body.timeframes)>8 or any(x not in TF_SECONDS for x in body.timeframes):raise HTTPException(400,'Unsupported TF')
    return {'ok':True,'result':service.collect(body.timeframes,initial=body.initial)}

@app.post('/api/observations')
def observations(body:ObserveInput,x_aat_admin:str|None=Header(None)):
    guard(x_aat_admin)
    now=int(time.time())
    oid=service.store.save_observation(body.kind,body.subject,body.source_name,
       {**body.payload,'supplied_by_api':True,'not_independently_verified':True},
       source_url=body.source_url,published_at=body.source_published_utc,observed_at=now,retrieved_at=now,
       transport='ADMIN_OBSERVATION_API',retrieval_meta={'independently_verified':False})
    return {'ok':True,'id':oid,'trading_impact':'NONE_UNTIL_VALIDATED'}

@app.post('/api/news/collect')
def news_collect(x_aat_admin:str|None=Header(None)):
    guard(x_aat_admin);return {'ok':True,'feed_health':pull_public_headlines(service.store)}

@app.post('/api/context/collect')
def context_collect(x_aat_admin:str|None=Header(None)):
    guard(x_aat_admin)
    return {'ok':True,'macro':pull_goldflow_macro(service.store,service.settings.website_url),
            'news':pull_public_headlines(service.store),'orders_sent':0}

@app.post('/api/cycle')
def cycle(x_aat_admin:str|None=Header(None)):
    guard(x_aat_admin)
    b=broker_name()
    if not b:return {'ok':False,'status':'BACKFILL_FIRST'}
    now=int(time.time());ingest=service.collect(initial=False,now=now)
    try:quote=service.collector.fetch_quote(service.settings.symbol,now)
    except Exception:quote=None
    result=service.research_cycle(b,now=now,quote=quote)
    return {'ok':True,'ingestion':ingest,'quote_verified':quote is not None,
      'study_result':result,'real_orders_sent':0}

@app.post('/api/paper/{signal_id}/enter')
def paper_enter(signal_id:str,x_aat_admin:str|None=Header(None)):
    guard(x_aat_admin);s=service.store.signal(signal_id)
    if not s:raise HTTPException(404,'Unknown signal')
    now=int(time.time())
    try:q=service.collector.fetch_quote(s['symbol'],now)
    except Exception as e:raise HTTPException(409,'Fresh broker quote required for explicit paper entry') from e
    try:return mark_paper_entry(service.store,s,q,now,explicit_authorization=True)
    except ValueError as e:raise HTTPException(409,str(e)) from e

# No order_send, broker trading mutations, live lot placement or cloud secrets.
