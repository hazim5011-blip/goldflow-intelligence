# MQ5 Source Audit — Pattern Zone Tutor v1.32 + PVT Chart Confluence v1.01

## User-supplied source hashes

- `XAU_Pattern_Zone_Tutor_v1.32(3).mq5`
  - SHA-256: `8d9c133985da46aec8b02e6387a1dd1f5835b61b459af968e72117209bfd8e10`
- `PVT_Chart_Confluence_XAU_v1.01(1).mq5`
  - SHA-256: `3b5da1134a2d7233933b3dfcd74a578d1c23daba2bd2152ca24732de341b362d`

## Pattern Zone Tutor v1.32

The existing protected web engine `api/_indicatorPattern132.js` already reflects the uploaded v1.32 core rule set:

- closed-candle only;
- Bull/Bear Engulfing;
- Hammer / Shooting Star;
- Double Top / Bottom;
- RBS / SBR retest;
- Bull / Bear flag;
- location + liquidity sweep + continuation scoring;
- auto higher-TF trend contribution;
- pressure filter;
- watch -> confirmation -> valid lifecycle;
- supply / demand visual zones;
- touch / age / invalidation cleanup.

Important source limitation: the uploaded MQ5 defines a **validation zone**, not a native executed trade with TP/SL outcome. History Pro may build a separately labelled normalized study plan, but it must never be claimed as the native Pattern Tutor TP.

The protected engine is therefore not duplicated or rewritten.

## PVT Chart Confluence XAU v1.01

This is materially different from the existing PVT v1.02 engine and is added as a new independent engine.

Source logic ported:

- current selected chart TF only;
- SMA 20 / 50 / 100;
- Ichimoku 9 / 26 / 52;
- RSI 14;
- MACD 12 / 26 / 9 histogram;
- PRT-style Momentum 12 = close difference, not a ratio;
- breakout or SMA20 pullback gate;
- minimum candle body ATR gate;
- distance from SMA20 gate;
- confluence score threshold 72/100;
- rejection-wick guard;
- previous structure room / confirmed break guard;
- next-candle continuation entry beyond the signal high/low by 0.10 ATR;
- local-swing / ATR stop;
- next-bar gap cancellation;
- TP1 = 1.0R, TP2 = 1.8R, TP3 = 3.0R;
- BE at 50% of TP1 distance with +0.05R lock;
- trailing begins after a close at 1.0R;
- trail distance = 0.50R; minimum step = 0.10R;
- maximum holding period = 96 bars;
- source semantics: stop is evaluated before TP3 on an ambiguous OHLC bar.

No broker order is sent by the web port.

## Bridge error audit

Production logs on 2026-10-08 16:21 UTC showed:

- `GET /api/bridge-health`
- transport error: `This operation was aborted`
- error code `20`

This is a timeout/transport symptom between Vercel -> Cloudflare named tunnel -> local MT5 bridge, not an indicator calculation error.

Changes in this branch:

- classify AbortError/code 20 as `BRIDGE_TIMEOUT`;
- classify Cloudflare 520-524/origin failures as `BRIDGE_TUNNEL_ORIGIN_UNAVAILABLE`;
- do not show raw Cloudflare origin HTML/text to the trader;
- stop showing a stale green `MT5 LIVE` chip after bridge loss;
- use bounded retries/timeouts to avoid long request cascades;
- serialize heavy History indicator comparisons to reduce pressure on the local bridge.
