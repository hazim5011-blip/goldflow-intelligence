"""GF-AAT R5.10.1 forward signal outcome & live management tracker.

This module never rewrites T0 and never claims a broker fill.  It evaluates what
happened *after* an immutable forward setup was published using archived raw MT5
closed candles.  Pending setup attrition (cancel/expiry before entry-zone touch)
is kept separate from activated-entry outcomes so a trader can distinguish:

- setup expired without entry (NO ENTRY, not a loss),
- setup invalidated before entry (NO ENTRY, not a loss),
- entry zone activated, then SL / TP / BE / trailing path,
- intrabar ambiguity where closed OHLC cannot prove event ordering.

The management policy is intentionally conservative and auditable:
- TP1 reached -> BE protection becomes eligible from the *next* closed candle;
- TP2 reached -> structural/trailing protection is represented conservatively by
  TP1 from the *next* closed candle;
- same-candle stop/target ordering that cannot be proven is AMBIGUOUS and is not
  counted as a win or a loss.

Research/Paper only.  No broker order is submitted.
"""
from __future__ import annotations

from collections import Counter
from typing import Any

from .settings import PROFILE_TF, TF_SECONDS

VERSION = 'GF-AAT-SIGNAL-OUTCOME-TRACKER-1.4.0'

_TERMINAL_DB = {'CANCELLED', 'EXPIRED', 'PAPER_STOPPED', 'PAPER_CLOSED'}


def _num(v, default=None):
    try:
        x = float(v)
        return x if x == x and x not in (float('inf'), float('-inf')) else default
    except (TypeError, ValueError):
        return default


def _int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def _event_rows(store, sid):
    out = []
    for e in store.events(sid):
        d = dict(e)
        try:
            import json
            d['evidence'] = json.loads(d.get('evidence_json') or '{}')
        except Exception:
            d['evidence'] = {}
        out.append(d)
    return out


def _tf(sig):
    ev = sig.get('evidence') or {}
    tf = ev.get('profile_tf') or PROFILE_TF.get(str(sig.get('profile') or '').upper(), ('M5',))[0]
    return tf if tf in TF_SECONDS else PROFILE_TF.get(str(sig.get('profile') or '').upper(), ('M5',))[0]


def _closed_bars_after_signal(store, sig, asof):
    tf = _tf(sig); sec = TF_SECONDS[tf]
    rows = store.db.execute(
        '''SELECT broker,symbol,tf,t,o,h,l,c,v,source,first_seen_utc FROM candles
           WHERE broker=? AND symbol=? AND tf=? AND t>? AND (t+?)<=?
           ORDER BY t ASC''',
        (sig['broker'], sig['symbol'], tf, _int(sig.get('origin_candle_open_utc')), sec, int(asof))
    ).fetchall()
    return [dict(r) for r in rows], tf, sec


def _overlaps_zone(bar, low, high):
    return float(bar['l']) <= high and float(bar['h']) >= low


def _hits(side, bar, level, kind):
    if level is None:
        return False
    level = float(level)
    if side == 'BUY':
        return float(bar['l']) <= level if kind == 'stop' else float(bar['h']) >= level
    return float(bar['h']) >= level if kind == 'stop' else float(bar['l']) <= level


def _terminal_before_activation(events, expiry):
    terminal = None
    for e in events:
        if e.get('to_state') in _TERMINAL_DB:
            terminal = e
            break
    deadline = int(expiry)
    if terminal:
        deadline = min(deadline, _int(terminal.get('created_at_utc'), deadline))
    return terminal, deadline


