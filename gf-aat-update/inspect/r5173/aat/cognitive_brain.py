"""GF-AAT R5.4 structured cognitive research synthesizer.

This module does NOT expose hidden chain-of-thought and is not a general LLM.
It turns already-audited GF-AAT evidence into a concise professional trader
briefing: what is observed, what it means, what is still missing, and what the
robot should do next in RESEARCH/PAPER mode.

Design goals:
- raw broker evidence remains authoritative;
- one counter candle never automatically flips a thesis;
- pullback/retest/sweep are distinguished from structural reversal;
- optional macro/news context can support or oppose but cannot authorize entry;
- T0 evidence and invalidation remain immutable;
- learning is advisory until sample + walk-forward gates are satisfied;
- no real broker order is ever sent.
"""
from __future__ import annotations
from typing import Any

VERSION='GF-AAT-COGNITIVE-RESEARCH-BRAIN-1.8.0'


def _first(*values):
    for v in values:
        if v not in (None,'',[],{}):
            return v
    return None


def _list(v):
    if v is None:return []
    if isinstance(v,list):return v
    if isinstance(v,tuple):return list(v)
    return [v]


def _fmt_num(v):
    if v is None:return None
    try:
        return round(float(v),8)
    except Exception:return v


def _mtf_story(analyst:dict[str,Any]):
    out=[]
    for row in _list(analyst.get('timeframe_story')):
        if not isinstance(row,dict):continue
        out.append({
            'tf':row.get('tf'),'role':row.get('role'),'trend':row.get('trend','UNKNOWN'),
            'structure':row.get('structure','UNKNOWN'),'price_action':row.get('price_action','UNAVAILABLE')
        })
    return out


def _state_action(bias:str,state:str,phase:str,posture:str,blockers:list[str],integrity_hard:bool=False):
    bias=(bias or 'NONE').upper();state=(state or 'UNRESOLVED').upper();phase=(phase or 'WAIT_CONFIRMATION').upper()
    posture=(posture or 'WAIT_FOR_EVIDENCE').upper()
    if integrity_hard:
        return 'WAIT_DATA_INTEGRITY_REVIEW','Data OHLC mempunyai conflict material yang belum disahkan. Jangan matang atau aktifkan entry study sehingga evidence candle konflik diaudit.'
    if blockers:
        return 'WAIT_RESOLVE_BLOCKERS','Jangan paksa signal. Selesaikan hard blocker sebelum entry study boleh matang.'
    if state=='STRUCTURAL_REVERSAL':
        if phase in ('PAPER_ACTIVE','MANAGE'):
            return 'EXIT_REVIEW','Structural reversal disahkan relatif kepada thesis semasa. Lindungi/semak paper position; jangan tambah risiko.'
        return 'CANCEL_OR_REVISE_THESIS','Structural reversal disahkan. Pending thesis perlu CANCEL/REVIEW, bukan sekadar dianggap pullback.'
    if state=='REVERSAL_WARNING':
        return 'REVIEW_AND_WAIT','Reversal risk meningkat tetapi belum cukup untuk auto-flip. Tunggu persistence/parent confirmation.'
    if state=='FALSE_BREAK_SWEEP':
        return 'WAIT_RECLAIM_FOLLOW_THROUGH','Sweep/false break dikesan. Tunggu reclaim dan follow-through; jangan chase spike.'
    if state=='RETEST':
        return 'WAIT_RETEST_CONFIRMATION','Market sedang retest struktur. Tunggu rejection/acceptance close sebelum ENTRY_READY.'
    if state=='PULLBACK_NORMAL':
        if bias in ('BUY','SELL'):
            return 'HOLD_THESIS_WAIT_CONFIRMATION',f'Counter-move masih lebih konsisten sebagai pullback dalam thesis {bias}; thesis belum batal.'
        return 'WAIT_DIRECTIONAL_STRUCTURE','Pullback/transition wujud tetapi belum ada thesis arah yang cukup matang.'
    if state=='TREND_CONTINUATION':
        if phase in ('READY','WAIT_RETEST'):
            return 'WAIT_ENTRY_RULES','Continuation menyokong thesis, tetapi entry masih perlu zone + quote/spread + lifecycle confirmation.'
        return 'HOLD_THESIS','Continuation menyokong thesis semasa; jangan chase jika harga sudah jauh dari plan.'
    if posture in ('ENTRY_READY','CONFIRMED','READY'):
        return 'ENTRY_RESEARCH_READY','Evidence research sudah matang mengikut gate semasa; kekal paper/read-only dan ikut plan immutable.'
    return 'WAIT_FOR_EVIDENCE','Bukti belum cukup. Tunggu closed-candle structure/pattern/context yang relevan.'


