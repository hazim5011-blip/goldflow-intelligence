# GF-AI v1.60 — Adaptive Entry Intelligence

## Why this version exists

Previous GF-AI versions could identify direction and market structure but could still become ENTRY READY too early because a live quote touching a valid zone was treated too generously.

v1.60 changes the ENTRY itself.

**ZONE IS NOT ENTRY.**

A selected-timeframe thesis/zone must be followed by a fresh CLOSED retest/rejection/reclaim on an execution timeframe before ENTRY READY is permitted.

## Gold Motion Profile

The latest closed Vantage candles are continuously classified by:
- directional efficiency,
- candle-range overlap,
- net movement measured in ATR,
- abnormal volatility spike.

Possible motion states:
- IMPULSE_UP
- IMPULSE_DOWN
- DRIFT_UP
- DRIFT_DOWN
- CHOP
- VOLATILITY_SPIKE
- BALANCED

This is deterministic live market-state adaptation, not trained ML.

## Adaptive entry environments

GF-AI chooses the entry model from current price action:
- SWEEP_CHOCH_REVERSAL
- LIQUIDITY_SWEEP_RECLAIM
- COMPRESSION_BREAK_RETEST
- CHOCH_REVERSAL_RETEST
- TREND_BOS_PULLBACK
- BREAKOUT_RETEST
- TREND_PULLBACK
- RANGE_EDGE_ONLY

The model then selects the best market-derived precision zone from:
- RBS / SBR
- confirmed pattern neckline
- order block
- FVG
- demand / supply

Overlapping zones receive preference. Excessively wide zones are reduced to a precision segment.

## Professional execution ladder

The selected timeframe owns the thesis and zone. A lower timeframe is used only to validate the same parent Trade Idea:

- D1 setup -> H1 execution
- H4 setup -> M30 execution
- H1 setup -> M15 execution
- M30 setup -> M5 execution
- M15 setup -> M5 execution
- M5 setup -> M1 execution
- M1 setup -> M1 execution

This does not create duplicate trades.

## CLOSED entry proof

After the setup candle closes, the execution timeframe must:
1. reach the selected precision zone,
2. avoid a failed close through the zone,
3. produce a directional CLOSED rejection or displacement,
4. reclaim the setup-specific activation level,
5. remain fresh,
6. keep current broker price inside a narrow anti-chase execution band.

Possible states include:
- WAIT_FIRST_RETEST
- ZONE_TOUCHED_WAIT_CLOSED_REJECTION
- RETEST_FAILED_CLOSED_THROUGH_ZONE
- RETEST_CONFIRMATION_STALE
- RETEST_CONFIRMED_WAIT_PRICE
- RETEST_CONFIRMED_BUT_CHASED
- RETEST_CONFIRMED_ENTRY_WINDOW

Only RETEST_CONFIRMED_ENTRY_WINDOW can pass the v1.60 entry-proof gate.

## Stop logic

The stop is tied to the closest relevant structural invalidation:
- sweep extreme for sweep-reversal models,
- otherwise nearest valid order-block / demand-supply / swing boundary,
- with an ATR buffer.

Plans with abnormally tiny or excessively wide structural risk are rejected.

## Range / chop protection

If Gold is classified as CHOP / RANGE, a directional plan is blocked unless a liquidity sweep in the intended direction exists.

## Safety

- No blind zone-touch entry.
- No chase after displacement.
- No full-margin automation.
- No martingale.
- No trained-ML probability claim.
- No automatic MT5 execution.
