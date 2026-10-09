"""GF-AAT orchestration: no imports from pre-existing GoldFlow indicators.

Backfilled history is retrospective and NEVER labelled a forward signal.
Only the first processing after an actually fresh closed candle may issue a
new live conditional research signal. Stable id per symbol/profile/candle/version.
"""
import hashlib,json,time
from .settings import Settings,TF_SECONDS,PROFILE_TF,PROFILE_RULES
from .storage import Store
from .collector import CandleCollector
from .structure import research_profile,make_plan,ALGORITHM
from .adaptive import candle_integrity,VERSION as BEHAVIOUR_VERSION
from .context import snapshot
from .causal_context import snapshot as causal_snapshot, VERSION as CAUSAL_CONTEXT_VERSION
from .performance import build_performance, VERSION as PERFORMANCE_VERSION
from .walk_forward import evaluate as evaluate_walk_forward, VERSION as WALK_FORWARD_VERSION
from .knowledge import VERSION as KNOWLEDGE_VERSION
from .professional import build_snapshot,VERSION as PROFESSIONAL_VERSION
from .event_intelligence import detect_event,VERSION as EVENT_VERSION
from .learning import make_case,update_cases,VERSION as LEARNING_VERSION,REVIEW_VERSION as SELF_REVIEW_VERSION
from .readiness import build_readiness,VERSION as READINESS_VERSION
from .decision_engine import synthesize,human_update,VERSION as DECISION_VERSION
from .teacher_engine import build_teaching_packet,compact_text,VERSION as TEACHER_VERSION
from .trading_curriculum import VERSION as CURRICULUM_VERSION
from .market_state import classify_pullback_reversal,VERSION as MARKET_STATE_VERSION
from .thesis_lifecycle import build_thesis_lifecycle,VERSION as THESIS_VERSION
from .autonomous_mentor import build_update as build_autonomous_update,VERSION as AUTONOMOUS_MENTOR_VERSION
from .lifecycle import candle_monitor,quote_monitor,paper_monitor,TERMINAL
from .pro_signal import evaluate as evaluate_signal_gate, VERSION as SIGNAL_GATE_VERSION
from .analyst_brain import build as build_analyst_brain, VERSION as ANALYST_BRAIN_VERSION
from .price_action import VERSION as PRICE_ACTION_VERSION
from .data_integrity import VERSION as INTEGRITY_AUDIT_VERSION
from .scalping_campaign import build as build_scalping_campaign, VERSION as SCALPING_CAMPAIGN_VERSION
from .signal_outcomes import VERSION as SIGNAL_OUTCOME_VERSION
from .pre_entry_study import evaluate as evaluate_pre_entry_study, VERSION as PRE_ENTRY_STUDY_VERSION
from .knowledge_scout import snapshot as knowledge_scout_snapshot, seed_library as seed_knowledge_library, VERSION as KNOWLEDGE_SCOUT_VERSION
from .context_lens import VERSION as CONTEXT_LENS_VERSION
from .pattern_brain import build as build_pattern_brain, VERSION as PATTERN_BRAIN_VERSION
from .adaptive_tool_selector import select as select_adaptive_tools, VERSION as TOOL_SELECTOR_VERSION
from .signal_self_review import process_reviews as process_signal_self_reviews, memory_snapshot as signal_loss_memory_snapshot, VERSION as SIGNAL_SELF_REVIEW_VERSION
from .closed_loop_learning import process_outcome_reviews, process_missed_opportunities, check_next_setup, record_publication_rejection, VERSION as CLOSED_LOOP_VERSION
from .correction_effectiveness import process_correction_effectiveness, record_signal_correction_trials, VERSION as CORRECTION_EFFECTIVENESS_VERSION
# Legacy cohort retained for audit compatibility: R5.17_CORRECTION_EFFECTIVENESS
from .technical_evidence import VERSION as TECHNICAL_EVIDENCE_VERSION
from .entry_geometry import VERSION as ENTRY_GEOMETRY_VERSION
from .technical_evidence_learning import process_outcomes as process_technical_evidence_outcomes, record_signal_trial as record_technical_evidence_trial, VERSION as TECHNICAL_EVIDENCE_LEARNING_VERSION
PREVIOUS_TECHNICAL_QUALIFICATION_GENERATION='R5.17.2_TECHNICAL_EVIDENCE_CALIBRATION'  # retained for audit compatibility

PROFILE_THRESHOLDS={k:v['min_score'] for k,v in PROFILE_RULES.items()}
FETCH_TFS=('M1','M5','M15','M30','H1','H4','D1','W1')

