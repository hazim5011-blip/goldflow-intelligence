"""GF-AAT V1.6 Professional Analyst Brain.

Turns auditable market facts into a scenario-based trader narrative.  It does
not use hidden future data, does not invent news or probabilities, and does not
submit broker orders.  FACT, INTERPRETATION and HYPOTHESIS are kept separate.
"""
from __future__ import annotations
from .settings import PROFILE_TF,PROFILE_REQUIRED_TF
from .price_action import build_price_action_map

VERSION='GF-AAT-PROFESSIONAL-ANALYST-BRAIN-1.6.0'


def _bias_dir(x):return 1 if x=='BUY' else -1 if x=='SELL' else 0

def _level(pa,key):
    x=(pa or {}).get(key)
    return x.get('level') if isinstance(x,dict) else None

def _fmt(x):
    return None if x is None else round(float(x),8)


def build(profile,frames,study,snapshot,decision,market_state,causal=None,performance=None,validation=None,active_signal=None,preview_plan=None):
    profile=profile.upper();primary=PROFILE_TF[profile][0]
    study=study or {};snapshot=snapshot or {};decision=decision or {};market_state=market_state or {};causal=causal or {}
    pa_map=build_price_action_map(profile,frames);primary_pa=(pa_map.get('frames') or {}).get(primary,{})
    bias=decision.get('directional_bias') or study.get('side') or study.get('side_bias') or 'NONE';d=_bias_dir(bias)
    grade=decision.get('evidence_grade','D');blockers=list(decision.get('blockers') or []);warnings=list(decision.get('warnings') or [])
    regime=snapshot.get('regime','UNKNOWN');ms=market_state.get('state','UNRESOLVED')

    tf_story=[];trend_map=snapshot.get('trend_map') or {};struct_map=snapshot.get('structure_map') or {}
    for tf in dict.fromkeys(PROFILE_TF[profile]):
        if tf not in (frames or {}):continue
        role='PRIMARY' if tf==primary else 'MANDATORY_CONTEXT' if tf in PROFILE_REQUIRED_TF[profile] else 'OPTIONAL_CONTEXT'
        tf_story.append({'tf':tf,'role':role,'trend':trend_map.get(tf,'UNKNOWN'),'structure':struct_map.get(tf,'UNKNOWN'),
                         'price_action':(pa_map.get('frames') or {}).get(tf,{}).get('status','UNAVAILABLE')})

    facts=[];interpretations=[];hypotheses=[]
    for row in tf_story:
        facts.append({'type':'FACT','source':'RAW_MT5_'+row['tf'],'claim':f"{row['tf']} trend={row['trend']} structure={row['structure']} ({row['role']})"})
    if primary_pa.get('status')=='OK':
        facts.append({'type':'FACT','source':'RAW_MT5_'+primary,'claim':f"Nearest confirmed support={_fmt(_level(primary_pa,'nearest_support'))}; resistance={_fmt(_level(primary_pa,'nearest_resistance'))}"})
        facts.append({'type':'FACT','source':'RAW_MT5_'+primary,'claim':f"Momentum={primary_pa.get('momentum',{}).get('state')} | volatility={primary_pa.get('volatility',{}).get('state')} | displacement={primary_pa.get('displacement',{}).get('direction')}"})
        if primary_pa.get('sbr_rbs'):
            facts.append({'type':'FACT','source':'CONFIRMED_PIVOT_MAP','claim':'SBR/RBS candidate(s): '+', '.join(f"{x['type']}@{x['level']}" for x in primary_pa['sbr_rbs'][-3:])})
        if primary_pa.get('displacement_origin_zones'):
            facts.append({'type':'FACT','source':'RAW_MT5_DISPLACEMENT_ORIGIN','claim':'Supply/Demand displacement-origin candidate(s): '+', '.join(f"{x['type']} {x['low']}-{x['high']}" for x in primary_pa['displacement_origin_zones'][:3])})
        pools=primary_pa.get('liquidity_pools') or {}
        if pools.get('equal_highs') or pools.get('equal_lows'):
            facts.append({'type':'FACT','source':'CONFIRMED_PIVOT_MAP','claim':'Liquidity pools detected from repeated confirmed highs/lows'})
    interpretations.append({'type':'INTERPRETATION','claim':f"Market regime is {regime}; pullback/reversal state is {ms}."})
    if d:
        interpretations.append({'type':'INTERPRETATION','claim':f"Current research thesis leans {bias}, but remains conditional on closed-candle confirmation and immutable invalidation."})
    else:
        interpretations.append({'type':'INTERPRETATION','claim':'No directional thesis is mature enough to authorize a BUY/SELL research signal.'})

    driver_rows=causal.get('dominant_drivers') or []
    supportive=[];opposing=[];mixed=[]
    for row in driver_rows[:8]:
        imps=set(row.get('implications') or []) if isinstance(row,dict) else set()
        name=row.get('driver','UNKNOWN') if isinstance(row,dict) else str(row)
        gold_bull=any('GOLD_SUPPORT' in x or 'SAFE_HAVEN_SUPPORT' in x for x in imps)
        gold_bear=any('GOLD_HEADWIND' in x for x in imps)
        if (d>0 and gold_bull) or (d<0 and gold_bear):supportive.append(name)
        elif (d>0 and gold_bear) or (d<0 and gold_bull):opposing.append(name)
        else:mixed.append(name)
    if supportive:interpretations.append({'type':'INTERPRETATION','claim':'Causal context conditionally supports thesis via: '+', '.join(supportive[:4])})
    if opposing:interpretations.append({'type':'INTERPRETATION','claim':'Causal context conflicts with thesis via: '+', '.join(opposing[:4])})
    if mixed:interpretations.append({'type':'INTERPRETATION','claim':'Causal direction remains unverified/mixed for: '+', '.join(mixed[:4])})

    support=_level(primary_pa,'nearest_support');resistance=_level(primary_pa,'nearest_resistance')
    ref_high=market_state.get('reference_high');ref_low=market_state.get('reference_low')
    bull_trigger=resistance if resistance is not None else ref_high
    bear_trigger=support if support is not None else ref_low
    scenarios=[]
    if d>0:
        scenarios.append({'name':'BASE_BULLISH_CONTINUATION','priority':1,'thesis':'BUY','conditions':[f'Hold above structural support {support}' if support is not None else 'Preserve bullish frozen structure',f'Closed-candle acceptance above {bull_trigger}' if bull_trigger is not None else 'New bullish BOS/continuation close','Mandatory context must not confirm bearish structural reversal'],'invalidated_by':f'Persistent close below {ref_low}' if ref_low is not None else 'Confirmed structural reversal across mandatory hierarchy'})
        scenarios.append({'name':'ALTERNATE_DEEPER_PULLBACK','priority':2,'thesis':'WAIT','conditions':['Counter move remains inside frozen structure','Look for sweep/reclaim or retest before ENTRY_READY'],'invalidated_by':'Persistent structural break with opposing hierarchy'})
        scenarios.append({'name':'BEARISH_REVERSAL_CASE','priority':3,'thesis':'SELL_REVIEW_ONLY','conditions':[f'Two accepted closes below {ref_low}' if ref_low is not None else 'Confirmed bearish BOS/CHoCH','Parent/mandatory timeframe opposition persists'],'invalidated_by':'Bullish reclaim and continuation resumes'})
    elif d<0:
        scenarios.append({'name':'BASE_BEARISH_CONTINUATION','priority':1,'thesis':'SELL','conditions':[f'Hold below structural resistance {resistance}' if resistance is not None else 'Preserve bearish frozen structure',f'Closed-candle acceptance below {bear_trigger}' if bear_trigger is not None else 'New bearish BOS/continuation close','Mandatory context must not confirm bullish structural reversal'],'invalidated_by':f'Persistent close above {ref_high}' if ref_high is not None else 'Confirmed structural reversal across mandatory hierarchy'})
        scenarios.append({'name':'ALTERNATE_HIGHER_PULLBACK','priority':2,'thesis':'WAIT','conditions':['Counter move remains inside frozen structure','Look for sweep/rejection or retest before ENTRY_READY'],'invalidated_by':'Persistent structural break with opposing hierarchy'})
        scenarios.append({'name':'BULLISH_REVERSAL_CASE','priority':3,'thesis':'BUY_REVIEW_ONLY','conditions':[f'Two accepted closes above {ref_high}' if ref_high is not None else 'Confirmed bullish BOS/CHoCH','Parent/mandatory timeframe opposition persists'],'invalidated_by':'Bearish rejection and continuation resumes'})
    else:
        scenarios=[{'name':'WAIT_FOR_RANGE_RESOLUTION','priority':1,'thesis':'WAIT','conditions':['Require directional structure + MTF alignment','Require closed-candle confirmation; do not chase intrabar movement'],'invalidated_by':'N/A — no active directional thesis'},
                   {'name':'BULLISH_RESOLUTION','priority':2,'thesis':'BUY_CANDIDATE_ONLY','conditions':[f'Accepted close above {bull_trigger}' if bull_trigger is not None else 'Bullish BOS/CHoCH','Context alignment'],'invalidated_by':'Failed breakout/reclaim back into range'},
                   {'name':'BEARISH_RESOLUTION','priority':3,'thesis':'SELL_CANDIDATE_ONLY','conditions':[f'Accepted close below {bear_trigger}' if bear_trigger is not None else 'Bearish BOS/CHoCH','Context alignment'],'invalidated_by':'Failed breakdown/reclaim back into range'}]

    if ms=='PULLBACK_NORMAL':hypotheses.append({'type':'HYPOTHESIS','claim':'Current counter-direction move is more consistent with a normal pullback than a confirmed reversal.'})
    elif ms=='FALSE_BREAK_SWEEP':hypotheses.append({'type':'HYPOTHESIS','claim':'Current move is consistent with a false break/liquidity sweep until acceptance beyond structure proves otherwise.'})
    elif ms=='REVERSAL_WARNING':hypotheses.append({'type':'HYPOTHESIS','claim':'Reversal risk is elevated; thesis should be reviewed, not automatically flipped.'})
    elif ms=='STRUCTURAL_REVERSAL':hypotheses.append({'type':'HYPOTHESIS','claim':'Structural reversal criteria are met relative to the current thesis; pending thesis requires cancel/review.'})

    next_watch=[]
    if blockers:next_watch.append('Resolve hard blocker(s): '+', '.join(blockers[:4]))
    if ms in ('REVERSAL_WARNING','UNRESOLVED'):next_watch.append('Wait for structural persistence/reclaim on closed candles')
    if bull_trigger is not None:next_watch.append(f'Bullish confirmation reference: {round(float(bull_trigger),8)}')
    if bear_trigger is not None:next_watch.append(f'Bearish confirmation reference: {round(float(bear_trigger),8)}')
    if opposing:next_watch.append('Require price confirmation before trusting conflicting macro/news driver')

    strength='WAIT_CONFLICT' if blockers or not d else 'STRONG_EVIDENCE' if grade in ('A','B') and ms not in ('REVERSAL_WARNING','STRUCTURAL_REVERSAL','UNRESOLVED') else 'DEVELOPING_EVIDENCE'
    plan=None
    if active_signal:
        geo=((active_signal.get('evidence') or {}).get('structural_entry_geometry') or {})
        plan={'mode':'IMMUTABLE_PUBLISHED_SIGNAL','side':active_signal.get('side'),'entry_zone':[active_signal.get('entry_low'),active_signal.get('entry_high')],'sl':active_signal.get('sl'),'tp1':active_signal.get('tp1'),'tp2':active_signal.get('tp2'),'tp3':active_signal.get('tp3'),'state':active_signal.get('state'),'entry_geometry':geo}
    elif preview_plan:
        geo=((preview_plan.get('evidence') or {}).get('structural_entry_geometry') or {})
        plan={'mode':'PREVIEW_RESEARCH_PLAN_NOT_PUBLISHED','side':preview_plan.get('side'),'entry_zone':[preview_plan.get('entry_low'),preview_plan.get('entry_high')],'sl':preview_plan.get('sl'),'tp1':preview_plan.get('tp1'),'tp2':preview_plan.get('tp2'),'tp3':preview_plan.get('tp3'),'entry_geometry':geo}

    headline=f"{profile} {primary}: {strength} • bias {bias} • {regime} • {ms}"
    return {'version':VERSION,'profile':profile,'primary_tf':primary,'headline':headline,'analysis_strength':strength,'bias':bias,
            'regime':regime,'market_state':ms,'evidence_grade':grade,'timeframe_story':tf_story,'price_action':pa_map,
            'reasoning_ledger':facts+interpretations+hypotheses,'scenario_tree':scenarios,'next_watch':next_watch,
            'causal_alignment':{'supportive':supportive,'opposing':opposing,'mixed_or_unverified':mixed},
            'trade_map':plan,'hard_blockers':blockers,'warnings':warnings,
            'guardrails':['Evidence grade is not win probability.','No future candle is used to rewrite T0.','External context is conditional and cannot authorize an entry alone.','No broker order authority.'],
            'trained_llm':False,'research_only':True,'orders_sent':0}
