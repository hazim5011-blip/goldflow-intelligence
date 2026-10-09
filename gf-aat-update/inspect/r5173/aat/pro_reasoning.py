"""GF-AAT Professional Reasoning Council (R5.6).

Auditable, evidence-grounded synthesis that behaves like a disciplined trader:
observe facts, compare competing hypotheses, resolve multi-timeframe conflicts,
state what would change the thesis, and choose a conservative research action.

This is NOT a copy of a proprietary/hidden LLM and does not expose hidden
chain-of-thought.  It is a deterministic research-reasoning layer built on the
robot's own verified MT5 evidence and recorded context.
"""
from __future__ import annotations
from typing import Any

VERSION = 'GF-AAT-PRO-REASONING-COUNCIL-1.2.0'

_DIR = {'BULLISH': 1, 'BUY': 1, 'BEARISH': -1, 'SELL': -1}


def _arr(v):
    if v is None:
        return []
    if isinstance(v, list):
        return v
    if isinstance(v, tuple):
        return list(v)
    return [v]


def _num(v):
    try:
        return round(float(v), 8)
    except Exception:
        return None


def _direction(v):
    return _DIR.get(str(v or '').upper(), 0)


def _first(*values):
    for value in values:
        if value not in (None, '', [], {}):
            return value
    return None


def _price_action(analyst: dict[str, Any], primary_tf: str):
    pa = analyst.get('price_action') or {}
    frames = pa.get('frames') if isinstance(pa, dict) else {}
    return (frames or {}).get(primary_tf, {}) if primary_tf else {}


def _level(pa: dict[str, Any], key: str):
    row = pa.get(key)
    return _num(row.get('level')) if isinstance(row, dict) else None


def _mtf_matrix(analyst: dict[str, Any], bias: str):
    bias_dir = _direction(bias)
    rows = []
    supportive = opposing = neutral = 0
    primary_dir = 0
    mandatory_opposition = []
    for row in _arr(analyst.get('timeframe_story')):
        if not isinstance(row, dict):
            continue
        trend = str(row.get('trend') or 'UNKNOWN').upper()
        structure = str(row.get('structure') or 'UNKNOWN').upper()
        role = str(row.get('role') or 'OPTIONAL_CONTEXT').upper()
        votes = [_direction(trend), _direction(structure)]
        nonzero = [x for x in votes if x]
        direction = 0
        if nonzero:
            s = sum(nonzero)
            direction = 1 if s > 0 else -1 if s < 0 else 0
        if role == 'PRIMARY':
            primary_dir = direction
        relation = 'NEUTRAL'
        if bias_dir and direction == bias_dir:
            relation = 'SUPPORTS_THESIS'; supportive += 1
        elif bias_dir and direction == -bias_dir:
            relation = 'OPPOSES_THESIS'; opposing += 1
            if role == 'MANDATORY_CONTEXT':
                mandatory_opposition.append(str(row.get('tf')))
        else:
            neutral += 1
        rows.append({
            'tf': row.get('tf'), 'role': role, 'trend': trend, 'structure': structure,
            'direction': 'BULLISH' if direction > 0 else 'BEARISH' if direction < 0 else 'NEUTRAL',
            'relation_to_thesis': relation,
        })
    conflict = 'NONE'
    if mandatory_opposition:
        conflict = 'MANDATORY_HTF_CONFLICT'
    elif bias_dir and primary_dir and primary_dir != bias_dir:
        conflict = 'PRIMARY_CONFLICT'
    elif opposing and supportive:
        conflict = 'MIXED_MTF'
    return {
        'rows': rows, 'supportive_timeframes': supportive, 'opposing_timeframes': opposing,
        'neutral_timeframes': neutral, 'mandatory_opposition': mandatory_opposition,
        'conflict': conflict,
    }