def _trade_map(bundle:dict[str,Any],analyst:dict[str,Any]):
    tm=analyst.get('trade_map') if isinstance(analyst,dict) else None
    if not isinstance(tm,dict):
        plan=(bundle.get('study') or {}).get('plan')
        if isinstance(plan,dict):
            tm={'mode':'RESEARCH_PREVIEW','side':plan.get('side'),'entry_zone':[plan.get('entry_low'),plan.get('entry_high')],
                'sl':plan.get('sl'),'tp1':plan.get('tp1'),'tp2':plan.get('tp2'),'tp3':plan.get('tp3'),
                'entry_geometry':((plan.get('evidence') or {}).get('structural_entry_geometry') or {})}
    if not isinstance(tm,dict):return None
    return {
        'mode':tm.get('mode'),'side':tm.get('side'),
        'entry_zone':tm.get('entry_zone'),'invalidation_sl':_fmt_num(tm.get('sl')),
        'tp1':_fmt_num(tm.get('tp1')),'tp2':_fmt_num(tm.get('tp2')),'tp3':_fmt_num(tm.get('tp3')),
        'state':tm.get('state'),'entry_geometry':tm.get('entry_geometry') or {},'research_only':True,
    }


def build(profile:str,bundle:dict[str,Any],live:dict[str,Any]|None=None,asset:dict[str,Any]|None=None,
          fleet_profile:dict[str,Any]|None=None,recent_events:list[dict[str,Any]]|None=None):
    """Build a compact auditable trader briefing from an existing decision bundle."""
    profile=profile.upper();bundle=bundle or {};live=live or {};asset=asset or {};fleet_profile=fleet_profile or {}
    decision=bundle.get('decision') or {};analyst=bundle.get('analyst') or {};teaching=bundle.get('teaching') or {}
    market_state=bundle.get('market_state') or {};lifecycle=bundle.get('lifecycle') or {};study=bundle.get('study') or {}
    causal=((bundle.get('external') or {}).get('causal') or {});learning=bundle.get('learning') or {}
    performance=bundle.get('performance') or {};validation=bundle.get('validation') or {};readiness=bundle.get('readiness') or {};system_readiness=bundle.get('system_readiness') or {}
    scalping_campaign=bundle.get('scalping_campaign') or {}
    pre_entry=bundle.get('pre_entry_study') or study.get('pre_entry_market_study') or {}
    pattern_brain=bundle.get('pattern_brain') or study.get('pattern_brain') or {}
    adaptive_tools=bundle.get('adaptive_tools') or study.get('adaptive_tools') or {}

    bias=_first(decision.get('directional_bias'),analyst.get('bias'),study.get('side'),study.get('side_bias'),'NONE')
    grade=decision.get('evidence_grade','D');posture=decision.get('posture','WAIT_FOR_EVIDENCE')
    state=market_state.get('state','UNRESOLVED');phase=lifecycle.get('phase','WAIT_CONFIRMATION')
    blockers=list(decision.get('blockers') or []);warnings=list(decision.get('warnings') or [])
    profile_integrity=(readiness.get('integrity_audit') or {}) if isinstance(readiness,dict) else {}
    global_integrity=(system_readiness.get('integrity_audit') or {}) if isinstance(system_readiness,dict) else {}
    integrity=profile_integrity or global_integrity
    integrity_hard=bool(profile_integrity.get('review_required'))
    action,action_reason=_state_action(str(bias),str(state),str(phase),str(posture),blockers,integrity_hard)
    story=_mtf_story(analyst)

    sees=[]
    if story:
        sees.append('MTF: '+' | '.join(f"{x['tf']} {x['trend']}/{x['structure']}" for x in story))
    if market_state.get('reason'):sees.append('Behaviour: '+str(market_state.get('reason')))
    pa=(analyst.get('price_action') or {}).get('frames',{}) if isinstance(analyst.get('price_action'),dict) else {}
    primary=analyst.get('primary_tf') or teaching.get('primary_tf')
    ppa=pa.get(primary,{}) if isinstance(pa,dict) else {}
    ns=(ppa.get('nearest_support') or {}).get('level') if isinstance(ppa.get('nearest_support'),dict) else None
    nr=(ppa.get('nearest_resistance') or {}).get('level') if isinstance(ppa.get('nearest_resistance'),dict) else None
    if ns is not None or nr is not None:sees.append(f"Nearest structure: support {_fmt_num(ns)} / resistance {_fmt_num(nr)}")
    event_types=[]
    event=bundle.get('event') or {}
    if isinstance(event,dict):event_types=list(event.get('event_types') or event.get('events') or [])
    if event_types:sees.append('Canonical event: '+', '.join(event_types))
    relp=list((pattern_brain or {}).get('relevant_patterns') or [])
    if relp:
        sees.append('Pattern context: '+', '.join(str(x.get('pattern'))+('/'+str(x.get('status')) if x.get('status') else '') for x in relp[:4]))
    if live.get('quote_status'):sees.append('Live quote: '+str(live.get('quote_status')))
    if profile=='SCALPING' and scalping_campaign:
        mc=scalping_campaign.get('master_campaign') or {};co=scalping_campaign.get('current_opportunity') or {};sel=co.get('selected') or {};coach=scalping_campaign.get('professional_trade_coach') or {}
        sees.insert(0,f"Scalping master campaign: {mc.get('state','UNKNOWN')} • phase {mc.get('phase','UNKNOWN')} • M1 execution inside M5/M15 context")
        if coach.get('phase'):sees.insert(1,f"Professional trade phase: {coach.get('phase')} • next action {coach.get('professional_action')}")
        if sel:
            sees.insert(2,f"Current M1 setup: {sel.get('setup_type')} {sel.get('side')} • grade {sel.get('grade')} • {sel.get('status')} • room {sel.get('room_to_objective_r','—')}R")

    thinks=[]
    if str(bias).upper() in ('BUY','SELL'):
        thinks.append(f"Base thesis condong {str(bias).upper()}, tetapi evidence grade {grade} bukan win probability.")
    if pre_entry:
        if pre_entry.get('approved'):
            thinks.insert(0,f"Professional pre-entry study LULUS: playbook {pre_entry.get('selected_playbook','—')} • grade {pre_entry.get('grade')} / {pre_entry.get('points')} points. Robot hanya guna teknik yang relevan dengan setup ini; bukan semua teknik dipaksa pada setiap entry.")
        else:
            thinks.insert(0,f"Professional pre-entry study BELUM LULUS: {pre_entry.get('points',0)}/{pre_entry.get('minimum_points','—')} points. Robot tidak boleh publish entry hanya kerana pattern muncul.")
    else:
        thinks.append('Belum ada directional thesis yang cukup matang untuk BUY/SELL research signal.')
    if adaptive_tools:
        chosen=[x.get('tool') for x in (adaptive_tools.get('selected_tools') or []) if x.get('role') in ('PLAYBOOK','CORE')][:8]
        if chosen:thinks.append('Tool selection ikut playbook, bukan semua indicator: '+', '.join(chosen)+'.')
    if pattern_brain:
        rp=list(pattern_brain.get('relevant_patterns') or [])
        if rp:
            compat=[x.get('pattern') for x in rp if x.get('side_compatible')][:4]
            conflict=[x.get('pattern') for x in rp if not x.get('side_compatible')][:3]
            if compat:thinks.append('Pattern yang menyokong setup semasa: '+', '.join(map(str,compat))+'. Pattern hanya evidence sokongan, bukan entry authority.')
            if conflict:thinks.append('Pattern/context lawan thesis dikesan: '+', '.join(map(str,conflict))+'. Ia perlu dinilai, bukan diabaikan.')
    if profile=='SCALPING' and scalping_campaign:
        mc=scalping_campaign.get('master_campaign') or {};co=scalping_campaign.get('current_opportunity') or {};sel=co.get('selected') or {};coach=scalping_campaign.get('professional_trade_coach') or {}
        thinks.insert(0,'Scalping tidak dibaca sebagai satu signal tunggal. Satu master campaign boleh menghasilkan beberapa entry berasingan apabila M1 membentuk re-entry cycle baru dan M5/M15 thesis masih intact.')
        if coach.get('why'):thinks.insert(1,'Pro trade coach: '+str(coach.get('why')))
        if sel:
            thinks.insert(1,f"Micro setup {sel.get('setup_type')} dinilai sebagai {sel.get('relationship_to_master_thesis')} dengan score {sel.get('score')} / grade {sel.get('grade')} (bukan win probability).")
        elif mc.get('side') in ('BUY','SELL'):
            thinks.insert(1,f"Master campaign {mc.get('side')} masih wujud tetapi tiada trigger M1 profesional sekarang; robot mesti tunggu, bukan paksa entry.")
    if state=='PULLBACK_NORMAL':thinks.append('Counter-move belum mematahkan frozen structure; lebih sesuai diklasifikasi pullback daripada reversal.')
    elif state=='REVERSAL_WARNING':thinks.append('Ada bukti lawan thesis, tetapi persistence/hierarchy belum cukup untuk structural reversal.')
    elif state=='STRUCTURAL_REVERSAL':thinks.append('Persistence + opposing hierarchy memenuhi syarat structural reversal relatif kepada thesis semasa.')
    elif state=='FALSE_BREAK_SWEEP':thinks.append('Break intrabar telah direclaim; jangan tafsir spike sebagai genuine breakout tanpa acceptance.')
    elif state=='TREND_CONTINUATION':thinks.append('Closed-candle extension dan hierarchy semasa menyokong continuation thesis.')
    elif state=='RETEST':thinks.append('Harga sedang menguji semula level struktur; reaction close selepas retest lebih penting daripada intrabar spike.')
    if integrity_hard:
        cls=integrity.get('classifications') or {}
        thinks.append('DATA INTEGRITY HARD BLOCK: material OHLC conflict mesti disiasat sebelum signal boleh matang.')
        thinks.append(f"Integrity audit: material={integrity.get('material_conflicts',0)} / total={integrity.get('total_conflicts',0)}; unclassified={cls.get('UNCLASSIFIED',0)}.")
    if not integrity_hard and int(global_integrity.get('material_conflicts') or 0)>int(profile_integrity.get('material_conflicts') or 0):
        thinks.append('Historical/material conflicts exist outside this robot active evidence scope. They remain quarantined for audit and must not be used to block an unrelated timeframe thesis.')
    if blockers:thinks.append('Hard blocker aktif: '+', '.join(blockers[:4]))
    elif warnings:thinks.append('Advisory warning: '+', '.join(warnings[:3]))
    outcome_audit=(performance.get('forward_entry_outcomes') or {}) if isinstance(performance,dict) else {}
    if outcome_audit:
        churn=outcome_audit.get('pre_entry_churn_rate')
        oq=outcome_audit.get('activated_outcome_quality_flag')
        if oq=='ACTIVATED_OUTCOME_POOR_HARD_REVIEW_REQUIRED':
            thinks.insert(0,'SELF-REVIEW HARD WARNING: terlalu banyak activated research paths berakhir SL dalam sample semasa. Jangan terus ulang setup lama; R5.11 Pro Entry Study mesti membina sample baru sebelum prestasi dinilai semula.')
        elif oq=='ACTIVATED_OUTCOME_WEAK_REVIEW_REQUIRED':
            thinks.insert(0,'SELF-REVIEW WARNING: activated research outcomes masih lemah. Ketatkan location/confirmation gate dan jangan tambah frequency untuk mengejar losses.')
        if outcome_audit.get('quality_flag')=='PUBLICATION_GATE_TOO_EARLY_HIGH_PRE_ENTRY_CHURN':
            thinks.append(f"Self-review publication gate: {round(float(churn or 0)*100)}% recent setup records cancelled/expired before provable entry activation. Itu bukan trade loss, tetapi terlalu banyak standby attrition dan gate perlu dikalibrasi.")
        elif outcome_audit.get('quality_flag')=='PUBLICATION_GATE_REVIEW_RECOMMENDED':
            thinks.append(f"Self-review publication gate: pre-entry attrition {round(float(churn or 0)*100)}%; bezakan setup standby daripada entry sebenar sebelum menilai win/loss.")

    waits=list(analyst.get('next_watch') or teaching.get('next_watch') or [])[:6]
    if pre_entry and not pre_entry.get('approved') and pre_entry.get('hard_blockers'):
        waits.insert(0,'Pre-entry blockers: '+', '.join(map(str,list(pre_entry.get('hard_blockers') or [])[:4])))
    if outcome_audit.get('quality_flag') in ('PUBLICATION_GATE_TOO_EARLY_HIGH_PRE_ENTRY_CHURN','PUBLICATION_GATE_REVIEW_RECOMMENDED'):
        waits.insert(0,'Kurangkan signal prematur: setup kekal STANDBY sehingga entry-zone activation/confirmation boleh dibuktikan; cancel/expire sebelum entry tidak dikira loss.')
    if integrity_hard:
        waits.insert(0,'Audit conflict OHLC di Diagnostics dan sahkan candle/source sebelum keputusan trading diteruskan.')
    if not waits:waits=['Tunggu candle utama seterusnya tutup dan semak structure/persistence sebelum membuat keputusan baru.']
    if state in ('PULLBACK_NORMAL','FALSE_BREAK_SWEEP','RETEST'):
        waits.insert(0,'Jangan chase counter-move; tunggu reclaim/rejection/acceptance close di level struktur.')
    if profile=='SCALPING' and scalping_campaign:
        mc=scalping_campaign.get('master_campaign') or {};co=scalping_campaign.get('current_opportunity') or {};sel=co.get('selected') or {};coach=scalping_campaign.get('professional_trade_coach') or {}
        for cp in reversed(list(coach.get('next_checkpoints') or [])[:3]):
            waits.insert(0,str(cp))
        if sel and sel.get('blockers'):
            waits.insert(0,'Scalping blocker: '+', '.join(map(str,sel.get('blockers')[:3])))
        elif sel and sel.get('status')=='WATCH_CONFIRMATION':
            waits.insert(0,f"Scalping watch: tunggu setup {sel.get('setup_type')} matang; jangan chase harga yang sudah extend.")
        elif not sel and mc.get('side') in ('BUY','SELL'):
            waits.insert(0,'Scalping: tunggu M1 breakout-retest / pullback-reclaim / sweep-reclaim / HL-LH continuation yang baru.')

    scenarios=[]
    for row in _list(analyst.get('scenario_tree'))[:3]:
        if not isinstance(row,dict):continue
        scenarios.append({'name':row.get('name'),'thesis':row.get('thesis'),'priority':row.get('priority'),
                          'conditions':list(row.get('conditions') or [])[:4],'invalidated_by':row.get('invalidated_by')})

    drivers=[]
    for row in _list(causal.get('dominant_drivers'))[:6]:
        if isinstance(row,dict):drivers.append({'driver':row.get('driver'),'implications':row.get('implications') or [],'confidence':row.get('confidence')})
        else:drivers.append({'driver':str(row),'implications':[]})
    missing_context=[]
    policy=(asset.get('policy') or {}) if isinstance(asset,dict) else {}
    relevant=list(policy.get('relevant_external_context') or [])
    if causal.get('status') in (None,'CONTEXT_UNAVAILABLE') and relevant:
        missing_context=relevant[:8]

    mature=int(_first(validation.get('mature_cases'),learning.get('mature_cases'),performance.get('mature_cases'),0) or 0)
    minimum=int(validation.get('minimum_mature_cases') or learning.get('rule_change_sample_gate') or 30)
    learning_progress={'mature_cases':mature,'minimum_for_rule_review':minimum,
                       'sample_gate_met':bool(validation.get('status') not in ('INSUFFICIENT_SAMPLE',None) and mature>=minimum),
                       'walk_forward_status':validation.get('status','INSUFFICIENT_SAMPLE'),
                       'auto_rule_mutation':False}

    trade_map=_trade_map(bundle,analyst)
    if profile=='SCALPING' and scalping_campaign:
        co=scalping_campaign.get('current_opportunity') or {};sel=co.get('selected') or {};plan=sel.get('plan') or {};coach=scalping_campaign.get('professional_trade_coach') or {}
        campaign_usable=bool(_first(fleet_profile.get('research_usable'),readiness.get('research_usable'),False))
        coach_action=str(coach.get('professional_action') or '')
        if coach_action and not coach_action.startswith('RESEARCH_ENTRY_READY'):
            action=coach_action
            action_reason=str(coach.get('why') or action_reason)
        if co.get('entry_ready') and sel and not integrity_hard and not sel.get('blockers') and campaign_usable and coach_action.startswith('RESEARCH_ENTRY_READY'):
            action='SCALP_ENTRY_READY_RESEARCH'
            action_reason=f"Professional M1 {sel.get('setup_type')} is ready inside the {scalping_campaign.get('master_campaign',{}).get('state','campaign')}; this is a separate re-entry T0, not a duplicate of an earlier scalp."
            bias=sel.get('side') or bias
            trade_map={'mode':'SCALPING_CAMPAIGN_REENTRY_RESEARCH','side':plan.get('side'),'entry_zone':plan.get('entry_zone'),
                       'invalidation_sl':_fmt_num(plan.get('sl')),'tp1':_fmt_num(plan.get('tp1')),'tp2':_fmt_num(plan.get('tp2')),'tp3':_fmt_num(plan.get('tp3')),
                       'state':'ENTRY_READY_RESEARCH','research_only':True,'setup_type':sel.get('setup_type'),
                       'master_campaign_invalidation':plan.get('master_campaign_invalidation'),'liquidity_objective':plan.get('liquidity_objective')}
    cancel_rules=list(teaching.get('cancel_or_review_when') or [])[:5]
    be_trailing=[]
    if trade_map:
        be_trailing=[
            'Sebelum TP1: kekalkan original immutable SL; jangan widen stop untuk menyelamatkan thesis.',
            'Selepas TP1 disahkan: jika mahu HOLD baki posisi, BE protection pada reference entry menjadi layak mulai candle seterusnya.',
            'Selepas TP2 disahkan: jika masih HOLD, trailing/protect-profit minimum di sekitar TP1 atau confirmed structure yang lebih protective; jangan longgarkan semula.',
            'TP3/structural exhaustion: exit-review; re-entry baru mesti datang daripada micro-cycle baru, bukan kerana trade lama menang.'
        ]

    recent=[]
    for e in _list(recent_events)[:4]:
        if isinstance(e,dict):recent.append({'id':e.get('id'),'tf':e.get('tf'),'candle_open_utc':e.get('candle_open_utc'),'event_types':e.get('event_types') or []})

    risk_flag='DATA_INTEGRITY_HARD_BLOCK' if integrity_hard else 'HIGH_REVIEW' if state in ('STRUCTURAL_REVERSAL','REVERSAL_WARNING') or blockers else 'NORMAL_RESEARCH'
    headline=f"{profile} {primary or ''} • {action} • bias {str(bias).upper()} • {state} • evidence {grade}"
    # R5.6 Professional Reasoning Council is additive. It must never be allowed
    # to break the proven R4/R5 cognitive path.  It summarizes competing
    # hypotheses and MTF contradiction using the same audited bundle.
    reasoning={}
    try:
        from .pro_reasoning import build as build_reasoning
        reasoning=build_reasoning(profile,bundle,live,asset,fleet_profile)
        # Surface only concise auditable conclusions; no hidden chain-of-thought.
        if reasoning.get('why'):
            thinks.insert(0,str(reasoning.get('why')))
        for item in list(reasoning.get('what_would_change_my_mind') or [])[:2]:
            waits.append('Change-my-mind: '+str(item))
    except Exception as exc:
        reasoning={'version':'UNAVAILABLE','status':'OPTIONAL_MODULE_UNAVAILABLE','error':type(exc).__name__+': '+str(exc)[:160],
                   'research_only':True,'orders_sent':0}

    mentor_summary=(
        f"{headline}. {action_reason} "
        + (" Next watch: "+' | '.join(waits[:3]) if waits else '')
    )
    if reasoning.get('mentor_explanation_ms'):
        mentor_summary=str(reasoning.get('mentor_explanation_ms'))+'\n'+mentor_summary

    return {
        'version':VERSION,'profile':profile,'primary_tf':primary,'headline':headline,
        'bias':str(bias).upper(),'evidence_grade':grade,'posture':posture,'market_state':state,'thesis_phase':phase,
        'recommended_research_action':action,'action_reason':action_reason,'risk_flag':risk_flag,
        'what_robot_sees':sees[:8],'what_robot_thinks':thinks[:8],'what_robot_waits_for':waits[:8],
        'scenario_tree':scenarios,'trade_map':trade_map,'cancel_or_review_when':cancel_rules,
        'be_trailing_guidance':be_trailing,'mtf_story':story,'causal_drivers':drivers,
        'missing_optional_context':missing_context,'learning_progress':learning_progress,
        'readiness_status':_first(fleet_profile.get('readiness_status'),readiness.get('status'),'UNKNOWN'),
        'integrity_review_required':integrity_hard,
        'integrity_summary':{'total_conflicts':int(integrity.get('total_conflicts') or 0),'material_conflicts':int(integrity.get('material_conflicts') or 0),'classifications':integrity.get('classifications') or {},'examples':list(integrity.get('examples') or [])[:6]},
        'research_usable':bool(_first(fleet_profile.get('research_usable'),readiness.get('research_usable'),False)),
        'recent_canonical_events':recent,'mentor_summary':mentor_summary,'professional_reasoning':reasoning,
        'pre_entry_market_study':pre_entry,
        'pattern_brain':pattern_brain,'adaptive_tools':adaptive_tools,
        'scalping_campaign':scalping_campaign if profile=='SCALPING' else None,
        'guardrails':['Structured evidence synthesis, not hidden chain-of-thought.','Evidence grade is not win probability.',
                      'No future candle rewrites T0.','Optional context never authorizes an entry alone.',
                      'No automatic rule mutation before sample + walk-forward review.','Research/Paper only; no broker order authority.'],
        'trained_llm':False,'research_only':True,'auto_order_execution':False,'orders_sent':0,
    }
