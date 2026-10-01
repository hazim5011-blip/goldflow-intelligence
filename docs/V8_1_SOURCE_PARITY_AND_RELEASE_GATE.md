# GoldFlow V8.1 source parity & release gate (2026-10-02)

## Inputs examined

1. `XAU_Pattern_Zone_Tutor_v1.32(2).mq5`: 2,250 source lines; SHA256 `8d9c133985da46aec8b02e6387a1dd1f5835b61b459af968e72117209bfd8e10`. Native source comment explicitly says signals are from CLOSED candles; WATCH yellow, VALIDATED buy green, VALIDATED sell red.
2. `XAUUSD_FUND_STRUCTURE_A_SIGNAL_v1.04_LIVE_STUDY(1).mq5`: 4,809 source lines; SHA256 `9c3f5963c02ecf7a9468cef8f47c45cea4ec4b2e7e3c2d666e363a5b3e94ce13`. Native source declares six indicator buffers, six plots and optional live pre-close B/S study. Source reviewed locally; not added to the public repository.

## Existing native/web engines

- Retain the six original `_indicator105.js`, `_indicator103.js`, `_indicatorPVT102.js`, `_indicatorPattern132.js`, `_indicatorSND107.js`, `_indicatorOWL101.js` unchanged.
- Pattern Zone Tutor 1.32 already has a web research port; do not duplicate an identical indicator selector. Native UI arrows/Fibonacci objects and exact every-parameter parity are not claimed.
- New seventh indicator selector: Fund Structure A 1.04 **WEB STUDY SUBSET**, `api/_indicatorFund104.js`; Vantage MT5 broker OHLC from `/multi-bars`. It does not read iCustom buffer 0..5 from MT5. Source/native MQL5 files need MetaEditor compilation and comparison using the same broker candles.

## Native grading specifics checked

- MQL5 lines 166-185: RSI (14, PRICE_CLOSE), bullish 53-70 / bearish 30-48, Stoch (5,3,3 SMA LOWHIGH).
- MQL5 lines 188-212 and 1973-1992: DXY, 2Y, 10Y directional macro; grades A >=60, A+ >=70, A++ >=85, plus A++ hard requirements for RSI, Stoch, >=2 verified fundamental components and trend by default.
- MQL5 lines 4116-4138: location 25 (or support/resistance 20), structure 15, pattern strength 8/12/15, RSI +10, stochastic +10, fundamental 0/5/10/15, local swing +5, HTF +5.
- Web study uses source-aligned Wilder-smoothed RSI, default Stoch price/ranges, candle bodies with >= 0.85 engulf strength, local confirmed pivot trend depth 3 and two pre-close-excluded higher trend frames. It has no verified historical point-in-time macro input, no MQL5 source-level 1:1 pattern toggle set, no native iCustom buffers and no complete scalp sequence engine. Accordingly no A++ grade is published, even if raw web factors might add to >=85.
- MQL5 lines 2403-2453: default invalidation is **later CLOSED candle crossing signal wick +/- 0.05 ATR**, not wick-only touch. Web currently uses that default to remove invalidated patterns from the current research view. Native can change mode via inputs; web study does not expose this toggle.
- Historical study is VALID_ONLY with null TP1/TP2 and no invented win rate, USD P/L or executed order. Historical reconstruction is not contemporaneous signal publication proof.

## UI additions

- Blog posts: published bilingual MS/EN static release notes under `/blog/posts.json`; unsupported locales fall back to English text (locale/RTL preferences remain supported by the rest of V8). Article content is authored; no fabricated signal evidence.
- News: HIGH/MEDIUM/LOW describe **typical event-class potential**, not realized volatility. US2Y/US10Y and similar rate prints are MARKET CONTEXT, not verified real-time scheduled news. Original no-lookahead rule remains: unavailable forecast/consensus or exact release timestamp => N/A.
- Live Trade button = chart-view shortcut only. No MT5 order endpoint is added. PENDING = entry zone marked on Vantage broker chart; LIVE ENTRY means fresh broker BID (SELL) or ASK (BUY) lies within source zone. On missing/old (>30s at API and >15s locally) ticks, label QUOTE OFFLINE instead of claiming LIVE.

## Testing gate

- GitHub V8 CI ensures the protected six original engines remain byte-identical to baseline and deployable Vercel functions <=12; JS syntax, bridge Python syntax, core/feature unit tests.
- Added mock broker transport tests: Fund104 `/api/analyze` routing, /status?lite=1 data validation, mismatched symbol fails closed, absent or old quote fails closed, Wilder RSI deterministic fixture, later closed-candle invalidation, last-forming candle and HTF lookahead regression, VALID_ONLY history, Blog/Impact integration tests.
- Preview may require Vercel Authentication. A READY deployment alone is NOT an authenticated public API smoke pass.
- **Still required before parity claim:** actual MetaEditor compile report and side-by-side source-buffer/chart comparison on the same Vantage symbol, timeframe and exact candle-close timestamps, for both .mq5 attachments; live browser checks for 22 locale/RLT, chart interactions and mobile. Do not promise zero defects or 100% MQL5 equivalence on CI evidence alone.

## Operations

- Keep `BROKER_BRIDGE_KEY` server-side, use only named tunnel `bridge.hazim5011.com`, avoid old trycloudflare.com Quick Tunnel; DO NOT change user PC watchdog or Windows services in this feature release.
- No changes to order execution or account credentials.


## Live Vantage smoke after hotspot recovery (2026-10-02 MYT)

Production Named Tunnel returned `MT5 LIVE` from VantageMarkets-Live 3. Read-only Production `/api/bars` supplied real XAUUSD247 broker OHLC/quotes to the staging engine without exposing bridge credentials.

- Fund Structure v1.04 WEB STUDY: processed 400 M5 + 550 H1 + 550 H4 Vantage bars with `ready:true`; current BUY/SELL research zones were PENDING at the sampled quote; latest candidate remained WATCH and therefore was not promoted to Live Trade. No TP1/TP2, synthetic win/loss or A++ was published.
- Pattern Zone Tutor v1.32: processed 500 M5 + 500 M15 + 500 H1. A VALID RBS Retest BUY zone contained the current ASK and qualified as LIVE ENTRY. A WATCH Double Top SELL zone also contained the current BID but **must remain IN ZONE • WATCH**, never Live Trade.
- UI release rule: PENDING = display entry range on broker chart; price-inside WATCH = `IN ZONE • WATCH` without Live Trade button; price-inside eligible/validated zone = `LIVE ENTRY` + `LIVE TRADE • VIEW CHART`. This button is a chart-view action and never submits an MT5 order.
- Broker quote rule remains fail-closed: BUY uses fresh ASK, SELL uses fresh BID; wrong-symbol, missing, stale or invalid broker ticks cannot produce LIVE ENTRY.