def _structure_expert(bias: str, analyst: dict[str, Any], market_state: dict[str, Any], mtf: dict[str, Any]):
    state = str(market_state.get('state') or 'UNRESOLVED').upper()
    support = 0; conflict = 0; notes = []
    if bias in ('BUY', 'SELL'):
        support += 1; notes.append(f'Established thesis={bias}')
    if mtf['supportive_timeframes'] >= 2:
        support += 2; notes.append('At least two timeframe rows support the thesis')
    if mtf['mandatory_opposition']:
        conflict += 3; notes.append('Mandatory higher-timeframe opposition: ' + ', '.join(mtf['mandatory_opposition']))
    elif mtf['opposing_timeframes']:
        conflict += 1; notes.append('Some timeframe evidence opposes the thesis')
    if state == 'TREND_CONTINUATION':
        support += 2; notes.append('Closed-candle state = TREND_CONTINUATION')
    elif state == 'PULLBACK_NORMAL':
        support += 1; notes.append('Counter move remains classified as PULLBACK_NORMAL')
    elif state == 'REVERSAL_WARNING':
        conflict += 2; notes.append('Reversal warning is active')
    elif state == 'STRUCTURAL_REVERSAL':
        conflict += 5; notes.append('Structural reversal is confirmed relative to current thesis')
    elif state == 'FALSE_BREAK_SWEEP':
        notes.append('False-break/sweep state: wait for follow-through rather than chase')
    elif state == 'RETEST':
        notes.append('Retest state: acceptance/rejection close remains decisive')
    verdict = 'SUPPORTS' if support > conflict else 'OPPOSES' if conflict > support else 'MIXED'
    return {'expert': 'STRUCTURE', 'support_points': support, 'conflict_points': conflict, 'verdict': verdict, 'notes': notes[:6]}


def _liquidity_expert(bias: str, analyst: dict[str, Any], market_state: dict[str, Any], event: dict[str, Any]):
    primary = analyst.get('primary_tf')
    pa = _price_action(analyst, primary)
    state = str(market_state.get('state') or 'UNRESOLVED').upper()
    support = conflict = 0; notes = []
    pools = pa.get('liquidity_pools') or {}
    if pools.get('equal_highs'):
        notes.append(f"Equal-high liquidity pools={len(pools.get('equal_highs') or [])}")
    if pools.get('equal_lows'):
        notes.append(f"Equal-low liquidity pools={len(pools.get('equal_lows') or [])}")
    flips = _arr(pa.get('sbr_rbs'))
    if flips:
        notes.append('SBR/RBS candidates: ' + ', '.join(str(x.get('type')) for x in flips[-3:] if isinstance(x, dict)))
    ev = set(_arr(event.get('event_types') or event.get('events')))
    if state == 'FALSE_BREAK_SWEEP' or {'SWEEP_LOW_RECLAIM', 'SWEEP_HIGH_RECLAIM'} & ev:
        notes.append('Liquidity sweep/reclaim detected; reclaim follow-through required')
        support += 1
    if bias == 'BUY' and 'SWEEP_LOW_RECLAIM' in ev:
        support += 2
    if bias == 'SELL' and 'SWEEP_HIGH_RECLAIM' in ev:
        support += 2
    if bias == 'BUY' and 'SWEEP_HIGH_NO_RECLAIM' in ev:
        conflict += 1
    if bias == 'SELL' and 'SWEEP_LOW_NO_RECLAIM' in ev:
        conflict += 1
    if not notes:
        notes.append('No decisive liquidity event in the current audited bundle')
    verdict = 'SUPPORTS' if support > conflict else 'OPPOSES' if conflict > support else 'MIXED'
    return {'expert': 'LIQUIDITY', 'support_points': support, 'conflict_points': conflict, 'verdict': verdict, 'notes': notes[:6]}


def _momentum_expert(bias: str, analyst: dict[str, Any]):
    primary = analyst.get('primary_tf')
    pa = _price_action(analyst, primary)
    mom = str((pa.get('momentum') or {}).get('state') or 'UNKNOWN').upper()
    disp = str((pa.get('displacement') or {}).get('direction') or 'NONE').upper()
    vol = str((pa.get('volatility') or {}).get('state') or 'UNKNOWN').upper()
    bdir = _direction(bias); support = conflict = 0; notes = [f'Momentum={mom}', f'Displacement={disp}', f'Volatility={vol}']
    if bdir:
        mdir = _direction(mom); ddir = _direction(disp)
        if mdir == bdir: support += 1
        elif mdir == -bdir: conflict += 1
        if ddir == bdir: support += 2
        elif ddir == -bdir: conflict += 2
    if vol == 'EXPANDING':
        notes.append('Expansion raises follow-through potential but also chase/slippage risk')
    elif vol == 'CONTRACTING':
        notes.append('Contraction lowers urgency; wait for expansion/acceptance')
    verdict = 'SUPPORTS' if support > conflict else 'OPPOSES' if conflict > support else 'MIXED'
    return {'expert': 'MOMENTUM_VOLATILITY', 'support_points': support, 'conflict_points': conflict, 'verdict': verdict, 'notes': notes}


