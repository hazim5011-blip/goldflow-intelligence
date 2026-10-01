# GoldFlow V8 source/parity audit — 2 October 2026

## Scope and provenance
The user uploaded two private MT5 indicators. Keep the original MQL5 source private; do **not** upload the 4809-line original into a public GitHub repository without separate permission.

| Source file | Lines | SHA256 | Website status |
| --- | ---: | --- | --- |
| XAU_Pattern_Zone_Tutor_v1.32(2).mq5 | 2250 | 8d9c133985da46aec8b02e6387a1dd1f5835b61b459af968e72117209bfd8e10 | Existing `pattern132` web engine retained; no duplicated seventh copy |
| XAUUSD_FUND_STRUCTURE_A_SIGNAL_v1.04_LIVE_STUDY(1).mq5 | 4809 | 9c3f5963c02ecf7a9468cef8f47c45cea4ec4b2e7e3c2d666e363a5b3e94ce13 | New `fund104` conservative web-study subset, not native 1:1 |

## Verified source v1.32
Native MQL5 uses closed candles, WATCH/VALID zone states, engulfing/pin/Double Top-Bottom/RBS-SBR/Flag patterns, pressure, SND and native Fibonacci drawing. Existing JS `_indicatorPattern132.js` already provides selected pattern/zone scoring. Native Fibonacci chart objects and all source options are *not* certified 1:1.

## Fund Structure v1.04 native source features
The uploaded file contains six hidden indicator buffers (basic BUY/SELL, VALID BUY/SELL, RBS BUY/SBR SELL); many candle patterns, structure, SND, RBS/SBR, RSI, Stochastic, DXY and FRED yields, historical A/A+/A++, scalp B/S + S/S, pre-close LIVE score, xBx/xSx invalid-study markers, optional MT5 news and Telegram event bus.

The browser has no MetaTrader iCustom/ChartObject interface; Python MetaTrader5 does not expose native chart indicator buffers automatically. The web port MUST NOT be described as identical to the native source.

### Implemented in staging WEB STUDY
- Per-selected-trigger-TF broker OHLC, closed-candle only, strict no use of forming candle in confirmed history.
- Selected candlestick patterns, recent SND demand/supply bands, sweep, BOS/CHoCH, RSI14, Stochastic5/3/3, HTF EMA50/200 as-of confirmed H1/H4 bar.
- Source-aligned A/A+ threshold concept (60/70) with conservative lower score when macro is absent.
- No historical trade outcomes: `VALID_ONLY`, TP/SL win-rate unavailable. Expired latest historical signal is not presented as active.
- Explicit limitations included in `indicator.studyCoverage` and `indicator.limitations` API.
- No implied forex lot execution and no auto order.
- No verified FRED/DXY as-of historical archive; A++ hard disabled.

### Not yet native-equivalent
- Full 40+ pattern switch matrix and exact native shapes; full RBS/SBR sequence/retest code; pre-close realtime study + xBx/xSx persistence; Telegram; live economic calendar; native graphical trendlines/engulfing boxes; exact Native vs Web deterministic score parity.
- Native MQL5 compilation in MetaEditor (not available in this code execution environment) and Windows/phone browser QA need separate checks. Source delimiter sanity scans do NOT replace MetaEditor compilation.

## UI rules
- BUY zone uses live Vantage ASK, SELL zone uses live Vantage BID, tick freshness max 15 seconds.
- PENDING means the quote has not entered the entry range, showing dashed entry bounds on Broker Chart, without a live-action button.
- LIVE TRADE • VIEW CHART is **display-only**; it opens an active chart marker when price is inside zone. This is not a broker position/order. When quote is unavailable, show QUOTE OFFLINE instead of a false LIVE ENTRY.
- News HIGH/MEDIUM/LOW categories denote typical potential. Yield/DXY snapshots use MARKET CONTEXT. Without verified releasedAtUTC or source forecast: do not create a surprise or causal assertion.
- Blog posts are static reviewed release notes; published with a commit rather than dynamically generated forecasts.

## Release gates
1. Node syntax, six protected indicator files unchanged, Hobby/Pro serverless function count and Python bridge syntax — GitHub CI.
2. New unit tests for news impact, no-lookahead, validation-only history, blog provenance and pending/live chart action.
3. Preview browser/API smoke tests + native MetaEditor compile and parity before claiming full native indicator equivalence.
4. Protect current Production (main) and MT5 Permanent Tunnel until verified acceptance.