def _pro_confirmation(side, bar, prev, entry_ref, low, high, atr, playbook=None):
    """Playbook-specific closed-candle activation confirmation (R5.12+).

    A professional scalp does not require the same confirmation as a swing
    breakout.  The immutable setup chooses a playbook at T0; this function
    asks only for the confirmation relevant to that playbook.
    """
    atr=max(float(atr or 0.0), 1e-9)
    pb=str(playbook or 'GENERIC').upper()
    o=float(bar['o']); h=float(bar['h']); l=float(bar['l']); c=float(bar['c'])
    po=float(prev['o']); ph=float(prev['h']); pl=float(prev['l']); pc=float(prev['c'])
    body=abs(c-o); rng=max(h-l,1e-9); lower_wick=max(0.0,min(o,c)-l); upper_wick=max(0.0,h-max(o,c))
    if body < .10*atr:
        return False
    if side=='BUY':
        directional=c>o
        not_chase=c<=high+.45*atr
        reclaim=c>=entry_ref
        if pb in ('ZONE_REACTION','RANGE_EDGE_REVERSION'):
            proof=(lower_wick>=max(body*.45,.10*atr) and c>=low+(high-low)*.45) or (directional and c>pc and body>=.18*atr)
        elif pb=='LIQUIDITY_SWEEP_REVERSAL':
            proof=(l<=low and c>low and lower_wick>=body*.55 and c>pc)
        elif pb=='BREAKOUT_RETEST':
            proof=directional and c>=entry_ref and c>pc and (c>ph or l<=high)
        elif pb=='PULLBACK_CONTINUATION':
            proof=directional and c>pc and c>=entry_ref and (c>=ph or body>=.22*atr)
        else: # momentum continuation
            proof=directional and c>pc and body>=.20*atr
    else:
        directional=c<o
        not_chase=c>=low-.45*atr
        reclaim=c<=entry_ref
        if pb in ('ZONE_REACTION','RANGE_EDGE_REVERSION'):
            proof=(upper_wick>=max(body*.45,.10*atr) and c<=high-(high-low)*.45) or (directional and c<pc and body>=.18*atr)
        elif pb=='LIQUIDITY_SWEEP_REVERSAL':
            proof=(h>=high and c<high and upper_wick>=body*.55 and c<pc)
        elif pb=='BREAKOUT_RETEST':
            proof=directional and c<=entry_ref and c<pc and (c<pl or h>=low)
        elif pb=='PULLBACK_CONTINUATION':
            proof=directional and c<pc and c<=entry_ref and (c<=pl or body>=.22*atr)
        else:
            proof=directional and c<pc and body>=.20*atr
    return bool(not_chase and proof and (reclaim or pb in ('ZONE_REACTION','RANGE_EDGE_REVERSION','LIQUIDITY_SWEEP_REVERSAL','MOMENTUM_CONTINUATION')))