def _context_expert(bias: str, causal: dict[str, Any], asset: dict[str, Any]):
    support = conflict = 0; notes = []
    bdir = _direction(bias)
    for row in _arr(causal.get('dominant_drivers'))[:8]:
        if not isinstance(row, dict):
            continue
        imps = set(_arr(row.get('implications')))
        name = str(row.get('driver') or 'UNKNOWN')
        bull = any('GOLD_SUPPORT' in x or 'SAFE_HAVEN_SUPPORT' in x for x in imps)
        bear = any('GOLD_HEADWIND' in x for x in imps)
        relation = 'MIXED'
        if bdir > 0 and bull or bdir < 0 and bear:
            support += 1; relation = 'SUPPORTS'
        elif bdir > 0 and bear or bdir < 0 and bull:
            conflict += 1; relation = 'OPPOSES'
        notes.append(f'{name}: {relation}')
    policy = (asset.get('policy') or {}) if isinstance(asset, dict) else {}
    relevant = _arr(policy.get('relevant_external_context'))
    if not notes and relevant:
        notes.append('Optional context unavailable/unverified: ' + ', '.join(map(str, relevant[:6])))
    if not notes:
        notes.append('No profile-relevant causal driver is verified in this bundle')
    verdict = 'SUPPORTS' if support > conflict else 'OPPOSES' if conflict > support else 'MIXED'
    return {'expert': 'CAUSAL_CONTEXT', 'support_points': support, 'conflict_points': conflict, 'verdict': verdict,
            'notes': notes[:8], 'optional_context_only': True}


def _learning_expert(learning: dict[str, Any], validation: dict[str, Any], performance: dict[str, Any]):
    mature = int(_first(validation.get('mature_cases'), learning.get('mature_cases'), performance.get('mature_cases'), 0) or 0)
    minimum = int(_first(validation.get('minimum_mature_cases'), learning.get('rule_change_sample_gate'), 30) or 30)
    status = str(validation.get('status') or 'INSUFFICIENT_SAMPLE')
    notes = [f'Mature cases={mature}/{minimum}', f'Walk-forward={status}', 'T0 is immutable; auto rule mutation is OFF']
    verdict = 'MATURE_REVIEW_ELIGIBLE' if mature >= minimum and status == 'PROMOTION_REVIEW_ELIGIBLE_NO_AUTO_CHANGE' else 'BUILDING_SAMPLE'
    return {'expert': 'LEARNING_SELF_REVIEW', 'support_points': 0, 'conflict_points': 0, 'verdict': verdict,
            'notes': notes, 'mature_cases': mature, 'minimum': minimum, 'auto_rule_mutation': False}


def _integrity_expert(system_readiness: dict[str, Any], readiness: dict[str, Any]):
    profile_audit = (readiness.get('integrity_audit') or {}) if isinstance(readiness, dict) else {}
    global_audit = (system_readiness.get('integrity_audit') or {}) if isinstance(system_readiness, dict) else {}
    audit = profile_audit or global_audit
    hard = bool(profile_audit.get('review_required'))
    material = int(audit.get('material_conflicts') or 0)
    total = int(audit.get('total_conflicts') or 0)
    notes = [f'Profile-scope integrity conflicts={total}; material={material}']
    if hard:
        notes.append('Hard block: material OHLC conflict overlaps this profile active evidence window')
    else:
        notes.append('No material integrity hard block is active for this profile evidence window')
        if int(global_audit.get('material_conflicts') or 0)>material:
            notes.append('Global archive still has material conflicts outside this profile scope; keep them quarantined for diagnostics/learning review')
    return {'expert': 'DATA_INTEGRITY', 'support_points': 0, 'conflict_points': 99 if hard else 0,
            'verdict': 'HARD_BLOCK' if hard else 'CLEAR', 'notes': notes, 'hard_block': hard, 'audit': audit}


