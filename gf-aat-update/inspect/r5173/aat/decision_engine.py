"""GF-AAT V1.4 unified evidence synthesis.

Missing optional context (news/macro, canonical event, mature learning sample) is
an advisory warning rather than an automatic veto.  Hard blockers are reserved
for market-structure/data requirements.  Causal context and performance history
can strengthen an evidence *audit* but never become a win probability or broker
instruction.
"""
from .settings import PROFILE_REQUIRED_TF

VERSION='GF-AAT-UNIFIED-EVIDENCE-1.4.0'


def _align(snapshot):
    if not snapshot:return 0
    vals=list((snapshot.get('trend_map') or {}).values())+list((snapshot.get('structure_map') or {}).values())
    bull=sum(x=='BULLISH' for x in vals);bear=sum(x=='BEARISH' for x in vals)
    return 1 if bull>bear and bull>=2 else -1 if bear>bull and bear>=2 else 0


def synthesize(profile,study,snapshot,event,external,learning,readiness_profile,market_state=None,performance=None,validation=None):
    profile=profile.upper();study=study or {};snapshot=snapshot or {};external=external or {};learning=learning or {};event=event or None;market_state=market_state or {}
    performance=performance or {};validation=validation or {}
    status=study.get('status','UNKNOWN');bias=study.get('side') or study.get('side_bias') or 'NONE'
    blockers=[];warnings=[];evidence=[];score=0
    ready=readiness_profile or {}
    usable=bool(ready.get('research_usable',ready.get('status')=='RESEARCH_READY'))
    if not usable:blockers.append('READINESS_'+ready.get('status','UNKNOWN'))
    elif ready.get('status')=='RESEARCH_READY_SOURCE_RETRY':warnings.append('SOURCE_RETRY_USING_FRESH_ARCHIVE')
    req=PROFILE_REQUIRED_TF[profile]
    if snapshot.get('required_tfs') and all(tf in (snapshot.get('trend_map') or {}) for tf in req):
        evidence.append('MANDATORY_TF_AVAILABLE');score+=2
    alignment=_align(snapshot)
    if alignment:evidence.append('MULTI_TF_DIRECTIONAL_ALIGNMENT');score+=2
    else:blockers.append('MULTI_TF_UNRESOLVED')
    if snapshot.get('primary',{}).get('structure') in ('BULLISH','BEARISH'):
        evidence.append('PRIMARY_STRUCTURE_CONFIRMED');score+=2
    else:blockers.append('PRIMARY_STRUCTURE_NEUTRAL')
    if event:
        evidence.append('CANONICAL_EVENT_AVAILABLE');score+=1
        if event.get('hash_valid',True):score+=1
    else:warnings.append('NO_CURRENT_CANONICAL_EVENT')

    causal=external.get('causal') or {}
    if external.get('status')!='CONTEXT_UNAVAILABLE':
        evidence.append('RECORDED_EXTERNAL_CONTEXT');score+=1
        if not (external.get('news') or external.get('macro')):warnings.append('EXTERNAL_CONTEXT_EMPTY_AFTER_FILTER')
    else:warnings.append('EXTERNAL_CONTEXT_UNAVAILABLE')
    if causal.get('status')=='PROFILE_CAUSAL_CONTEXT_AVAILABLE':
        evidence.append('PROFILE_WEIGHTED_CAUSAL_CONTEXT')
        if int(causal.get('high_relevance_count') or 0)>0:score+=1
        if int((causal.get('timestamp_integrity') or {}).get('issue_count') or 0)>0:warnings.append('EXTERNAL_TIMESTAMP_INTEGRITY_REVIEW')
    elif external.get('status')!='CONTEXT_UNAVAILABLE':
        warnings.append('NO_PROFILE_RELEVANT_CAUSAL_DRIVER')

    mature=int(learning.get('mature_cases') or 0)
    if mature>=30:evidence.append('LEARNING_SAMPLE_GATE_MET');score+=2
    elif mature>0:evidence.append('EARLY_FORWARD_LEARNING_MEMORY');score+=1;warnings.append('LEARNING_SAMPLE_NOT_MATURE')
    else:warnings.append('NO_MATURE_LEARNING_CASES')

    perf_n=int(performance.get('mature_cases') or 0)
    if perf_n>=30:evidence.append('PERFORMANCE_RESEARCH_SAMPLE_GATE_MET')
    validation_status=validation.get('status','INSUFFICIENT_SAMPLE')
    if validation_status=='PROMOTION_REVIEW_ELIGIBLE_NO_AUTO_CHANGE':
        evidence.append('CHRONOLOGICAL_WALK_FORWARD_REVIEW_ELIGIBLE')
    else:
        warnings.append('WALK_FORWARD_'+validation_status)

    ms=market_state.get('state')
    if ms=='STRUCTURAL_REVERSAL':blockers.append('STRUCTURAL_REVERSAL_AGAINST_CURRENT_THESIS')
    elif ms=='REVERSAL_WARNING':warnings.append('REVERSAL_WARNING_NEEDS_PERSISTENCE')
    elif ms=='PULLBACK_NORMAL':evidence.append('PULLBACK_INSIDE_FROZEN_STRUCTURE')
    elif ms=='TREND_CONTINUATION':evidence.append('TREND_CONTINUATION_STATE')
    elif ms=='RETEST':evidence.append('STRUCTURAL_RETEST_STATE')
    elif ms=='FALSE_BREAK_SWEEP':evidence.append('FALSE_BREAK_OR_SWEEP_RECLAIM')
    if status=='SETUP_CLOSED_CANDLE':score+=2;evidence.append('CLOSED_CANDLE_SETUP')
    elif status.startswith('WAIT_') or status in ('INSUFFICIENT_HISTORY','INVALID_MANDATORY_HISTORY'):blockers.append(status)
    grade='A' if score>=10 else 'B' if score>=7 else 'C' if score>=4 else 'D'
    if status in ('WAIT_DATA_INTEGRITY','INVALID_MANDATORY_HISTORY'):posture='HOLD_DATA_INTEGRITY'
    elif status=='INSUFFICIENT_HISTORY':posture='WAIT_HISTORY'
    elif status=='SETUP_CLOSED_CANDLE' and usable:posture='CONDITIONAL_SETUP_RESEARCH'
    else:posture='WAIT_FOR_EVIDENCE'
    return {'version':VERSION,'profile':profile,'posture':posture,'directional_bias':bias,
            'evidence_grade':grade,'evidence_points':score,'evidence':evidence,'blockers':blockers,'warnings':warnings,
            'study_status':status,'regime':snapshot.get('regime','UNKNOWN'),'primary_tf':snapshot.get('primary_tf'),
            'canonical_event_id':event.get('id') if event else None,'canonical_event_types':event.get('event_types',[]) if event else [],
            'learning_mature_cases':mature,'learning_sample_gate_met':mature>=30,
            'performance_mature_cases':perf_n,'performance_expectancy_proxy_atr':performance.get('expectancy_proxy_atr'),
            'walk_forward_status':validation_status,'walk_forward_candidate_promoted':False,
            'external_context_status':external.get('status','CONTEXT_UNAVAILABLE'),
            'causal_context_status':causal.get('status','CONTEXT_UNAVAILABLE'),
            'dominant_causal_drivers':[x.get('driver') for x in (causal.get('dominant_drivers') or [])[:4]],
            'pullback_reversal_state':ms or 'UNRESOLVED',
            'not_win_probability':True,'not_broker_instruction':True,'orders_sent':0}


def human_update(decision):
    d=decision;bias=d.get('directional_bias','NONE');post=d.get('posture','WAIT_FOR_EVIDENCE')
    event=', '.join(d.get('canonical_event_types') or []) or 'no canonical event'
    blockers=', '.join((d.get('blockers') or [])[:3]) or 'no hard blocker'
    warnings=', '.join((d.get('warnings') or [])[:2]) or 'none'
    drivers=', '.join(d.get('dominant_causal_drivers') or []) or 'no dominant causal driver'
    return f"{d.get('profile')} {d.get('primary_tf')}: {post} • bias {bias} • {event}. Evidence grade {d.get('evidence_grade')} (not win probability). Causal context: {drivers}. Hard blockers: {blockers}. Warnings: {warnings}."