def evaluate_signal(store, sig: dict[str, Any], asof: int | None = None):
    """Evaluate one immutable signal using only market data that came after T0."""
    import time
    asof = int(time.time()) if asof is None else int(asof)
    side = str(sig.get('side') or '').upper()
    if side not in ('BUY', 'SELL'):
        return {'version': VERSION, 'signal_id': sig.get('id'), 'status': 'INVALID_SIGNAL_SIDE', 'result_bucket': 'AMBIGUOUS'}

    low = _num(sig.get('entry_low')); high = _num(sig.get('entry_high'))
    sl = _num(sig.get('sl')); tp1 = _num(sig.get('tp1')); tp2 = _num(sig.get('tp2')); tp3 = _num(sig.get('tp3'))
    if None in (low, high, sl, tp1, tp2, tp3):
        return {'version': VERSION, 'signal_id': sig.get('id'), 'status': 'INCOMPLETE_SIGNAL_GEOMETRY', 'result_bucket': 'AMBIGUOUS'}
    if low > high: low, high = high, low
    entry_ref = (low + high) / 2.0
    # Conservative executable reference inside a zone: BUY uses upper edge, SELL lower edge.
    conservative_entry = high if side == 'BUY' else low
    risk = abs(conservative_entry - sl)

    events = _event_rows(store, sig['id'])
    terminal, activation_deadline = _terminal_before_activation(events, sig.get('expires_at_utc'))
    bars, tf, sec = _closed_bars_after_signal(store, sig, asof)

    activation = None
    activation_idx = None
    touch = None
    touch_idx = None
    ambiguous_expiry_touch = False
    policy=str((sig.get('evidence') or {}).get('entry_activation_policy') or '')
    requires_confirmation=policy.startswith('ZONE_TOUCH_THEN_')
    pre_study=((sig.get('evidence') or {}).get('pre_entry_market_study') or {})
    playbook=str(pre_study.get('selected_playbook') or '')
    atr_hint=_num((pre_study.get('atr')), 0.0) or 0.0
    if not atr_hint:
        atr_hint=abs(high-low)/.45 if abs(high-low)>1e-9 else max(abs(entry_ref-sl),1e-9)
    for i, b in enumerate(bars):
        close_utc = int(b['t']) + sec
        if close_utc > activation_deadline:
            if int(b['t']) < activation_deadline < close_utc and _overlaps_zone(b, low, high):
                ambiguous_expiry_touch = True
            break
        if touch is None and _overlaps_zone(b, low, high):
            touch=b;touch_idx=i
            if not requires_confirmation:
                activation=b;activation_idx=i;break
            continue
        if requires_confirmation and touch is not None and i>touch_idx:
            # Confirmation must arrive promptly; after two closed bars the old
            # touch is stale and a fresh zone touch is required.
            if i-touch_idx<=2 and _pro_confirmation(side,b,bars[i-1],entry_ref,low,high,atr_hint,playbook):
                activation=b;activation_idx=i;break
            if i-touch_idx>=2:
                if _overlaps_zone(b,low,high):
                    touch=b;touch_idx=i
                else:
                    touch=None;touch_idx=None

    base = {
        'version': VERSION, 'signal_id': sig['id'], 'profile': sig.get('profile'), 'side': side, 'tf': tf,
        'published_at_utc': _int(sig.get('created_at_utc')), 'expires_at_utc': _int(sig.get('expires_at_utc')),
        'entry_zone': [round(low, 8), round(high, 8)], 'entry_reference': round(entry_ref, 8),
        'conservative_entry_reference': round(conservative_entry, 8), 'sl': sl, 'tp1': tp1, 'tp2': tp2, 'tp3': tp3,
        'db_state': sig.get('state'), 'research_only': True, 'broker_fill_claimed': False, 'orders_sent': 0,
        'future_data_rewrites_t0': False,
        'qualification_generation': str((sig.get('evidence') or {}).get('qualification_generation') or 'LEGACY'),
        'activation_playbook': playbook or 'LEGACY_GENERIC',
    }

    if activation is None:
        if ambiguous_expiry_touch:
            return {**base, 'entry_activated': False, 'status': 'AMBIGUOUS_EXPIRY_BAR_TOUCH', 'result_bucket': 'AMBIGUOUS',
                    'management': 'NO_ENTRY_COUNTED', 'note': 'Entry-zone touch may have occurred in the same candle that crossed the setup deadline; OHLC cannot prove ordering.'}
        terminal_state = str((terminal or {}).get('to_state') or sig.get('state') or '')
        touched_without_confirmation=bool(requires_confirmation and touch is not None)
        if terminal_state == 'CANCELLED':
            status = 'CANCELLED_AFTER_TOUCH_NO_CONFIRMATION' if touched_without_confirmation else 'CANCELLED_BEFORE_ENTRY'
            reason = 'Zone was touched but the required later closed-candle confirmation never matured before invalidation.' if touched_without_confirmation else 'Conditional setup was invalidated before any provable professional entry activation.'
            management='NO_ENTRY_CANCELLED'
        elif terminal_state == 'EXPIRED' or asof > _int(sig.get('expires_at_utc')):
            status = 'TOUCHED_NO_CONFIRMATION_EXPIRED' if touched_without_confirmation else 'EXPIRED_UNFILLED'
            reason = 'Zone was touched, but professional confirmation never arrived before expiry; no entry is counted.' if touched_without_confirmation else 'Conditional setup expired without a provable professional entry activation.'
            management='NO_ENTRY_EXPIRED'
        elif str(sig.get('state') or '').upper() == 'REVIEW':
            status, reason, management = 'REVIEW_BEFORE_ENTRY', 'Setup is suspended for review before any provable entry activation.', 'WAIT_REVIEW'
        elif touched_without_confirmation:
            status, reason, management = 'ZONE_TOUCHED_WAIT_CONFIRMATION', 'Entry zone was touched; wait for a later fresh closed-candle confirmation. A wick/touch alone is not an entry.', 'WAIT_CONFIRMATION'
        else:
            status, reason, management = 'STANDBY_UNFILLED', 'Setup remains pending; entry zone has not been proven active by professional confirmation.', 'STANDBY'
        return {**base, 'entry_activated': False, 'status': status, 'result_bucket': 'NO_ENTRY', 'management': management,
                'reason': reason, 'not_a_loss': True, 'entry_activation_policy':policy or 'LEGACY_ZONE_TOUCH', 'activation_playbook':playbook or 'LEGACY_GENERIC'}

    activated_at = int(activation['t']) + sec
    # Path tracking starts with the activation bar.  Closed OHLC cannot reveal exact tick order.
    stage = 'ACTIVE'
    tp1_at = tp2_at = tp3_at = None
    terminal_status = None
    terminal_at = None
    terminal_price = None
    ambiguous_reason = None
    max_fav = 0.0
    max_adv = 0.0

    path_start_idx = activation_idx + 1 if requires_confirmation else activation_idx
    for j in range(path_start_idx, len(bars)):
        b = bars[j]
        close_utc = int(b['t']) + sec
        if side == 'BUY':
            max_fav = max(max_fav, float(b['h']) - conservative_entry)
            max_adv = max(max_adv, conservative_entry - float(b['l']))
        else:
            max_fav = max(max_fav, conservative_entry - float(b['l']))
            max_adv = max(max_adv, float(b['h']) - conservative_entry)

        hit_sl = _hits(side, b, sl, 'stop')
        hit1 = _hits(side, b, tp1, 'target')
        hit2 = _hits(side, b, tp2, 'target')
        hit3 = _hits(side, b, tp3, 'target')
        hit_be = _hits(side, b, entry_ref, 'stop')
        hit_trail_tp1 = _hits(side, b, tp1, 'stop')

        if stage == 'ACTIVE':
            if hit_sl and (hit1 or hit2 or hit3):
                terminal_status = 'AMBIGUOUS_INTRABAR_SL_AND_TARGET'; ambiguous_reason = 'Same closed candle contains both original SL and target path; tick ordering is unknown.'; terminal_at = close_utc; break
            if hit_sl:
                terminal_status = 'SL_LOSS'; terminal_at = close_utc; terminal_price = sl; break
            if hit3:
                tp1_at = tp1_at or close_utc; tp2_at = tp2_at or close_utc; tp3_at = close_utc
                terminal_status = 'TP3_WIN'; terminal_at = close_utc; terminal_price = tp3; break
            if hit2:
                tp1_at = tp1_at or close_utc; tp2_at = close_utc; stage = 'TP2'
                continue
            if hit1:
                tp1_at = close_utc; stage = 'TP1'
                continue

        elif stage == 'TP1':
            # BE is activated only on a later closed candle, never retroactively inside TP1 candle.
            if close_utc <= (tp1_at or 0):
                continue
            if hit_be and (hit2 or hit3):
                terminal_status = 'AMBIGUOUS_INTRABAR_BE_AND_HIGHER_TARGET'; ambiguous_reason = 'Same closed candle contains BE and a higher target; ordering is unknown.'; terminal_at = close_utc; break
            if hit_be:
                terminal_status = 'TP1_THEN_BE'; terminal_at = close_utc; terminal_price = entry_ref; break
            if hit3:
                tp2_at = tp2_at or close_utc; tp3_at = close_utc; terminal_status = 'TP3_WIN'; terminal_at = close_utc; terminal_price = tp3; break
            if hit2:
                tp2_at = close_utc; stage = 'TP2'; continue

        elif stage == 'TP2':
            if close_utc <= (tp2_at or 0):
                continue
            # Conservative structural-trailing proxy locks TP1 after TP2.
            if hit_trail_tp1 and hit3:
                terminal_status = 'AMBIGUOUS_INTRABAR_TRAIL_AND_TP3'; ambiguous_reason = 'Same closed candle contains TP1 trailing level and TP3; ordering is unknown.'; terminal_at = close_utc; break
            if hit_trail_tp1:
                terminal_status = 'TP2_THEN_TRAIL_TP1'; terminal_at = close_utc; terminal_price = tp1; break
            if hit3:
                tp3_at = close_utc; terminal_status = 'TP3_WIN'; terminal_at = close_utc; terminal_price = tp3; break

    if terminal_status is None:
        if stage == 'TP2':
            status = 'HOLD_TRAILING_ACTIVE'; bucket = 'OPEN'; management = 'HOLD • TRAILING ACTIVE (protect at least TP1 proxy)'
        elif stage == 'TP1':
            status = 'HOLD_BE_ACTIVE'; bucket = 'OPEN'; management = 'HOLD • BE ACTIVE'
        else:
            status = 'ACTIVE_RESEARCH_ENTRY'; bucket = 'OPEN'; management = 'HOLD • ORIGINAL SL ACTIVE'
    else:
        status = terminal_status
        if status == 'SL_LOSS': bucket = 'LOSS'; management = 'CLOSED_RESEARCH_PATH_AT_SL'
        elif status == 'TP1_THEN_BE': bucket = 'BE'; management = 'TP1 REACHED • REMAINDER PROTECTED AT BE'
        elif status in ('TP2_THEN_TRAIL_TP1', 'TP3_WIN'): bucket = 'WIN'; management = 'PROFIT_PROTECTED / TARGET PATH COMPLETE'
        else: bucket = 'AMBIGUOUS'; management = 'EXCLUDE_FROM_WIN_LOSS_STATS'

    mfe_r = round(max_fav / risk, 4) if risk and risk > 1e-12 else None
    mae_r = round(max_adv / risk, 4) if risk and risk > 1e-12 else None
    return {
        **base, 'entry_activated': True, 'activation_candle_open_utc': int(activation['t']), 'activated_at_utc': activated_at,
        'entry_activation_policy':policy or 'LEGACY_ZONE_TOUCH', 'activation_playbook':playbook or 'LEGACY_GENERIC', 'zone_touch_candle_open_utc': int(touch['t']) if touch is not None else int(activation['t']),
        'status': status, 'result_bucket': bucket, 'management': management,
        'tp1_reached_at_utc': tp1_at, 'tp2_reached_at_utc': tp2_at, 'tp3_reached_at_utc': tp3_at,
        'terminal_at_utc': terminal_at, 'terminal_price': terminal_price,
        'max_favorable_r': mfe_r, 'max_adverse_r': mae_r,
        'ambiguous_reason': ambiguous_reason,
        'note': 'Outcome is a forward research reconstruction from broker closed candles, not a claim of actual MT5 execution.'
    }


