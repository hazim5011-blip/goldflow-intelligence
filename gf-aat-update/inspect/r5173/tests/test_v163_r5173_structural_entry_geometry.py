from types import SimpleNamespace
from pathlib import Path

from aat.entry_geometry import build, VERSION


def _bars(close=100.0,n=40):
    out=[]
    for i in range(n):
        c=close-1.2+1.2*i/max(n-1,1)
        out.append(SimpleNamespace(c=c,o=c-.1,h=c+.4,l=c-.4,t=1_700_000_000+i*900,tf='M15',broker='TEST',symbol='XAUUSD247',v=100+i))
    return out


def _technical(side='BUY'):
    if side=='BUY':
        fvg=[{'side':'BULLISH','low':96.9,'high':97.5,'status':'OPEN'}]
        fib={'impulse_direction':'BULLISH','retracement_levels':{'0.5':97.2},'extension_levels':{'1.272':112.0,'1.618':116.0}}
    else:
        fvg=[{'side':'BEARISH','low':102.5,'high':103.1,'status':'OPEN'}]
        fib={'impulse_direction':'BEARISH','retracement_levels':{'0.5':102.8},'extension_levels':{'1.272':88.0,'1.618':84.0}}
    return {'status':'OK','observations':{
        'fair_value_gap':{'open_or_partial':fvg},'fibonacci':fib,
        'ema':{'ema20':98.5 if side=='BUY' else 101.5},
        'volume_vwap':{'utc_session_vwap_tick_proxy':98.7 if side=='BUY' else 101.3},
    }}


def test_r5173_buy_entry_uses_structural_cluster_not_last_close_atr_box():
    pam={'status':'OK','nearest_support':{'level':97.1},'nearest_resistance':{'level':110.0},
         'displacement_origin_zones':[{'type':'DEMAND_DISPLACEMENT_ORIGIN','low':96.8,'high':97.4}],
         'sbr_rbs':[{'type':'RBS_SUPPORT','level':97.05}],
         'supply_candidates':[{'level':110.0}], 'demand_candidates':[],
         'liquidity_pools':{'equal_highs':[{'level':112.0}],'equal_lows':[]}}
    g=build('DAY','BUY',_bars(),own={'atr':4.0,'last_close':100.0,'last_low':95.6,'last_high':108.0},
            playbook='PULLBACK_CONTINUATION',technical=_technical('BUY'),pam=pam)
    assert g['version']==VERSION and g['status']=='OK'
    assert 96.5 < g['entry_low'] < 97.5 and 96.8 < g['entry_high'] < 98.0
    assert 'DEMAND_DISPLACEMENT_ORIGIN' in g['selected_location_sources']
    assert 'RBS_SUPPORT' in g['selected_location_sources']
    assert g['sl'] < g['entry_low']
    assert g['tp1'] > g['entry_high']
    assert g['targets'][0]['basis']=='STRUCTURAL_OR_LIQUIDITY'
    assert g['private_chain_of_thought_stored'] is False
    assert 'ATR_ONLY_AS_BUFFER' not in g['decision_summary']['why_here']


def test_r5173_sell_entry_uses_supply_cluster_and_thesis_invalidation():
    pam={'status':'OK','nearest_support':{'level':90.0},'nearest_resistance':{'level':102.9},
         'displacement_origin_zones':[{'type':'SUPPLY_DISPLACEMENT_ORIGIN','low':102.6,'high':103.2}],
         'sbr_rbs':[{'type':'SBR_RESISTANCE','level':102.95}],
         'supply_candidates':[], 'demand_candidates':[{'level':90.0}],
         'liquidity_pools':{'equal_highs':[],'equal_lows':[{'level':88.0}]}}
    g=build('DAY','SELL',_bars(),own={'atr':4.0,'last_close':100.0,'last_high':104.2,'last_low':92.0},
            playbook='ZONE_REACTION',technical=_technical('SELL'),pam=pam)
    assert g['status']=='OK'
    assert 102.2 < g['entry_low'] < 103.2 and 102.6 < g['entry_high'] < 103.6
    assert g['sl'] > g['entry_high']
    assert g['tp1'] < g['entry_low']
    assert any('SUPPLY' in x or 'SBR' in x for x in g['selected_location_sources'])


def test_r5173_refuses_trade_when_nearest_opposing_structure_has_too_little_room():
    pam={'status':'OK','nearest_support':{'level':99.0},'nearest_resistance':{'level':99.6},
         'displacement_origin_zones':[{'type':'DEMAND_DISPLACEMENT_ORIGIN','low':98.8,'high':99.2}],
         'sbr_rbs':[],'supply_candidates':[{'level':99.6}],'demand_candidates':[],
         'liquidity_pools':{'equal_highs':[],'equal_lows':[]}}
    g=build('DAY','BUY',_bars(),own={'atr':4.0,'last_close':100.0,'last_low':98.4,'last_high':99.6},
            playbook='ZONE_REACTION',technical={'status':'OK','observations':{}},pam=pam)
    assert g['status']=='WAIT_INSUFFICIENT_STRUCTURAL_ROOM'
    assert g['room_r'] < 0.8


def test_r5173_runtime_sources_do_not_restore_atr_offset_entry_formula():
    root=Path(__file__).resolve().parents[1]
    structure=(root/'aat'/'structure.py').read_text(encoding='utf-8')
    geom=(root/'aat'/'entry_geometry.py').read_text(encoding='utf-8')
    assert 'last.c-.38*p' not in structure and 'last.c+.38*p' not in structure
    assert 'THESIS_INVALIDATION_FIRST_ATR_ONLY_AS_BUFFER' in geom
    assert 'STRUCTURAL_OR_LIQUIDITY' in geom


def test_r5173_post_loss_memory_detects_repeatable_geometry_weaknesses():
    from aat.signal_self_review import _risk_markers
    pre={
        'components':{'entry_location':18,'fresh_trigger':14,'htf_context':22},
        'advisories':[],
        'structural_entry_geometry':{
            'status':'OK','location_confluence_count':1,
            'room_to_nearest_objective_r':0.92,
            'selected_location_sources':['CONFIRMED_SUPPORT'],
        },
    }
    markers=_risk_markers(pre)
    assert 'THIN_STRUCTURAL_ENTRY_CLUSTER_AT_T0' in markers
    assert 'LIMITED_STRUCTURAL_ROOM_AT_T0' in markers


def test_r5173_strong_geometry_does_not_create_geometry_repeat_guard_marker():
    from aat.signal_self_review import _risk_markers
    pre={
        'components':{'entry_location':18,'fresh_trigger':14,'htf_context':22},
        'advisories':[],
        'structural_entry_geometry':{
            'status':'OK','location_confluence_count':3,
            'room_to_nearest_objective_r':1.45,
            'selected_location_sources':['DEMAND_DISPLACEMENT_ORIGIN','RBS_SUPPORT','BULLISH_FVG_OPEN'],
        },
    }
    markers=_risk_markers(pre)
    assert 'THIN_STRUCTURAL_ENTRY_CLUSTER_AT_T0' not in markers
    assert 'LIMITED_STRUCTURAL_ROOM_AT_T0' not in markers