def _hypotheses(bias: str, state: str, analyst: dict[str, Any], mtf: dict[str, Any]):
    state = str(state or 'UNRESOLVED').upper(); base = []
    if bias in ('BUY', 'SELL'):
        base.append({'name': f'{bias}_THESIS_CONTINUES', 'kind': 'BASE', 'claim': f'Current {bias} thesis remains valid unless structural invalidation is confirmed.'})
        other = 'SELL' if bias == 'BUY' else 'BUY'
        base.append({'name': f'{other}_REVERSAL_CASE', 'kind': 'COUNTER', 'claim': f'Opposing {other} case becomes credible only with persistent closed-candle structural reversal and mandatory-TF support.'})
    else:
        base.append({'name': 'NO_MATURE_DIRECTION', 'kind': 'BASE', 'claim': 'Neither BUY nor SELL thesis is mature enough yet.'})
        base.append({'name': 'BULLISH_RESOLUTION_CASE', 'kind': 'ALTERNATE', 'claim': 'Bullish case requires accepted structure break/reclaim and MTF confirmation.'})
        base.append({'name': 'BEARISH_RESOLUTION_CASE', 'kind': 'ALTERNATE', 'claim': 'Bearish case requires accepted structure break/reclaim and MTF confirmation.'})
    if state == 'PULLBACK_NORMAL':
        base.append({'name': 'PULLBACK_NOT_REVERSAL', 'kind': 'BEHAVIOUR', 'claim': 'The counter-move remains inside frozen thesis structure.'})
    if mtf.get('mandatory_opposition'):
        base.append({'name': 'HTF_CONFLICT_CASE', 'kind': 'RISK', 'claim': 'Mandatory higher timeframe currently conflicts with the thesis.'})
    return base[:5]


def _change_mind(bias: str, market_state: dict[str, Any], analyst: dict[str, Any], blockers: list[str], integrity_hard: bool):
    primary = analyst.get('primary_tf')
    pa = _price_action(analyst, primary)
    support = _level(pa, 'nearest_support')
    resistance = _level(pa, 'nearest_resistance')
    ref_hi = _num(market_state.get('reference_high'))
    ref_lo = _num(market_state.get('reference_low'))
    items = []
    if integrity_hard:
        items.append('First resolve the material OHLC integrity conflict; no directional conclusion can override bad evidence.')
    if bias == 'BUY':
        level = ref_lo if ref_lo is not None else support
        items.append(f'Persistent accepted closes below bullish structural invalidation {level}' if level is not None else 'Persistent bearish BOS/CHoCH across mandatory hierarchy')
        items.append('Mandatory higher timeframe changes from supportive/neutral to persistent bearish structure')
    elif bias == 'SELL':
        level = ref_hi if ref_hi is not None else resistance
        items.append(f'Persistent accepted closes above bearish structural invalidation {level}' if level is not None else 'Persistent bullish BOS/CHoCH across mandatory hierarchy')
        items.append('Mandatory higher timeframe changes from supportive/neutral to persistent bullish structure')
    else:
        if resistance is not None:
            items.append(f'Bullish thesis can mature after accepted close/retest above resistance {resistance} with MTF confirmation')
        if support is not None:
            items.append(f'Bearish thesis can mature after accepted close/retest below support {support} with MTF confirmation')
        if support is None and resistance is None:
            items.append('Wait for confirmed structure + directional MTF alignment before choosing a thesis')
    if blockers:
        items.append('All hard blockers must clear: ' + ', '.join(blockers[:4]))
    return items[:6]


def _decision_quality(experts: list[dict[str, Any]], analyst: dict[str, Any], live: dict[str, Any], integrity_hard: bool):
    checks = {
        'verified_live_quote': str(live.get('quote_status') or '').upper() == 'LIVE_VERIFIED',
        'mtf_story_available': bool(analyst.get('timeframe_story')),
        'price_action_available': bool(analyst.get('price_action')),
        'scenario_tree_available': bool(analyst.get('scenario_tree')),
        'integrity_clear': not integrity_hard,
    }
    available = sum(bool(v) for v in checks.values())
    return {
        'coverage_checks_passed': available, 'coverage_checks_total': len(checks), 'checks': checks,
        'label': 'HIGH_AUDIT_COVERAGE' if available == len(checks) else 'PARTIAL_AUDIT_COVERAGE' if available >= 3 else 'LOW_AUDIT_COVERAGE',
        'not_win_probability': True,
    }


