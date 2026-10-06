# GoldFlow V8.1.1 — GF AI Study / News / Online Market (staging only)

## Change control

- Branch: `staging/v8-1-ai-confirmation-market-online`; baseline `b045fa836b8865213db3dfb16222093489ec16db`.
- No main merge, Vercel Production deployment, billing changes, cloud migration or MT5 order execution is authorised by this change.
- Six protected indicator engines and Fund Structure A v1.04 remain unchanged.
- `GF-AI` is a transparent deterministic **rule-based** multi-factor analyst. It is NOT a trained neural model or independently calibrated trading probability.

## UI modes

Select `GF-AI Live Analyst`, `GF-News Impact Pro` or `GF-Market Study Pro` via the existing indicator selector; the AI Study tab opens. Original indicators continue to use /api/analyze.

The new /api/study returns the following exclusive research states:

| State | Trigger | Trading-UI decision |
| --- | --- | --- |
| WAIT_CONFIRMATION | No eligible closed trigger candle | NO ENTRY |
| WAIT_CONFLICT | Pattern conflicts with current H1/H4 or verified macro | WAIT |
| BUY_CONFIRMED / SELL_CONFIRMED | Eligible candle **closed**, source/HTF validated | WAIT RETEST; NO ENTRY YET |
| BUY_ENTRY_READY / SELL_ENTRY_READY | Confirmed setup, fresh BID/ASK inside original entry band | ENTRY READY; **study only**, never execute |
| MISSED_ENTRY | Quote travelled past safe entry band by >0.5 ATR | NO CHASE |
| BUY_INVALID / SELL_INVALID | Later closed candle exceeds original invalidation **or** live quote breaches it | NO ENTRY; label CLOSE vs INTRABAR_QUOTE |
| EXPIRED | >3 subsequent closed trigger candles, no new eligible confirmation | NO ENTRY |
| MARKET_OFFLINE | Tick age >35s, missing quotes, or stale closed bar | NO ENTRY |
| DATA_UNVERIFIED | Insufficient candles, invalid UTC offset, or required macro data unavailable | NO ENTRY |

### Calculation safeguards

- Vantage account's verified broker-candle/tick UTC offset is set by the existing `VANTAGE_TICK_UTC_OFFSET_SECONDS` (default +10800). No new credentials.
- Trigger candidate uses **fully closed** selected-TF bars only (the current forming bar is excluded). Confirmation checks a closed-candle breakout/breakdown or meaningful demand/supply rejection, directional EMA, current H1/H4 context and (for Gold AI/News mode) full official macro quality.
- Current macro observations are contemporaneous context only; never pretend this is a point-in-time historical news backtest. No actual-vs-consensus surprise is asserted without independently verified event/release time AND provider forecast. The 12-month Macro Regime remains a separate engine.
- A SELL entry must use fresh Vantage BID; BUY uses fresh ASK. Price within a zone alone cannot create BUY/SELL CONFIRMED.
- Entry plan and invalidation freeze from the confirmation candle. TP1/2/3 are hypothetical 1R/2R/3R price targets; slippage, fees and actual fills not represented.
- Rechecks calculate the current review over the latest five closed trigger bars; persistent immutable proof/forward ingestion is NOT enabled by this staging feature.

## Weekend market categories

- `MARKET ONLINE`: up to 90 tradable symbols scanned from the actual broker catalog, prioritized by category; exact-name resolved fresh tick <=35s + valid BID/ASK + tradeMode 1, 2 or 4 required.
- `MARKET 24H • Weekend verified`: subset proven fresh **NOW on a Malaysia-time Saturday or Sunday**. This is NOT a contract saying a symbol trades every future minute.
- Partial scan coverage is explicit; never label unsampled instruments CLOSED or 24/7, and never equate CRYPTO classification to guaranteed online status.
- Original asset categories remain available.

## Files

`api/_studyEngine.js` pure testable state machine, `api/study.js` broker/macro adaptor, `api/market-online.js` current-market validator, `study-ui.js` live UI controller; additive `index.html`, `app.js`, `style.css`, `tests/gf-study.test.mjs`.

## Acceptance gate before release

1. Run `npm test`; `node --check app.js study-ui.js`; assert protected six source files unchanged.
2. Verify API /api/study in each mode on LIVE MT5 source and both a valid and stale quote. Confirm at M5/M15/H1 in representative BUY/SELL scenarios.
3. Confirm transition WAIT → BUY/SELL CONFIRMED → ENTRY READY, followed by INVALID/MISSED/EXPIRED; do not mistake zone touch for confirmation. Validate broker clock/timezone and closed candle under weekend downtime.
4. Test market-online freshness on Saturday/Sunday; report scan limit, spread, tradeMode and exact symbol aliases.
5. Cross-check /api/macro 16/16 quality if available, news timestamps and no actual-vs-forecast claims without authenticated source.
6. Mobile browser QA, monthly API/CPU budget and Cloudflare migration compatibility. No Production release until user approval.

> All statuses are conditional research, not guaranteed GOLD direction. User controls every trade.
