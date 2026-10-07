# GF-AI Live Analyst v1.30 — Reasoning + Scenario + Learning

## Purpose

GF-AI v1.30 is an auditable research engine designed to behave more like a disciplined market analyst without claiming to copy an LLM model, produce trained-ML probabilities, or execute trades.

## Decision stack

1. Vantage broker CLOSED candles only.
2. M1, M5, M15, M30, H1, H4 and D1 Market Brains.
3. Market structure: HH/HL/LH/LL, BOS, CHOCH.
4. Liquidity: sweeps, equal highs/lows.
5. SND/SNR/SBR/RBS, order block, FVG.
6. Chart/candle patterns and market regime.
7. Verified Gold macro as context when available.
8. Experience Learning calibration from prior closed broker candles.
9. Scenario Reasoning compares BUY, SELL and NO_TRADE.
10. Selected timeframe owns entry/retest/SL/TP geometry.

## Scenario Reasoning

Every AI response may expose three independent scenarios:

- BUY
- SELL
- NO_TRADE

The engine names a PRIMARY scenario and an ALTERNATIVE scenario and publishes:

- evidence supporting each direction,
- contradictory evidence,
- candidate entry model,
- invalidation,
- what would change the AI's mind.

NO_TRADE is a first-class decision. It is not treated as a failure to produce a signal.

## Experience Learning

Experience Learning is retrospective and deterministic.

For prior detectable structural/candle events on the selected timeframe, the engine measures whether price reached +1 ATR before -0.75 ATR within a fixed closed-bar horizon.

This metric is called **directional follow-through**. It is NOT:

- a trade simulation,
- a win rate,
- a trained ML probability,
- forward proof,
- evidence of broker execution.

A learning adjustment is applied only after at least 5 decidable historical samples and is capped at +/-5 confluence points. It cannot override stale broker data, structural invalidation, ambiguous OHLC paths, low timeframe coverage, or completed/expired setups.

## Entry ownership

All seven timeframes provide context, but only the selected timeframe is permitted to create the active entry/retest geometry. This prevents seven independent timeframes from generating conflicting simultaneous trade plans.

## Fibonacci

Fibonacci is optional overlap evidence only. It never creates a setup.

## Safety

GF-AI remains research-only. No automatic MT5 order is placed.