def _scalping_campaign_expert(profile: str, campaign: dict[str, Any]):
    if profile != 'SCALPING' or not isinstance(campaign, dict):
        return None
    master=campaign.get('master_campaign') or {};current=campaign.get('current_opportunity') or {};sel=current.get('selected') or {}
    support=conflict=0;notes=[]
    if master.get('side') in ('BUY','SELL'):
        support+=2;notes.append(f"Master campaign={master.get('state')} quality={master.get('quality_points')}")
    else:
        conflict+=2;notes.append('M5/M15 master campaign unresolved')
    if sel:
        notes.append(f"M1 setup={sel.get('setup_type')} {sel.get('side')} grade={sel.get('grade')} status={sel.get('status')}")
        if sel.get('entry_ready'):support+=3
        if sel.get('relationship_to_master_thesis')=='COUNTERTREND_SCALP':notes.append('Countertrend scalp requires liquidity objective + micro structural shift')
        conflict+=len(sel.get('blockers') or [])*2
    else:
        notes.append('No independent M1 re-entry trigger is mature now')
    verdict='SUPPORTS' if support>conflict else 'OPPOSES' if conflict>support else 'MIXED'
    return {'expert':'SCALPING_CAMPAIGN','support_points':support,'conflict_points':conflict,'verdict':verdict,'notes':notes[:6],
            'multiple_entries_allowed':True,'not_duplicate_signals':True}


