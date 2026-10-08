# Pattern Zone Tutor v1.32 — Source Parity Audit

Baseline: GoldFlow Intelligence V8.1.4, production commit `338c3ac212814c94586e728a1799aa2e024890c0`, handoff commit `a10398601c61f966bf2fb101535202d82ea04bdb`.

MQ5 source audited: `XAU_Pattern_Zone_Tutor_v1.32(3).mq5`, SHA256 `8d9c133985da46aec8b02e6387a1dd1f5835b61b459af968e72117209bfd8e10`.
Protected web engine: `api/_indicatorPattern132.js`.

## Default-case parity confirmed

The protected web engine preserves the core closed-candle Pattern Tutor logic for the currently supported M1–D1 web profiles: bullish/bearish engulfing, hammer/shooting star, double bottom/top, RBS/SBR retests, bull/bear flags, location/liquidity gates, confirmation window, score composition, pressure filter, pattern-zone lifecycle, and supply/demand-zone lifecycle.

The web AutoTrend profile also maps the source defaults correctly for supported trigger timeframes: M1/M5 → M15/H1, M15 → H1/H4, M30/H1 → H4/D1, H4 → D1/W1, D1 → W1/MN1.

## Confirmed parity gaps

1. **Auto Fibonacci is absent from the protected web engine.** MQ5 default settings are depth 3, lookback 180 and minimum swing 1.5 ATR. It is chart/display logic and does not participate in Pattern candidate scoring or zone validation.
2. **MT5-only presentation is not fully reproduced.** This includes native chart objects, dashboard/buttons, exact arrow/label placement, SND rectangles and Fibonacci object/anchor labels.
3. **History scan differs.** MQ5 default `InpHistoryScanBars=100`; protected web engine reconstructs from up to 180 trigger bars. This can change reconstructed historical/active zones even when per-bar rules are otherwise equivalent.
4. **Inputs are fixed to source defaults on web.** MQ5 exposes pattern, validation, pressure, SND, AutoTrend/manual trend and AutoFibo controls; protected web engine currently hard-codes the default values.
5. **SND edge boundary differs by `_Point`.** MQ5 forces a one-point minimum body boundary when constructing supply/demand zones. The protected web engine does not currently apply this point floor.
6. **Volume branch differs when real volume exists.** MQ5 can prefer `real_volume` for the current pressure bar; the bridge currently transports `tick_volume` only. The web path therefore follows the MQ5 tick-volume fallback.
7. **Selected W1/MN1 trigger mode is not exposed by the web analyze profile.** Those frames can still be used as higher-timeframe context for lower trigger frames.
8. **GoldFlow historical outcome reconstruction is not native Pattern Tutor trade management.** Pattern v1.32 is a zone/pattern tutor; GoldFlow derives an auditable research entry/invalidation and normalized outcome model separately.

## Auto Fibo source-parity helper

`api/_pattern132AutoFibo.js` is intentionally separate from the protected engine. It ports the MQ5 confirmed-swing search, ATR size gate, BUY/SELL anchor orientation, MARK 0 invalidation rule, closed-candle behavior and all 21 Fibonacci levels/labels. It does not alter Pattern signals or scores.

Unit tests cover:
- exact 21 source levels and labels;
- BUY anchor orientation;
- SELL anchor orientation;
- forming-candle invariance;
- MARK 0 invalidation.

## Migration and validation plan

1. Keep `_indicatorPattern132.js` unchanged until parity additions are validated independently.
2. Integrate the Auto Fibo helper as display-only data returned beside the Pattern result; never feed it into score, confirmation or signal direction unless a future MQ5 version explicitly does so.
3. Render the 21 levels on the broker chart using existing chart tooling, while keeping Vantage MT5 as the calculation source of truth.
5. Address signal-affecting source-parity gaps one at a time, beginning with the SND `_Point` floor and history-scan equivalence. Each change requires a regression test proving the old protected behavior remains stable outside the intended parity correction.
6. Do not validate or merge against stale/public prices. Run fresh XAUUSD247 parity checks only after the local Vantage bridge and named Cloudflare tunnel are healthy.
7. Preserve fail-closed behavior, closed-candle rules, ambiguity handling, read-only research and no broker auto-execution.

## Release guard

This audit/helper branch is not production authorization. Do not merge or promote while the live broker bridge is offline. After bridge recovery, validate `pvtchart101` and Pattern v1.32 against fresh Vantage XAUUSD247 candles before production integration.