class ResearchService:
    def __init__(self,settings=None,store=None,collector=None):
        self.settings=(settings or Settings()).validate()
        self.store=store or Store(self.settings.data_path)
        self.collector=collector or CandleCollector(self.settings)
        self._last_collected={};self._last_processed={};self._last_error={};self._bootstrapped=set()
        # R5.13 persists the user's shared trading-study topics as candidate knowledge.
        # This is local/zero-network and never changes active rules.
        try: seed_knowledge_library(self.store)
        except Exception: pass

    def collect(self,tfs=None,initial=False,now=None):
        now=int(time.time()) if now is None else int(now);report={}
        for tf in (tfs or FETCH_TFS):
            if tf not in TF_SECONDS:raise ValueError('Unsupported timeframe')
            key=(self.settings.symbol,tf)
            delay={'M1':50,'M5':55,'M15':110,'M30':170,'H1':290,'H4':880,'D1':3500,'W1':14000}[tf]
            if not initial and now-self._last_collected.get(key,0)<delay:continue
            try:
                info=self.collector.ingest(self.store,self.settings.symbol,tf,
                  self.settings.backfill_limit if initial else 240,now=now)
                report[tf]=info;self._last_collected[key]=now
                self._last_error.pop(tf,None)
            except Exception as e:
                # No empty/synthetic candles on transport failure.
                msg=type(e).__name__+': '+str(e)
                report[tf]={'ok':False,'error':msg[:200]};self._last_error[tf]=msg[:200]
                self._last_collected[key]=now- max(delay-30,0)  # retry after ~30 seconds
        return report

    def frames(self,broker,profile,asof=None,limit=500,forward_only=False):
        asof=int(time.time()) if asof is None else int(asof)
        result={}
        for tf in set(PROFILE_TF[profile]):
            result[tf]=self.store.history_at(broker,self.settings.symbol,tf,asof,limit,forward_only)
        return result

    def scalping_frames(self,broker,asof=None,limit=500,forward_only=False):
        """Return the professional scalping hierarchy including M1 execution."""
        asof=int(time.time()) if asof is None else int(asof)
        return {tf:self.store.history_at(broker,self.settings.symbol,tf,asof,limit,forward_only)
                for tf in ('M1','M5','M15','M30','H1')}

    def scalping_campaign(self,broker,asof=None,forward_only=False,live=None):
        """Current master campaign + M1 re-entry opportunity research."""
        asof=int(time.time()) if asof is None else int(asof)
        frames=self.scalping_frames(broker,asof,forward_only=forward_only)
        ready=self.readiness(broker,asof)
        integrity=((ready.get('profiles') or {}).get('SCALPING') or {}).get('integrity_audit') or {}
        if live is None:
            try: live=self.live_feed(asof)
            except Exception: live={}
        recent=self.store.recent_scalping_opportunities(broker,self.settings.symbol,limit=12)
        return build_scalping_campaign(frames,live=live,integrity=integrity,recent_forward_opportunities=recent)

    def _process_scalping_micro_cycle(self,broker,now,quote=None):
        """Persist fresh M1 T0 opportunities independently of the M5 signal slot.

        This is what lets one valid master campaign yield several professional
        re-entry studies instead of suppressing all later setups just because an
        earlier scalp study is still being monitored.
        """
        frames=self.scalping_frames(broker,now,forward_only=True)
        rows=frames.get('M1') or []
        if not rows:return {'status':'NO_M1_HISTORY','orders_sent':0}
        current=rows[-1];close_utc=current.t+TF_SECONDS['M1']
        marker_algo=SCALPING_CAMPAIGN_VERSION
        cp=self.store.checkpoint(broker,self.settings.symbol,'SCALPING',marker_algo)
        if current.first_seen_utc>now or close_utc>now:
            return {'status':'WAIT_M1_FINAL_CANDLE','candle_open_utc':current.t,'orders_sent':0}
        if cp is None:
            self.store.advance_checkpoint(broker,self.settings.symbol,'SCALPING',marker_algo,current.t,now,'BOOTSTRAP')
            return {'status':'M1_CAMPAIGN_BASELINED_WAIT_NEXT_FORWARD_CANDLE','candle_open_utc':current.t,'orders_sent':0}
        previous=int(cp.get('last_candle_open_utc') or 0)
        if current.t<=previous:
            return {'status':'M1_CAMPAIGN_CANDLE_ALREADY_PROCESSED','candle_open_utc':current.t,'orders_sent':0}
        if current.t-previous!=TF_SECONDS['M1']:
            self.store.advance_checkpoint(broker,self.settings.symbol,'SCALPING',marker_algo,current.t,now,'MISSED_CANDLE_GAP')
            return {'status':'M1_CAMPAIGN_GAP_BASELINED','previous_candle_open_utc':previous,'candle_open_utc':current.t,'orders_sent':0}
        live={}
        if quote is not None:
            live={'quote_status':'LIVE_VERIFIED','bid':getattr(quote,'bid',None),'ask':getattr(quote,'ask',None),
                  'quote_time_utc':getattr(quote,'time_utc',None)}
        ready=self.readiness(broker,now);integrity=((ready.get('profiles') or {}).get('SCALPING') or {}).get('integrity_audit') or {}
        recent=self.store.recent_scalping_opportunities(broker,self.settings.symbol,limit=12)
        result=build_scalping_campaign(frames,live=live,integrity=integrity,recent_forward_opportunities=recent)
        result['observer_provenance']='FORWARD_CONTIGUOUS_CLOSED_M1'
        result['observed_at_utc']=now
        result['persisted_opportunity_id']=None
        cur=result.get('current_opportunity') or {};selected=cur.get('selected') or {}
        if cur.get('entry_ready') and selected:
            duplicate=False
            for old in recent[:6]:
                od=old.get('detail') or {};osel=(od.get('current_opportunity') or {}).get('selected') or {}
                if old.get('campaign_id')==result.get('master_campaign',{}).get('campaign_id') and                    old.get('side')==selected.get('side') and old.get('setup_type')==selected.get('setup_type') and                    current.t-int(old.get('candle_open_utc') or 0)<=3*TF_SECONDS['M1']:
                    duplicate=True;break
            if duplicate:
                result['publication_status']='DUPLICATE_MICRO_CYCLE_SKIPPED'
            else:
                saved=self.store.save_scalping_opportunity(
                    broker,self.settings.symbol,result.get('master_campaign',{}).get('campaign_id','UNKNOWN'),
                    current.t,now,SCALPING_CAMPAIGN_VERSION,result)
                result['persisted_opportunity_id']=saved.get('id') if saved else None
                result['publication_status']='IMMUTABLE_T0_SCALPING_OPPORTUNITY_SAVED'
        else:
            result['publication_status']='NO_ENTRY_READY_MICRO_SETUP'
        self.store.advance_checkpoint(broker,self.settings.symbol,'SCALPING',marker_algo,current.t,now,'FORWARD_REVIEW')
        return result

    def intelligence(self,broker,profile,asof=None,forward_only=False):
        profile=profile.upper();asof=int(time.time()) if asof is None else int(asof)
        frames=self.frames(broker,profile,asof,forward_only=forward_only)
        ext=snapshot(self.store,asof=asof);ext['causal']=causal_snapshot(self.store,profile,asof)
        snap=build_snapshot(profile,frames,external=ext)
        primary=PROFILE_TF[profile][0];bars=frames.get(primary,[])
        event=detect_event(bars) if bars else None
        return {'snapshot':snap,'latest_event':event,'asof_utc':asof,'provenance':'FORWARD_OBSERVED' if forward_only else 'RETROSPECTIVE_RESEARCH'}

    def _record_intelligence(self,broker,profile,frames,now,provenance):
        primary=PROFILE_TF[profile][0];bars=frames.get(primary,[])
        if not bars:return {'snapshot':None,'event':None}
        ext=snapshot(self.store,asof=now);ext['causal']=causal_snapshot(self.store,profile,now);snap=build_snapshot(profile,frames,external=ext)
        snap['provenance']=provenance;snap['market_data_cutoff_utc']=bars[-1].t+TF_SECONDS[primary]
        self.store.save_intelligence_snapshot(broker,self.settings.symbol,profile,bars[-1].t,now,PROFESSIONAL_VERSION,snap)
        ev=detect_event(bars)
        if ev:
            ev={**ev,'profile':profile,'provenance':provenance}
            event_id=self.store.save_market_event(broker,self.settings.symbol,profile,ev,now)
            # The persisted row ID is returned to the caller, while the immutable
            # stored evidence remains hash-stable.  Mentor/event audits use this ID
            # to bind the explanation to the exact source candle.
            ev={**ev,'market_event_id':event_id}
        return {'snapshot':snap,'event':ev}

    def study(self,broker,profile,asof=None,forward_only=False):
        profile=profile.upper();asof=int(time.time()) if asof is None else int(asof)
        f=self.frames(broker,profile,asof,forward_only=forward_only)
        r=research_profile(profile,f)
        if r['status']=='SETUP_CLOSED_CANDLE':
            r['plan']=make_plan(r,f,asof)
            if r['plan'] is not None:
                r['plan']['initial_state']='RESEARCH_ONLY_NOT_A_SIGNAL'
            else:
                r['plan_status']='WAIT_STRUCTURAL_ENTRY_GEOMETRY'
        r['knowledge_library_version']=KNOWLEDGE_VERSION  # context for the audit; not a synthetic market vote
        ext=snapshot(self.store,asof=asof);ext['causal']=causal_snapshot(self.store,profile,asof)
        r['professional_brain']=build_snapshot(profile,f,external=ext)
        r['causal_context']=ext['causal']
        r['provenance']='FORWARD_OBSERVED' if forward_only else 'RETROSPECTIVE_HISTORY_RESEARCH_ONLY'
        r['asof_utc']=asof
        return r

    def readiness(self,broker=None,now=None):
        if broker is None:
            row=self.store.db.execute('SELECT broker FROM candles WHERE symbol=? GROUP BY broker ORDER BY COUNT(*) DESC LIMIT 1',(self.settings.symbol,)).fetchone()
            broker=row['broker'] if row else None
        return build_readiness(self.store,broker,self.settings.symbol,self._last_error,now,clock_offset_seconds=self.settings.verified_direct_broker_offset)

    def _compose_runtime_state(self,broker,profile,current,study,intelligence,now,frames=None):
        ext=snapshot(self.store,asof=now);ext['causal']=causal_snapshot(self.store,profile,now);ready=self.readiness(broker,now)
        event=(intelligence or {}).get('event')
        if event and not event.get('id') and event.get('market_event_id'):
            event={**event,'id':event['market_event_id'],'hash_valid':True,
                   'event_types':event.get('events') or event.get('event_types') or []}
        learning=self.store.learning_summary(profile);rp=ready['profiles'].get(profile,{})
        snap=(intelligence or {}).get('snapshot') or {}
        if frames is None:frames=self.frames(broker,profile,now)
        thesis_side=(study or {}).get('side') or (study or {}).get('side_bias')
        market_state=classify_pullback_reversal(profile,frames,snap,event,thesis_side)
        open_sigs=self.store.open_signals(broker,self.settings.symbol,profile)
        active=max(open_sigs,key=lambda x:int(x.get('created_at_utc') or 0)) if open_sigs else None
        evs=self.store.events(active['id']) if active else []
        lifecycle=build_thesis_lifecycle(profile,study,open_sigs,market_state,evs)
        performance=build_performance(self.store,profile);validation=evaluate_walk_forward(self.store,profile)
        dec=synthesize(profile,study,snap,event,ext,learning,rp,market_state,performance,validation)
        pre_entry_study=evaluate_pre_entry_study(profile,study,frames,{**dec,'market_state':market_state})
        pre_entry_study=check_next_setup(self.store,profile,pre_entry_study)
        pattern_brain=build_pattern_brain(profile,study,frames,(pre_entry_study or {}).get('selected_playbook'))
        adaptive_tools=select_adaptive_tools(profile,(pre_entry_study or {}).get('selected_playbook'),pattern_brain)
        teaching=build_teaching_packet(profile,study,snap,event,ext,learning,rp,dec,market_state,lifecycle,performance,validation)
        preview=None
        if (study or {}).get('status')=='SETUP_CLOSED_CANDLE':
            try:
                preview_study=dict(study or {});preview_study['pre_entry_market_study']=pre_entry_study
                preview=make_plan(preview_study,frames,now)
            except Exception:preview=None
        analyst=build_analyst_brain(profile,frames,study,snap,dec,market_state,ext.get('causal'),performance,validation,active,preview)
        scalping_campaign=None
        if profile=='SCALPING':
            try:scalping_campaign=self.scalping_campaign(broker,now)
            except Exception as exc:scalping_campaign={'status':'OPTIONAL_MODULE_UNAVAILABLE','error':type(exc).__name__+': '+str(exc)[:160],'orders_sent':0}
        return {'external':ext,'readiness':rp,'event':event,'learning':learning,'snapshot':snap,
                'market_state':market_state,'lifecycle':lifecycle,'performance':performance,'validation':validation,
                'decision':dec,'pre_entry_study':pre_entry_study,'pattern_brain':pattern_brain,'adaptive_tools':adaptive_tools,
                'teaching':teaching,'analyst':analyst,'scalping_campaign':scalping_campaign}

    def _publish_autonomous_update(self,broker,profile,current,bundle,now):
        previous=self.store.latest_autonomous_mentor_state(profile,broker,self.settings.symbol)
        event=bundle.get('event') or {}
        update=build_autonomous_update(profile,PROFILE_TF[profile][0],current.t,bundle['decision'],
             bundle['market_state'],bundle['lifecycle'],bundle['external'],bundle['readiness'],
             event.get('id') or event.get('market_event_id'),previous)
        if not update:return None
        # Persist the exact evidence used to explain the state transition. The
        # fingerprint remains based on stable state fields, while the full detail
        # is append-only and hash checked.
        update={**update,'decision':bundle['decision'],'market_state':bundle['market_state'],
                'lifecycle':bundle['lifecycle'],'teaching':bundle['teaching'],'analyst':bundle.get('analyst'),
                'scalping_campaign':bundle.get('scalping_campaign'),'pattern_brain':bundle.get('pattern_brain'),'adaptive_tools':bundle.get('adaptive_tools')}
        return self.store.save_autonomous_mentor_update(broker,self.settings.symbol,profile,
             PROFILE_TF[profile][0],current.t,now,AUTONOMOUS_MENTOR_VERSION,update)

    def decision(self,broker,profile,asof=None):
        profile=profile.upper();asof=int(time.time()) if asof is None else int(asof)
        frames=self.frames(broker,profile,asof)
        study=research_profile(profile,frames)
        ext=snapshot(self.store,asof=asof);ext['causal']=causal_snapshot(self.store,profile,asof)
        snap=build_snapshot(profile,frames,external=ext)
        events=self.store.recent_canonical_market_events(profile,limit=1)
        event=events[0] if events else None
        ready=self.readiness(broker,asof)
        learning=self.store.learning_summary(profile);rp=ready['profiles'].get(profile,{})
        thesis_side=study.get('side') or study.get('side_bias')
        market_state=classify_pullback_reversal(profile,frames,snap,event,thesis_side)
        open_sigs=self.store.open_signals(broker,self.settings.symbol,profile)
        active=max(open_sigs,key=lambda x:int(x.get('created_at_utc') or 0)) if open_sigs else None
        lifecycle=build_thesis_lifecycle(profile,study,open_sigs,market_state,self.store.events(active['id']) if active else [])
        performance=build_performance(self.store,profile);validation=evaluate_walk_forward(self.store,profile)
        decision=synthesize(profile,study,snap,event,ext,learning,rp,market_state,performance,validation)
        pre_entry_study=evaluate_pre_entry_study(profile,study,frames,{**decision,'market_state':market_state}) if frames is not None else {}
        pre_entry_study=check_next_setup(self.store,profile,pre_entry_study) if frames is not None else pre_entry_study
        pattern_brain=build_pattern_brain(profile,study,frames,(pre_entry_study or {}).get('selected_playbook')) if frames is not None else {}
        adaptive_tools=select_adaptive_tools(profile,(pre_entry_study or {}).get('selected_playbook'),pattern_brain)
        signal_gate=evaluate_signal_gate(profile,study,{**decision,'market_state':market_state},pre_entry_study)
        teaching=build_teaching_packet(profile,study,snap,event,ext,learning,rp,decision,market_state,lifecycle,performance,validation)
        preview=None
        if study.get('status')=='SETUP_CLOSED_CANDLE':
            try:
                preview_study=dict(study or {});preview_study['pre_entry_market_study']=pre_entry_study
                preview=make_plan(preview_study,frames,asof)
            except Exception:preview=None
        analyst=build_analyst_brain(profile,frames,study,snap,decision,market_state,ext.get('causal'),performance,validation,active,preview)
        scalping_campaign=None
        if profile=='SCALPING':
            try:scalping_campaign=self.scalping_campaign(broker,asof)
            except Exception as exc:scalping_campaign={'status':'OPTIONAL_MODULE_UNAVAILABLE','error':type(exc).__name__+': '+str(exc)[:160],'orders_sent':0}
        return {'profile':profile,'study':study,'snapshot':snap,'event':event,'external':ext,
                'learning':learning,'performance':performance,'validation':validation,'readiness':rp,'system_readiness':ready,
                'market_state':market_state,'lifecycle':lifecycle,'decision':decision,'signal_gate':signal_gate,'pre_entry_study':pre_entry_study,
                'pattern_brain':pattern_brain,'adaptive_tools':adaptive_tools,'teaching':teaching,'analyst':analyst,
                'scalping_campaign':scalping_campaign,
                'human_update':human_update(decision),'teacher_update':compact_text(teaching),'asof_utc':asof}

    def teacher(self,broker,profile,asof=None):
        """Return the autonomous teaching packet for the selected profile."""
        return self.decision(broker,profile,asof).get('teaching')

    def analyst(self,broker,profile,asof=None):
        """Return V1.6 scenario-based professional market reasoning."""
        return self.decision(broker,profile,asof).get('analyst')

    def _save_mentor_update(self,broker,profile,current,study,intelligence,now,frames=None):
        bundle=self._compose_runtime_state(broker,profile,current,study,intelligence,now,frames)
        auto_id=self._publish_autonomous_update(broker,profile,current,bundle,now)
        detail={**bundle['decision'],'teaching':bundle['teaching'],'teacher_version':TEACHER_VERSION,
                'market_state':bundle['market_state'],'lifecycle':bundle['lifecycle'],'analyst':bundle.get('analyst'),
                'pre_entry_study':bundle.get('pre_entry_study'),'pattern_brain':bundle.get('pattern_brain'),'adaptive_tools':bundle.get('adaptive_tools'),
                'performance':bundle['performance'],'validation':bundle['validation'],
                'autonomous_update_id':auto_id,'autonomous_mentor_version':AUTONOMOUS_MENTOR_VERSION}
        headline=human_update(bundle['decision'])+' | '+bundle['teaching']['headline']
        self.store.save_mentor_update(broker,self.settings.symbol,profile,PROFILE_TF[profile][0],current.t,now,
                                      TEACHER_VERSION,bundle['decision']['posture'],bundle['decision']['directional_bias'],headline,detail)
        return detail

    def run_once(self,broker,profile,now=None,quote=None):
        now=int(time.time()) if now is None else int(now);profile=profile.upper()
        if profile not in PROFILE_TF:raise ValueError('Unknown profile')
        frames=self.frames(broker,profile,now)
        micro_scalping=None
        if profile=='SCALPING':
            try:micro_scalping=self._process_scalping_micro_cycle(broker,now,quote)
            except Exception as exc:micro_scalping={'status':'OPTIONAL_MODULE_UNAVAILABLE','error':type(exc).__name__+': '+str(exc)[:160],'orders_sent':0}
        primary=PROFILE_TF[profile][0];bars=frames[primary]
        # Monitor existing setups first, even if no new signal is possible.
        existing=self.store.open_signals(broker,self.settings.symbol,profile)
        monitored=[]
        for sig in existing:
            if sig['state'] not in TERMINAL and now>sig['expires_at_utc'] and sig['state'] not in ('ACTIVE_PAPER','TP1_PAPER','TP2_PAPER'):
                sig=self.store.append_event(sig['id'],now,'EXPIRED_TIME','EXPIRED',
                    'Conditional STANDBY setup lifetime elapsed. This is not an entry loss unless post-T0 outcome audit proves the entry zone activated first.',{},sig['state'])
            elif bars:
                # Recover an interrupted observer using EACH real CLOSED candle in
                # order (never only the newest candle). The event timestamp is
                # the actual processing time, not a fabricated earlier alert.
                for i,observed in enumerate(bars):
                    if observed.t<=sig['origin_candle_open_utc']:continue
                    if observed.t+TF_SECONDS[primary]>now:continue
                    if observed.first_seen_utc>now:continue
                    if observed.t+TF_SECONDS[primary]>sig['expires_at_utc']:continue
                    if observed.first_seen_utc>sig['expires_at_utc']:continue
                    sig=candle_monitor(self.store,sig,bars[:i+1],now)
                    if sig['state'] in TERMINAL:break
            if quote and sig['state'] not in TERMINAL:
                atr_val=None
                if len(bars)>=16:
                    from .structure import atr
                    atr_val=atr(bars)
                if sig['state'] in ('ACTIVE_PAPER','TP1_PAPER','TP2_PAPER'):
                    # Paper entry was previously explicit. Broker orders remain disabled.
                    sig=paper_monitor(self.store,sig,quote,now,explicit_paper=True)
                elif atr_val:
                    sig=quote_monitor(self.store,sig,quote,now,atr_val,
                       sig['evidence'].get('max_spread_atr',self.settings.max_spread_atr),self.settings.max_quote_age_seconds)
            monitored.append(sig)
        if not bars:return {'status':'NO_BROKER_HISTORY','monitored':monitored,'profile':profile}
        current=bars[-1];lastclose=current.t+TF_SECONDS[primary]
        intelligence=self._record_intelligence(broker,profile,frames,now,'FORWARD_OBSERVER_CYCLE')
        # Outcomes are appended only to previously immutable T0 cases. This may
        # recover missed follow-ups after a restart but never rewrites the case.
        learning_updates=update_cases(self.store,broker,self.settings.symbol,profile,bars,now)
        # R5.15 foundation: every provable research SL receives an immutable post-loss review.
        # A single loss can immediately teach the robot not to repeat the same
        # measurable T0 weakness, without rewriting global rules or T0 history.
        loss_review_updates=process_signal_self_reviews(self.store,broker,self.settings.symbol,profile,now)
        # R5.16: terminal activated outcomes feed immutable outcome reviews + lesson evidence.
        closed_loop_updates=process_outcome_reviews(self.store,broker,self.settings.symbol,profile,now)
        missed_opportunity_updates=process_missed_opportunities(self.store,broker,self.settings.symbol,profile,now)
        # R5.17: only prospectively published signals that demonstrably corrected
        # an earlier measurable loss weakness become correction trials. Mature
        # trials are evaluated without rewriting either T0 signal.
        correction_effectiveness_updates=process_correction_effectiveness(self.store,broker,self.settings.symbol,profile,now)
        # R5.17.2: technical tools become outcome-calibrated evidence only.
        # Mature terminal paths are appended to immutable T0 technical trials;
        # no feature can mutate a live rule or authorize a trade automatically.
        technical_evidence_outcome_updates=process_technical_evidence_outcomes(self.store,broker,self.settings.symbol,profile,now)
        if current.first_seen_utc>now:
            return {'status':'WAIT_CANDLE_FIRST_OBSERVATION','profile':profile,'monitored':monitored,
                    'reason':'Archived candle is not yet observed at this timestamp'}
        # Never publish old history merely because it was just imported.
        if now-lastclose>TF_SECONDS[primary]+self.settings.grace_seconds:
            return {'status':'WAIT_FRESH_CLOSED_CANDLE','profile':profile,'latest_close_utc':lastclose,
                    'monitored':monitored,'reason':'History is valid but not a fresh forward candle'}
        if now<lastclose+self.settings.grace_seconds:
            return {'status':'WAIT_FINAL_CANDLE','profile':profile,'monitored':monitored}
        marker=(broker,self.settings.symbol,profile)
        if any(s['state'] not in TERMINAL for s in monitored):
            research=research_profile(profile,frames)
            autonomous_update_id=None
            if marker not in self._last_processed or current.t>self._last_processed[marker]:
                research['unified_decision']=self._save_mentor_update(broker,profile,current,research,intelligence,now,frames)
                self.store.save_research(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,research,
                   'FORWARD_CYCLE' if marker in self._last_processed else 'BOOTSTRAP_NO_FORWARD_SIGNAL')
                autonomous_update_id=research['unified_decision'].get('autonomous_update_id')
                self._last_processed[marker]=current.t
                self.store.advance_checkpoint(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,
                  'FORWARD_REVIEW' if marker in self._bootstrapped else 'BOOTSTRAP')
                self._bootstrapped.add(marker)
            else:
                # A high-relevance news/macro change can matter before the next
                # primary candle closes. Publish only if the state fingerprint
                # changed; no legacy same-candle row is rewritten.
                bundle=self._compose_runtime_state(broker,profile,current,research,intelligence,now,frames)
                autonomous_update_id=self._publish_autonomous_update(broker,profile,current,bundle,now)
            return {'status':'MONITOR_EXISTING_SIGNAL','monitored':monitored,'profile':profile,
                    'autonomous_update_id':autonomous_update_id,'micro_scalping':micro_scalping}

        # First run is a retrospective bootstrap even when the last candle just
        # closed. Do not pretend to have followed it prospectively.
        if marker not in self._last_processed:
            # Even with a durable checkpoint, a NEW process must baseline its
            # first observation. It cannot claim continuous monitoring through
            # its own downtime or retroactively publish a price-moved setup.
            old_cursor=self.store.checkpoint(broker,self.settings.symbol,profile,ALGORITHM)
            self.store.save_research(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,
               {'status':'BASELINED_WAIT_NEXT_FORWARD_CANDLE','last_closed_candle_open_utc':current.t,
                'previous_cursor':old_cursor,'legacy_indicators_used':False},
                'BOOTSTRAP_NO_FORWARD_SIGNAL')
            self.store.advance_checkpoint(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,'BOOTSTRAP')
            self._last_processed[marker]=current.t;self._bootstrapped.add(marker)
            return {'status':'BASELINED_WAIT_NEXT_FORWARD_CANDLE','profile':profile,'monitored':monitored,
                    'restart_rebaseline':old_cursor is not None,'micro_scalping':micro_scalping}
        if current.t<=self._last_processed[marker]:
            research=research_profile(profile,frames)
            bundle=self._compose_runtime_state(broker,profile,current,research,intelligence,now,frames)
            auto_id=self._publish_autonomous_update(broker,profile,current,bundle,now)
            return {'status':'CANDLE_ALREADY_PROCESSED','profile':profile,'monitored':monitored,
                    'autonomous_update_id':auto_id,'micro_scalping':micro_scalping}
        if current.t-self._last_processed[marker]!=TF_SECONDS[primary]:
            # Closed-market gap, delayed feed, or missed polling. Do not imply a
            # prospectively generated signal from a retrospective jump.
            self.store.save_research(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,
                {'status':'MISSED_CANDLE_GAP_BASELINED','previous_candle_open_utc':self._last_processed[marker],
                 'current_candle_open_utc':current.t,'no_forward_signal':True},'BOOTSTRAP_NO_FORWARD_SIGNAL')
            self.store.advance_checkpoint(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,'MISSED_CANDLE_GAP')
            self._last_processed[marker]=current.t
            return {'status':'MISSED_CANDLE_GAP_BASELINED','profile':profile,'monitored':monitored,'learning_updates':learning_updates,'micro_scalping':micro_scalping}
        data_quality=candle_integrity(bars)
        # A learning case is created only here: after process bootstrap and on a
        # contiguous NEW forward-observed closed candle. Imported history, restart
        # baselines and missed-candle jumps can never become T0 learning evidence.
        learning_case_id=None
        if intelligence.get('event'):
            case=make_case(broker,self.settings.symbol,profile,intelligence['event'],intelligence.get('snapshot') or {},now,data_quality)
            learning_case_id=self.store.save_learning_case(case)
        if not data_quality['trusted_for_new_signal']:
            reject={'status':'WAIT_DATA_INTEGRITY','profile':profile,'candle_quality':data_quality,
                    'reason':'Unusual latest closed bar; require independent raw broker validation',
                    'no_new_signal':True}
            reject['unified_decision']=self._save_mentor_update(broker,profile,current,reject,intelligence,now,frames)
            self.store.save_research(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,
                                     reject,'FORWARD_CYCLE')
            self.store.advance_checkpoint(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,'FORWARD_REVIEW')
            self._last_processed[marker]=current.t
            return {**reject,'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates}
        # R5.5: a proven immutable OHLC conflict is a publication hard-stop.
        # Continue observing/learning, but never mature a NEW paper signal until
        # the source audit is reviewed.  This is deliberately conservative and
        # does not rewrite the historical conflict record.
        integrity_ready=self.readiness(broker,now)
        profile_integrity=((integrity_ready.get('profiles') or {}).get(profile) or {}).get('integrity_audit') or {}
        if profile_integrity.get('review_required'):
            reject={'status':'WAIT_DATA_INTEGRITY_AUDIT','profile':profile,
                    'reason':'Proven material OHLC conflict exists inside this profile active evidence window; new signal publication is blocked until reviewed',
                    'integrity_audit':profile_integrity,'no_new_signal':True}
            reject['unified_decision']=self._save_mentor_update(broker,profile,current,reject,intelligence,now,frames)
            self.store.save_research(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,reject,'FORWARD_CYCLE')
            self.store.advance_checkpoint(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,'FORWARD_REVIEW')
            self._last_processed[marker]=current.t
            return {**reject,'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates}
        study=research_profile(profile,frames)
        study['external_observation']=snapshot(self.store,asof=now);study['external_observation']['causal']=causal_snapshot(self.store,profile,now)
        study['knowledge_library_version']=KNOWLEDGE_VERSION  # static, not a market vote
        study['unified_decision']=self._save_mentor_update(broker,profile,current,study,intelligence,now,frames)
        study['pre_entry_market_study']=evaluate_pre_entry_study(profile,study,frames,study['unified_decision'])
        study['pre_entry_market_study']=check_next_setup(self.store,profile,study['pre_entry_market_study'])
        study['pattern_brain']=build_pattern_brain(profile,study,frames,(study['pre_entry_market_study'] or {}).get('selected_playbook'))
        study['adaptive_tools']=select_adaptive_tools(profile,(study['pre_entry_market_study'] or {}).get('selected_playbook'),study['pattern_brain'])
        try:
            self.store.save_pattern_observation(broker,self.settings.symbol,profile,study['pattern_brain'].get('entry_tf') or primary,current.t,now,PATTERN_BRAIN_VERSION,
                (study['pre_entry_market_study'] or {}).get('selected_playbook'),study.get('side') or study.get('side_bias'),
                (study['pattern_brain'] or {}).get('relevant_patterns') or [],{'tool_selector':study['adaptive_tools'],'qualification_generation':'R5.17.3_STRUCTURAL_ENTRY_GEOMETRY'})
        except Exception: pass
        study['signal_publication_gate']=evaluate_signal_gate(profile,study,study['unified_decision'],study['pre_entry_market_study'])
        self.store.save_research(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,study,'FORWARD_CYCLE')
        # Advance the in-process cursor AFTER a full decision has been persisted.
        # If plan construction or publication fails, a retry on this candle stays
        # possible; the deterministic signal ID avoids creating duplicates.
        def commit_review():
            self.store.advance_checkpoint(broker,self.settings.symbol,profile,ALGORITHM,current.t,now,'FORWARD_REVIEW')
            self._last_processed[marker]=current.t

        def record_rejection_shadow(gate_info,publication_scope):
            # Prospective-only shadow evidence. It is never inserted into signals
            # and never becomes an order. This lets R5.16 audit whether a score or
            # professional gate was too strict without hindsight reconstruction.
            try:
                shadow=make_plan(study,frames,now)
                if not shadow:return None
                shadow['evidence']['professional_signal_gate']=gate_info
                shadow['evidence']['pre_entry_market_study']=study.get('pre_entry_market_study') or {}
                shadow['evidence']['pattern_brain']=study.get('pattern_brain') or {}
                shadow['evidence']['adaptive_tools']=study.get('adaptive_tools') or {}
                shadow['evidence']['qualification_generation']='R5.17.3_STRUCTURAL_ENTRY_GEOMETRY'
                shadow['evidence']['entry_activation_policy']='ZONE_TOUCH_THEN_FRESH_CLOSED_CANDLE_CONFIRMATION'
                shadow['evidence']['publication_scope']=publication_scope
                return record_publication_rejection(self.store,shadow,gate_info,study.get('pre_entry_market_study') or {},now)
            except Exception:
                return None

        if study['status']!='SETUP_CLOSED_CANDLE':
            commit_review()
            return {**study,'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates}
        if study['score']<PROFILE_THRESHOLDS[profile]:
            score_gate={'status':'SCORE_BELOW_PROFILE_THRESHOLD','eligible':False,
                        'hard_blockers':['PROFILE_SCORE_BELOW_THRESHOLD'],'score':study['score'],
                        'minimum_score':PROFILE_THRESHOLDS[profile],'score_is_win_probability':False}
            rejection_case=record_rejection_shadow(score_gate,'FORWARD_REJECTED_SCORE_SHADOW_CASE')
            commit_review()
            return {'status':'WAIT_SCORE','profile':profile,'score':study['score'],
                    'minimum_score':PROFILE_THRESHOLDS[profile],
                    'publication_rejection_shadow_id':(rejection_case or {}).get('id'),
                    'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates,
                    'closed_loop_updates':len(closed_loop_updates),'missed_opportunity_updates':len(missed_opportunity_updates),'correction_effectiveness_updates':len(correction_effectiveness_updates),'technical_evidence_outcome_updates':len(technical_evidence_outcome_updates)}
        gate=study.get('signal_publication_gate') or evaluate_signal_gate(profile,study,study.get('unified_decision') or {},study.get('pre_entry_market_study') or {})
        if not gate.get('eligible'):
            rejection_case=record_rejection_shadow(gate,'FORWARD_REJECTED_PROFESSIONAL_GATE_SHADOW_CASE')
            commit_review()
            return {'status':'WAIT_PROFESSIONAL_SIGNAL_GATE','profile':profile,'score':study['score'],
                    'signal_publication_gate':gate,'publication_rejection_shadow_id':(rejection_case or {}).get('id'),
                    'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates,
                    'closed_loop_updates':len(closed_loop_updates),'missed_opportunity_updates':len(missed_opportunity_updates),'correction_effectiveness_updates':len(correction_effectiveness_updates),'technical_evidence_outcome_updates':len(technical_evidence_outcome_updates)}
        plan=make_plan(study,frames,now)
        if plan is None:
            commit_review()
            return {'status':'WAIT_STRUCTURAL_ENTRY_GEOMETRY','profile':profile,'score':study['score'],
                    'reason':'Direction/setup may be valid, but no defensible structural entry/invalidation/target geometry is available. Do not invent an ATR-offset entry.',
                    'pre_entry_market_study':study.get('pre_entry_market_study') or {},
                    'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates,
                    'closed_loop_updates':len(closed_loop_updates),'missed_opportunity_updates':len(missed_opportunity_updates),
                    'correction_effectiveness_updates':len(correction_effectiveness_updates),'technical_evidence_outcome_updates':len(technical_evidence_outcome_updates)}
        plan['evidence']['professional_signal_gate']=gate
        plan['evidence']['signal_gate_version']=SIGNAL_GATE_VERSION
        plan['evidence']['pre_entry_market_study']=study.get('pre_entry_market_study') or {}
        plan['evidence']['pre_entry_study_version']=PRE_ENTRY_STUDY_VERSION
        plan['evidence']['pattern_brain']=study.get('pattern_brain') or {}
        plan['evidence']['pattern_brain_version']=PATTERN_BRAIN_VERSION
        plan['evidence']['adaptive_tools']=study.get('adaptive_tools') or {}
        plan['evidence']['adaptive_tool_selector_version']=TOOL_SELECTOR_VERSION
        plan['evidence']['qualification_generation']='R5.17.3_STRUCTURAL_ENTRY_GEOMETRY'
        plan['evidence']['entry_activation_policy']='ZONE_TOUCH_THEN_FRESH_CLOSED_CANDLE_CONFIRMATION'
        plan['evidence']['publication_scope']='FORWARD_CLOSED_CANDLE_AFTER_OBSERVER_BOOTSTRAP'
        plan['evidence']['lifecycle_semantics']='STANDBY_SETUP_UNTIL_PROVABLE_ENTRY_ZONE_ACTIVATION'
        key=json.dumps((plan['broker'],plan['symbol'],profile,plan['origin_candle_open_utc'],ALGORITHM),separators=(',',':'))
        plan['id']='AAT-'+hashlib.sha256(key.encode()).hexdigest()[:18].upper()
        got=self.store.create_signal(plan)
        # R5.17 T0 correction trial: record only after a real research signal is
        # immutably published. Rejected shadows are not correction trials.
        correction_trials=record_signal_correction_trials(self.store,got,now)
        technical_evidence_trial=record_technical_evidence_trial(self.store,got,now)
        if not self.store.events(got['id']):
            got=self.store.append_event(got['id'],now,'PUBLISHED','WAIT_RETEST',
              'New forward-observed conditional STANDBY setup. It is not counted as an entry until later broker evidence proves entry-zone activation; no position sent to broker',
              {'study_score':study['score'],'score_is_win_probability':False,'source_candle_open_utc':current.t},'WAIT_RETEST')
        commit_review()
        return {'status':'SIGNAL_MONITORING','signal':got,'profile':profile,'monitored':monitored,'learning_case_id':learning_case_id,'learning_updates':learning_updates,'correction_trials_recorded':len(correction_trials),'technical_evidence_trial_recorded':bool(technical_evidence_trial),'correction_effectiveness_updates':len(correction_effectiveness_updates),'technical_evidence_outcome_updates':len(technical_evidence_outcome_updates),'micro_scalping':micro_scalping}

    def causal_context(self,profile,asof=None):
        asof=int(time.time()) if asof is None else int(asof)
        return causal_snapshot(self.store,profile.upper(),asof)

    def performance(self,profile):
        return build_performance(self.store,profile.upper())

    def validation(self,profile):
        return evaluate_walk_forward(self.store,profile.upper())

    def knowledge_scout(self,limit=12):
        return knowledge_scout_snapshot(self.store,limit=limit)

    def live_feed(self,now=None):
        now=int(time.time()) if now is None else int(now)
        status=self.collector.live_status(self.settings.symbol,now)
        status['read_only']=True;status['auto_order_execution']=False;status['orders_sent']=0
        return status

    def research_cycle(self,broker,profiles=None,now=None,quote=None):
        profiles=profiles or list(PROFILE_TF)
        return {p:self.run_once(broker,p,now,quote) for p in profiles}

    def diagnostics(self):
        return {**self.store.status(),'source':self.settings.source,'symbol':self.settings.symbol,
          'algorithm':ALGORITHM,'behaviour_algorithm':BEHAVIOUR_VERSION,'knowledge_library_version':KNOWLEDGE_VERSION,'professional_brain_version':PROFESSIONAL_VERSION,'event_intelligence_version':EVENT_VERSION,'learning_version':LEARNING_VERSION,'self_review_version':SELF_REVIEW_VERSION,'readiness_version':READINESS_VERSION,'decision_engine_version':DECISION_VERSION,'teacher_version':TEACHER_VERSION,'curriculum_version':CURRICULUM_VERSION,'market_state_version':MARKET_STATE_VERSION,'thesis_lifecycle_version':THESIS_VERSION,'autonomous_mentor_version':AUTONOMOUS_MENTOR_VERSION,'causal_context_version':CAUSAL_CONTEXT_VERSION,'performance_version':PERFORMANCE_VERSION,'walk_forward_version':WALK_FORWARD_VERSION,'signal_gate_version':SIGNAL_GATE_VERSION,
          'analyst_brain_version':ANALYST_BRAIN_VERSION,'price_action_version':PRICE_ACTION_VERSION,'integrity_audit_version':INTEGRITY_AUDIT_VERSION,'scalping_campaign_version':SCALPING_CAMPAIGN_VERSION,'signal_outcome_tracker_version':SIGNAL_OUTCOME_VERSION,'pre_entry_study_version':PRE_ENTRY_STUDY_VERSION,'knowledge_scout_version':KNOWLEDGE_SCOUT_VERSION,'context_lens_version':CONTEXT_LENS_VERSION,'pattern_brain_version':PATTERN_BRAIN_VERSION,'adaptive_tool_selector_version':TOOL_SELECTOR_VERSION,'signal_self_review_version':SIGNAL_SELF_REVIEW_VERSION,'closed_loop_learning_version':CLOSED_LOOP_VERSION,'correction_effectiveness_version':CORRECTION_EFFECTIVENESS_VERSION,'technical_evidence_version':TECHNICAL_EVIDENCE_VERSION,'technical_evidence_learning_version':TECHNICAL_EVIDENCE_LEARNING_VERSION,'structural_entry_geometry_version':ENTRY_GEOMETRY_VERSION,
          'profiles':list(PROFILE_TF),
          'last_errors':self._last_error,'read_only_broker':True,'auto_order_execution':False,
          'db_backed_persistence':True,'cloud_replication_configured':False}