def profile_summary(store, broker, symbol, profile, asof: int | None = None, limit: int = 100):
    import time
    asof = int(time.time()) if asof is None else int(asof)
    profile = profile.upper()
    rows = store.db.execute(
        'SELECT id FROM signals WHERE broker=? AND symbol=? AND profile=? ORDER BY created_at_utc DESC LIMIT ?',
        (broker, symbol, profile, min(300, max(1, int(limit))))
    ).fetchall()
    outcomes = [evaluate_signal(store, store.signal(r['id']), asof) for r in rows]
    counts = Counter(x.get('status') for x in outcomes)
    buckets = Counter(x.get('result_bucket') for x in outcomes)
    n = len(outcomes)
    activated = sum(1 for x in outcomes if x.get('entry_activated'))
    pre_cancel = counts.get('CANCELLED_BEFORE_ENTRY', 0) + counts.get('CANCELLED_AFTER_TOUCH_NO_CONFIRMATION', 0)
    unfilled_expired = counts.get('EXPIRED_UNFILLED', 0) + counts.get('TOUCHED_NO_CONFIRMATION_EXPIRED', 0)
    ambiguous_pre = counts.get('AMBIGUOUS_EXPIRY_BAR_TOUCH', 0)
    churn = (pre_cancel + unfilled_expired) / n if n else None
    if n < 10:
        quality = 'SAMPLE_TOO_SMALL_FOR_GATE_JUDGEMENT'
    elif churn is not None and churn >= .70:
        quality = 'PUBLICATION_GATE_TOO_EARLY_HIGH_PRE_ENTRY_CHURN'
    elif churn is not None and churn >= .50:
        quality = 'PUBLICATION_GATE_REVIEW_RECOMMENDED'
    else:
        quality = 'PUBLICATION_ATTRITION_ACCEPTABLE_FOR_RESEARCH'
    wins=int(buckets.get('WIN',0)); losses=int(buckets.get('LOSS',0)); bes=int(buckets.get('BE',0))
    wl=wins+losses
    loss_rate=losses/wl if wl else None
    if wl < 10:
        activated_quality='ACTIVATED_OUTCOME_SAMPLE_TOO_SMALL'
    elif loss_rate is not None and loss_rate >= .70:
        activated_quality='ACTIVATED_OUTCOME_POOR_HARD_REVIEW_REQUIRED'
    elif loss_rate is not None and loss_rate >= .55:
        activated_quality='ACTIVATED_OUTCOME_WEAK_REVIEW_REQUIRED'
    else:
        activated_quality='ACTIVATED_OUTCOME_NOT_FLAGGED'
    qualified=[x for x in outcomes if x.get('entry_activation_policy')=='ZONE_TOUCH_THEN_FRESH_CLOSED_CANDLE_CONFIRMATION']
    qualified_buckets=Counter(x.get('result_bucket') for x in qualified)
    qualified_activated=sum(1 for x in qualified if x.get('entry_activated'))
    qwin=int(qualified_buckets.get('WIN',0)); qloss=int(qualified_buckets.get('LOSS',0)); qbe=int(qualified_buckets.get('BE',0))
    qresolved=qwin+qloss+qbe
    q_win_rate=round(qwin/(qwin+qloss),4) if (qwin+qloss)>0 else None
    q_nonloss_rate=round((qwin+qbe)/qresolved,4) if qresolved>0 else None
    q_status='R5_11_FORWARD_SAMPLE_BUILDING' if qualified_activated<30 else 'R5_11_FORWARD_SAMPLE_AUDITABLE'
    contextual=[x for x in outcomes if x.get('qualification_generation')=='R5.12_CONTEXTUAL_PLAYBOOK']
    contextual_buckets=Counter(x.get('result_bucket') for x in contextual)
    contextual_activated=sum(1 for x in contextual if x.get('entry_activated'))
    cwin=int(contextual_buckets.get('WIN',0)); closs=int(contextual_buckets.get('LOSS',0)); cbe=int(contextual_buckets.get('BE',0))
    cresolved=cwin+closs+cbe
    c_win_rate=round(cwin/(cwin+closs),4) if (cwin+closs)>0 else None
    c_nonloss=round((cwin+cbe)/cresolved,4) if cresolved else None
    c_status='R5_12_FORWARD_SAMPLE_BUILDING' if contextual_activated<30 else 'R5_12_FORWARD_SAMPLE_AUDITABLE'
    playbook_counts=Counter(x.get('activation_playbook') for x in contextual if x.get('activation_playbook'))
    r513=[x for x in outcomes if x.get('qualification_generation')=='R5.13_CONTEXT_LENS']
    r513_buckets=Counter(x.get('result_bucket') for x in r513)
    r513_activated=sum(1 for x in r513 if x.get('entry_activated'))
    r13w=int(r513_buckets.get('WIN',0)); r13l=int(r513_buckets.get('LOSS',0)); r13b=int(r513_buckets.get('BE',0))
    r13resolved=r13w+r13l+r13b
    r13wr=round(r13w/(r13w+r13l),4) if (r13w+r13l)>0 else None
    r13nl=round((r13w+r13b)/r13resolved,4) if r13resolved else None
    r13status='R5_13_FORWARD_SAMPLE_BUILDING' if r513_activated<30 else 'R5_13_FORWARD_SAMPLE_AUDITABLE'
    r13playbooks=Counter(x.get('activation_playbook') for x in r513 if x.get('activation_playbook'))
    r514=[x for x in outcomes if x.get('qualification_generation')=='R5.14_PATTERN_TOOL_ROUTER']
    r514_buckets=Counter(x.get('result_bucket') for x in r514)
    r514_activated=sum(1 for x in r514 if x.get('entry_activated'))
    r14w=int(r514_buckets.get('WIN',0)); r14l=int(r514_buckets.get('LOSS',0)); r14b=int(r514_buckets.get('BE',0))
    r14resolved=r14w+r14l+r14b
    r14wr=round(r14w/(r14w+r14l),4) if (r14w+r14l)>0 else None
    r14nl=round((r14w+r14b)/r14resolved,4) if r14resolved else None
    r14status='R5_14_FORWARD_SAMPLE_BUILDING' if r514_activated<30 else 'R5_14_FORWARD_SAMPLE_AUDITABLE'
    r14playbooks=Counter(x.get('activation_playbook') for x in r514 if x.get('activation_playbook'))
    r515=[x for x in outcomes if x.get('qualification_generation')=='R5.15_SELF_REVIEW_GUARD']
    r515_buckets=Counter(x.get('result_bucket') for x in r515)
    r515_activated=sum(1 for x in r515 if x.get('entry_activated'))
    r15w=int(r515_buckets.get('WIN',0)); r15l=int(r515_buckets.get('LOSS',0)); r15b=int(r515_buckets.get('BE',0))
    r15resolved=r15w+r15l+r15b
    r15wr=round(r15w/(r15w+r15l),4) if (r15w+r15l)>0 else None
    r15nl=round((r15w+r15b)/r15resolved,4) if r15resolved else None
    r15status='R5_15_FORWARD_SAMPLE_BUILDING' if r515_activated<30 else 'R5_15_FORWARD_SAMPLE_AUDITABLE'
    r15playbooks=Counter(x.get('activation_playbook') for x in r515 if x.get('activation_playbook'))
    r516=[x for x in outcomes if x.get('qualification_generation')=='R5.16_CLOSED_LOOP_LEARNING']
    r516_buckets=Counter(x.get('result_bucket') for x in r516)
    r516_activated=sum(1 for x in r516 if x.get('entry_activated'))
    r16w=int(r516_buckets.get('WIN',0)); r16l=int(r516_buckets.get('LOSS',0)); r16b=int(r516_buckets.get('BE',0))
    r16resolved=r16w+r16l+r16b
    r16wr=round(r16w/(r16w+r16l),4) if (r16w+r16l)>0 else None
    r16nl=round((r16w+r16b)/r16resolved,4) if r16resolved else None
    r16status='R5_16_FORWARD_SAMPLE_BUILDING' if r516_activated<30 else 'R5_16_FORWARD_SAMPLE_AUDITABLE'
    r16playbooks=Counter(x.get('activation_playbook') for x in r516 if x.get('activation_playbook'))
    r517=[x for x in outcomes if str(x.get('qualification_generation') or '').startswith('R5.17')]
    r517_buckets=Counter(x.get('result_bucket') for x in r517)
    r517_activated=sum(1 for x in r517 if x.get('entry_activated'))
    r17w=int(r517_buckets.get('WIN',0)); r17l=int(r517_buckets.get('LOSS',0)); r17b=int(r517_buckets.get('BE',0))
    r17resolved=r17w+r17l+r17b
    r17wr=round(r17w/(r17w+r17l),4) if (r17w+r17l)>0 else None
    r17nl=round((r17w+r17b)/r17resolved,4) if r17resolved else None
    r17status='R5_17_FORWARD_SAMPLE_BUILDING' if r517_activated<30 else 'R5_17_FORWARD_SAMPLE_AUDITABLE'
    r17playbooks=Counter(x.get('activation_playbook') for x in r517 if x.get('activation_playbook'))
    return {
        'version': VERSION, 'profile': profile, 'records': n, 'entry_activated': activated,
        'r511_qualified_records':len(qualified),'r511_qualified_activated':qualified_activated,
        'r511_qualified_result_buckets':dict(qualified_buckets),'r511_resolved_trade_paths':qresolved,
        'r511_win_rate_excluding_be':q_win_rate,'r511_non_loss_rate_including_be':q_nonloss_rate,
        'r511_validation_status':q_status,'r511_minimum_activated_for_judgement':30,
        'r512_contextual_records':len(contextual),'r512_contextual_activated':contextual_activated,
        'r512_contextual_result_buckets':dict(contextual_buckets),'r512_resolved_trade_paths':cresolved,
        'r512_win_rate_excluding_be':c_win_rate,'r512_non_loss_rate_including_be':c_nonloss,
        'r512_validation_status':c_status,'r512_minimum_activated_for_judgement':30,
        'r512_playbook_counts':dict(playbook_counts),
        'r513_records':len(r513),'r513_activated':r513_activated,'r513_result_buckets':dict(r513_buckets),
        'r513_resolved_trade_paths':r13resolved,'r513_win_rate_excluding_be':r13wr,
        'r513_non_loss_rate_including_be':r13nl,'r513_validation_status':r13status,
        'r513_minimum_activated_for_judgement':30,'r513_playbook_counts':dict(r13playbooks),
        'r514_records':len(r514),'r514_activated':r514_activated,'r514_result_buckets':dict(r514_buckets),
        'r514_resolved_trade_paths':r14resolved,'r514_win_rate_excluding_be':r14wr,
        'r514_non_loss_rate_including_be':r14nl,'r514_validation_status':r14status,
        'r514_minimum_activated_for_judgement':30,'r514_playbook_counts':dict(r14playbooks),
        'r515_records':len(r515),'r515_activated':r515_activated,'r515_result_buckets':dict(r515_buckets),
        'r515_resolved_trade_paths':r15resolved,'r515_win_rate_excluding_be':r15wr,
        'r515_non_loss_rate_including_be':r15nl,'r515_validation_status':r15status,
        'r515_minimum_activated_for_judgement':30,'r515_playbook_counts':dict(r15playbooks),
        'r516_records':len(r516),'r516_activated':r516_activated,'r516_result_buckets':dict(r516_buckets),
        'r516_resolved_trade_paths':r16resolved,'r516_win_rate_excluding_be':r16wr,
        'r516_non_loss_rate_including_be':r16nl,'r516_validation_status':r16status,
        'r516_minimum_activated_for_judgement':30,'r516_playbook_counts':dict(r16playbooks),
        'r517_records':len(r517),'r517_activated':r517_activated,'r517_result_buckets':dict(r517_buckets),
        'r517_resolved_trade_paths':r17resolved,'r517_win_rate_excluding_be':r17wr,
        'r517_non_loss_rate_including_be':r17nl,'r517_validation_status':r17status,
        'r517_minimum_activated_for_judgement':30,'r517_playbook_counts':dict(r17playbooks),
        'entry_activation_rate': round(activated / n, 4) if n else None,
        'cancelled_before_entry': pre_cancel, 'expired_unfilled': unfilled_expired,
        'ambiguous_pre_entry': ambiguous_pre, 'pre_entry_churn_rate': round(churn, 4) if churn is not None else None,
        'quality_flag': quality, 'activated_outcome_quality_flag':activated_quality,
        'research_path_wins':wins,'research_path_losses':losses,'research_path_be':bes,
        'research_path_win_rate_excluding_be':round(wins/wl,4) if wl else None,
        'status_counts': dict(counts), 'result_buckets': dict(buckets),
        'win_loss_scope': 'ONLY_ACTIVATED_RESEARCH_ENTRIES; PRE_ENTRY_CANCEL/EXPIRE_ARE_NOT_LOSSES',
        'latest': outcomes[:min(50, len(outcomes))], 'research_only': True, 'orders_sent': 0,
    }


