"""Professional forward-signal publication gate for GF-AAT V1.5.

This gate does not execute broker orders. It decides whether a freshly observed,
closed-candle study is strong enough to be published as a conditional research
signal. Optional learning/news gaps remain warnings; market/data contradictions
remain hard blockers.
"""
from .settings import PROFILE_RULES

VERSION='GF-AAT-PROFESSIONAL-SIGNAL-GATE-1.7.0'
_ALLOWED_MARKET_STATES={'TREND_CONTINUATION','PULLBACK_NORMAL','RETEST','FALSE_BREAK_SWEEP'}
_BLOCKING_MARKET_STATES={'REVERSAL_WARNING','STRUCTURAL_REVERSAL','UNRESOLVED'}


def evaluate(profile, study, unified_detail, pre_entry_study=None):
    profile=profile.upper(); study=study or {}; unified_detail=unified_detail or {}; pre_entry_study=pre_entry_study or {}
    status=study.get('status','UNKNOWN')
    score=int(study.get('score') or 0)
    threshold=int(PROFILE_RULES[profile]['min_score'])
    hard=[]; advisory=[]
    if status!='SETUP_CLOSED_CANDLE':
        hard.append('NO_FRESH_CLOSED_CANDLE_SETUP')
    if status=='SETUP_CLOSED_CANDLE' and score<threshold:
        hard.append('PROFILE_SCORE_BELOW_THRESHOLD')
    posture=unified_detail.get('posture') or unified_detail.get('decision',{}).get('posture')
    if status=='SETUP_CLOSED_CANDLE' and posture!='CONDITIONAL_SETUP_RESEARCH':
        hard.append('UNIFIED_POSTURE_NOT_SETUP_READY')
    for x in (unified_detail.get('blockers') or []):
        if x not in hard: hard.append(x)
    ms=(unified_detail.get('market_state') or {}).get('state') or unified_detail.get('pullback_reversal_state')
    if ms in _BLOCKING_MARKET_STATES:
        hard.append('MARKET_STATE_'+ms)
    elif ms and ms not in _ALLOWED_MARKET_STATES:
        advisory.append('MARKET_STATE_'+str(ms))
    advisory.extend(x for x in (unified_detail.get('warnings') or []) if x not in advisory)
    if pre_entry_study:
        if not pre_entry_study.get('approved'):
            hard.append('PRE_ENTRY_MARKET_STUDY_NOT_APPROVED')
            hard.extend(x for x in (pre_entry_study.get('hard_blockers') or []) if x not in hard)
        advisory.extend(x for x in (pre_entry_study.get('advisories') or []) if x not in advisory)
        loss_guard=pre_entry_study.get('loss_memory_guard') or {}
        if loss_guard.get('block_publish'):
            hard.append('LOSS_MEMORY_EXACT_REPEAT_RISK')
            for x in (loss_guard.get('repeated_prior_loss_risks') or []):
                advisory.append('FIX_BEFORE_RETRY_'+str(x.get('code')))
    eligible=not hard and status=='SETUP_CLOSED_CANDLE' and score>=threshold and (bool(pre_entry_study.get('approved')) if pre_entry_study else True)
    return {
        'version':VERSION,'profile':profile,'eligible':eligible,
        'status':'PUBLICATION_READY' if eligible else 'WAIT_PROFESSIONAL_SIGNAL_GATE',
        'study_status':status,'score':score,'minimum_score':threshold,
        'market_state':ms or 'UNRESOLVED','hard_blocks':hard,'advisories':advisory,
        'pre_entry_market_study':pre_entry_study,
        'entry_is_conditional_not_execution':True,'broker_order_authority':False,'orders_sent':0,
    }