def build(profile: str, bundle: dict[str, Any], live: dict[str, Any] | None = None,
          asset: dict[str, Any] | None = None, fleet_profile: dict[str, Any] | None = None):
    profile = profile.upper(); bundle = bundle or {}; live = live or {}; asset = asset or {}; fleet_profile = fleet_profile or {}
    decision = bundle.get('decision') or {}; analyst = bundle.get('analyst') or {}; market_state = bundle.get('market_state') or {}
    lifecycle = bundle.get('lifecycle') or {}; learning = bundle.get('learning') or {}; validation = bundle.get('validation') or {}
    performance = bundle.get('performance') or {}; readiness = bundle.get('readiness') or {}; system_readiness = bundle.get('system_readiness') or {}
    causal = ((bundle.get('external') or {}).get('causal') or {}); event = bundle.get('event') or {}
    bias = str(_first(decision.get('directional_bias'), analyst.get('bias'), (bundle.get('study') or {}).get('side'), 'NONE')).upper()
    state = str(market_state.get('state') or 'UNRESOLVED').upper(); blockers = list(decision.get('blockers') or [])

    mtf = _mtf_matrix(analyst, bias)
    experts = [
        _structure_expert(bias, analyst, market_state, mtf),
        _liquidity_expert(bias, analyst, market_state, event),
        _momentum_expert(bias, analyst),
        _context_expert(bias, causal, asset),
        _learning_expert(learning, validation, performance),
    ]
    campaign_expert=_scalping_campaign_expert(profile,bundle.get('scalping_campaign') or {})
    if campaign_expert:experts.append(campaign_expert)
    integrity = _integrity_expert(system_readiness, readiness); experts.append(integrity)
    hard = bool(integrity.get('hard_block'))
    supportive = sum(int(x.get('support_points') or 0) for x in experts if x.get('expert') != 'DATA_INTEGRITY')
    conflicting = sum(int(x.get('conflict_points') or 0) for x in experts if x.get('expert') != 'DATA_INTEGRITY')

    primary = analyst.get('primary_tf')
    pa = _price_action(analyst, primary)
    support = _level(pa, 'nearest_support'); resistance = _level(pa, 'nearest_resistance')
    thesis = {
        'side': bias,
        'state': state,
        'primary_tf': primary,
        'support': support,
        'resistance': resistance,
        'support_points': supportive,
        'conflict_points': conflicting,
        'lifecycle_phase': lifecycle.get('phase', 'WAIT_CONFIRMATION'),
    }
    counter_side = 'SELL' if bias == 'BUY' else 'BUY' if bias == 'SELL' else 'NONE'
    counter = {
        'side': counter_side,
        'credible_now': state == 'STRUCTURAL_REVERSAL' or bool(mtf.get('mandatory_opposition')),
        'warning_only': state == 'REVERSAL_WARNING',
        'reason': ('Structural reversal confirmed' if state == 'STRUCTURAL_REVERSAL' else
                   'Mandatory HTF opposition exists' if mtf.get('mandatory_opposition') else
                   'Reversal warning lacks full persistence/hierarchy' if state == 'REVERSAL_WARNING' else
                   'No confirmed counter-thesis'),
    }

    if hard:
        conclusion = 'WAIT_DATA_INTEGRITY_REVIEW'
        why = 'Material OHLC conflict is a hard evidence blocker. Resolve data truth before trading interpretation.'
    elif blockers:
        conclusion = 'WAIT_RESOLVE_BLOCKERS'
        why = 'Evidence is not yet actionable because hard blockers remain: ' + ', '.join(blockers[:4])
    elif profile=='SCALPING' and ((bundle.get('scalping_campaign') or {}).get('current_opportunity') or {}).get('entry_ready'):
        sc=(bundle.get('scalping_campaign') or {}).get('current_opportunity') or {};sel=sc.get('selected') or {}
        conclusion='SCALP_REENTRY_READY_RESEARCH'
        why=f"Independent M1 {sel.get('setup_type')} is mature inside the master campaign. Treat it as a new T0 re-entry opportunity, not a duplicate of the earlier campaign entry."
    elif state == 'STRUCTURAL_REVERSAL':
        conclusion = 'CANCEL_OR_REVISE_THESIS'
        why = 'Persistent structural reversal is stronger than the original thesis; review/cancel instead of treating it as a pullback.'
    elif state == 'REVERSAL_WARNING':
        conclusion = 'REVIEW_AND_WAIT'
        why = 'Opposing evidence is meaningful but not sufficiently persistent to flip direction.'
    elif state in ('PULLBACK_NORMAL', 'RETEST', 'FALSE_BREAK_SWEEP') and bias in ('BUY', 'SELL'):
        conclusion = 'HOLD_THESIS_WAIT_CONFIRMATION'
        why = 'Counter-move has not yet proven a structural reversal; wait for reclaim/rejection/acceptance evidence.'
    elif bias in ('BUY', 'SELL') and supportive > conflicting:
        conclusion = 'THESIS_SUPPORTED_BUT_CONDITIONAL'
        why = 'More audited expert evidence supports the thesis than opposes it, but lifecycle and entry rules remain mandatory.'
    else:
        conclusion = 'WAIT_FOR_DIRECTIONAL_RESOLUTION'
        why = 'No sufficiently dominant directional case exists after comparing structure, liquidity, momentum and context.'

    changes = _change_mind(bias, market_state, analyst, blockers, hard)
    hypotheses = _hypotheses(bias, state, analyst, mtf)
    quality = _decision_quality(experts, analyst, live, hard)

    fact_ledger = []
    for row in _arr(analyst.get('facts'))[:10]:
        if isinstance(row, dict):
            fact_ledger.append({'source': row.get('source'), 'claim': row.get('claim')})
    if not fact_ledger:
        for row in mtf['rows'][:6]:
            fact_ledger.append({'source': 'RAW_MT5_' + str(row.get('tf')), 'claim': f"trend={row.get('trend')} structure={row.get('structure')} role={row.get('role')}"})
    interpretations = [x.get('claim') for x in _arr(analyst.get('interpretations')) if isinstance(x, dict)][:8]
    if not interpretations:
        interpretations = [why]

    next_checkpoints = []
    if primary:
        next_checkpoints.append(f'Re-evaluate after the next CLOSED {primary} candle; ignore unfinished-candle color changes.')
    next_checkpoints.extend(_arr(analyst.get('next_watch'))[:4])
    if hard:
        next_checkpoints.insert(0, 'Resolve data-integrity conflict before any thesis maturation.')

    mentor = (
        f"{profile} {primary or ''}: {conclusion}. Thesis={bias}; state={state}. "
        f"Support evidence {supportive} point(s), conflict evidence {conflicting} point(s) — these are audit points, NOT win probability. "
        f"{why}"
    )

    return {
        'version': VERSION, 'profile': profile, 'primary_tf': primary,
        'conclusion': conclusion, 'why': why, 'thesis': thesis, 'counter_thesis': counter,
        'mtf_matrix': mtf, 'expert_council': experts, 'hypotheses': hypotheses,
        'what_would_change_my_mind': changes, 'next_decision_checkpoints': next_checkpoints[:7],
        'evidence_ledger': {'facts': fact_ledger, 'interpretations': interpretations, 'hypotheses': hypotheses},
        'decision_quality': quality, 'mentor_explanation_ms': mentor,
        'guardrails': [
            'Facts, interpretations and hypotheses remain separate.',
            'No future candle may rewrite an older T0 decision.',
            'Evidence points are NOT probability and NOT guaranteed win rate.',
            'Optional macro/news context cannot authorize an entry by itself.',
            'A single counter candle cannot auto-flip a higher-timeframe thesis.',
            'Research/Paper only; no broker order authority.',
        ],
        'trained_llm': False, 'hidden_model_copied': False, 'research_only': True,
        'auto_order_execution': False, 'orders_sent': 0,
    }