def build_live_signal(store, broker, symbol, profile, cognitive: dict[str, Any] | None = None, asof: int | None = None, live: dict[str, Any] | None = None):
    import time
    asof = int(time.time()) if asof is None else int(asof)
    profile = profile.upper(); cognitive = cognitive or {}; live = live or {}
    rows = store.db.execute(
        'SELECT id FROM signals WHERE broker=? AND symbol=? AND profile=? ORDER BY created_at_utc DESC LIMIT 12',
        (broker, symbol, profile)
    ).fetchall()
    evaluated = []
    for r in rows:
        sig = store.signal(r['id']); out = evaluate_signal(store, sig, asof); evaluated.append((sig, out))

    # Prefer an active/standby research signal.  Terminal history stays history.
    chosen = None
    live_statuses = {'STANDBY_UNFILLED','ZONE_TOUCHED_WAIT_CONFIRMATION','REVIEW_BEFORE_ENTRY', 'ACTIVE_RESEARCH_ENTRY', 'HOLD_BE_ACTIVE', 'HOLD_TRAILING_ACTIVE'}
    for sig, out in evaluated:
        if out.get('status') in live_statuses:
            chosen = (sig, out); break

    if chosen:
        sig, out = chosen
        if out['status'] == 'STANDBY_UNFILLED':
            status = 'STANDBY_FOR_' + sig['side']; instruction = 'WAIT ENTRY ZONE • THEN REQUIRE CLOSED-CANDLE CONFIRMATION • DO NOT CHASE'
        elif out['status'] == 'ZONE_TOUCHED_WAIT_CONFIRMATION':
            status = 'ZONE_TOUCHED_WAIT_' + sig['side'] + '_CONFIRMATION'; instruction = 'ZONE TOUCHED • NO ENTRY YET • WAIT FRESH CLOSED-CANDLE CONFIRMATION'
        elif out['status'] == 'REVIEW_BEFORE_ENTRY':
            status = 'REVIEW_' + sig['side'] + '_SETUP'; instruction = 'SUSPEND ENTRY • RESOLVE REVIEW / STRUCTURE BEFORE ACTIVATION'
        elif out['status'] == 'ACTIVE_RESEARCH_ENTRY':
            status = sig['side'] + '_RESEARCH_ACTIVE'; instruction = 'HOLD STUDY • ORIGINAL SL ACTIVE • WAIT TP1'
        elif out['status'] == 'HOLD_BE_ACTIVE':
            status = sig['side'] + '_HOLD_BE'; instruction = 'HOLD • TP1 PROVED PROGRESS • BE PROTECTION ACTIVE'
        else:
            status = sig['side'] + '_HOLD_TRAILING'; instruction = 'HOLD • TP2 PROVED PROGRESS • TRAILING/PROTECT PROFIT ACTIVE'
        quote_status=str(live.get('quote_status') or '')
        bid=_num(live.get('bid')); ask=_num(live.get('ask'))
        qpx=ask if sig['side']=='BUY' else bid
        live_note=None
        if quote_status=='LIVE_VERIFIED' and qpx is not None:
            if out['status']=='STANDBY_UNFILLED' and float(sig['entry_low']) <= qpx <= float(sig['entry_high']):
                live_note='LIVE QUOTE IS INSIDE ENTRY ZONE; closed-candle activation not yet proven.'
            elif out['status']=='ACTIVE_RESEARCH_ENTRY' and ((sig['side']=='BUY' and qpx>=sig['tp1']) or (sig['side']=='SELL' and qpx<=sig['tp1'])):
                live_note='TP1 is being touched on live quote, but BE remains pending until the closed-candle audit confirms progress.'
            elif out['status']=='HOLD_BE_ACTIVE' and ((sig['side']=='BUY' and qpx>=sig['tp2']) or (sig['side']=='SELL' and qpx<=sig['tp2'])):
                live_note='TP2 is being touched on live quote; trailing upgrades only after closed-candle confirmation.'
        return {
            'version': VERSION, 'profile': profile, 'status': status, 'instruction': instruction,
            'side': sig['side'], 'signal_id': sig['id'], 'published_at_utc': int(sig.get('created_at_utc') or 0),
            'origin_candle_open_utc': int(sig.get('origin_candle_open_utc') or 0), 'activated_at_utc': out.get('activated_at_utc'),
            'entry_zone': [sig['entry_low'], sig['entry_high']],
            'sl': sig['sl'], 'tp1': sig['tp1'], 'tp2': sig['tp2'], 'tp3': sig['tp3'],
            'be_level': out.get('entry_reference') if out.get('tp1_reached_at_utc') else None,
            'trailing_level': sig['tp1'] if out.get('tp2_reached_at_utc') else None,
            'outcome': out, 'live_quote_status': quote_status, 'live_price': qpx, 'live_note': live_note,
            'research_only': True, 'broker_order_sent': False, 'orders_sent': 0,
        }

    tm = cognitive.get('trade_map') or {}
    side = str(tm.get('side') or cognitive.get('bias') or 'NONE').upper()
    zone = tm.get('entry_zone') or []
    if side in ('BUY', 'SELL') and len(zone) == 2:
        return {
            'version': VERSION, 'profile': profile, 'status': 'STANDBY_FOR_' + side,
            'instruction': 'STANDBY ONLY • WAIT PROFESSIONAL GATE / ENTRY CONFIRMATION • DO NOT CHASE',
            'side': side, 'signal_id': None, 'published_at_utc': None, 'origin_candle_open_utc': None, 'activated_at_utc': None, 'entry_zone': zone,
            'sl': tm.get('invalidation_sl'), 'tp1': tm.get('tp1'), 'tp2': tm.get('tp2'), 'tp3': tm.get('tp3'),
            'be_level': None, 'trailing_level': None, 'outcome': None,
            'live_quote_status': str(live.get('quote_status') or ''), 'live_price': (_num(live.get('ask')) if side=='BUY' else _num(live.get('bid'))), 'live_note': None,
            'research_only': True, 'broker_order_sent': False, 'orders_sent': 0,
        }
    return {
        'version': VERSION, 'profile': profile, 'status': 'WAIT_NO_MATURE_SIGNAL',
        'instruction': 'WAIT • NO BUY/SELL PLAN IS MATURE ENOUGH TO DISPLAY', 'side': 'NONE',
        'signal_id': None, 'published_at_utc': None, 'origin_candle_open_utc': None, 'activated_at_utc': None, 'entry_zone': [], 'sl': None, 'tp1': None, 'tp2': None, 'tp3': None,
        'be_level': None, 'trailing_level': None, 'outcome': None,
        'research_only': True, 'broker_order_sent': False, 'orders_sent': 0,
    }
