# GF-AI v1.50 — Live Management + Recovery Brain

## Goal

Extend the v1.40 Professional Trader Playbook beyond entry selection into a complete observed research lifecycle:

ENTRY READY → ACTIVE → PROTECT → TAKE PARTIAL → CUT / COMPLETE → WAIT RECOVERY → RECOVERY READY.

This is a browser-observed research lifecycle. It is not proof that a broker order was opened or filled.

## High-conviction setup

A++ is a quality tier, not a 90% win probability.

A++ requires a very high confluence score plus:
- valid structural risk geometry,
- TP1 reward/risk of at least 1.15R,
- at least two market-location overlaps,
- no unqualified countertrend condition,
- directional scenario not NO_TRADE.

The web must never convert A++ into a guaranteed percentage claim.

## Live management

The lifecycle may output:
- HOLD PLAN
- PROTECT / BE REVIEW after at least +0.5R
- TAKE PARTIAL / PROTECT after TP1
- LOCK PROFIT / MANAGE RUNNER after TP2
- TAKE PROFIT / COMPLETE after TP3
- CUT SETUP when structural invalidation is crossed
- CUT • THESIS FLIPPED only when a different A-grade idea confirms in the opposite direction with a fresh structural trigger

A newer WAIT state alone does not cancel a stored active idea.

## Recovery Brain

Recovery begins only after a stored CUT_LOSS terminal event.

A recovery candidate must:
- have a different Trade Idea ID,
- be A, A+ or A++,
- pass the Professional Trader Playbook quality gate,
- wait for its own entry-ready retest before RECOVERY_READY.

Recovery always resets to NORMAL risk. Martingale, loss-chasing, doubling size and full-margin recovery are explicitly forbidden.

## Safety

No automatic MT5 execution is added.
No claim of copied ChatGPT internals is made.
No trained-ML win probability is claimed.
